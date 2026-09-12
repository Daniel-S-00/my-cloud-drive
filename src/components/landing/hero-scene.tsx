'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { WebGLRenderer } from 'three';
import {
  NOVA_QUALITY_TIERS,
  buildNovaAttributes,
  pickQualityTier,
} from '@/lib/nova-geometry';
import { resolveNovaPalette } from '@/lib/nova-palette';
import {
  assertNovaShaderAnchors,
  patchNovaFragment,
  patchNovaVertex,
} from '@/lib/nova-shader';
import {
  isWebglCapable,
  readDeviceHints,
  subscribeWebglCapability,
} from '@/lib/webgl-capability';

type ThreeModule = typeof import('three');

const CAMERA = { fov: 55, near: 1, far: 200, x: 0, y: 3.2, z: 24 } as const;
const PARALLAX = { horizontal: 1.6, vertical: 1, damping: 0.045 } as const;
const POINT_BASE_SIZE = 0.14;
const MAX_PIXEL_RATIO = 2;
const MAX_FRAME_STEP = 0.1;
const IDLE_TIMEOUT_MS = 1200;
const IDLE_FALLBACK_MS = 200;

// useSyncExternalStore wants stable references; the constant server
// snapshot is what SSR renders, and the real value swaps in after
// hydration so there is no markup mismatch.
const getCapableSnapshot = () => isWebglCapable();
const getServerSnapshot = () => false;

function deferUntilIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(handle);
}

/**
 * Builds the scene and returns its disposer. Throws only if three's
 * shader chunks no longer match our anchors — a porting bug, not a
 * missing GPU.
 */
function mountScene(
  THREE: ThreeModule,
  renderer: WebGLRenderer,
  container: HTMLElement,
): () => void {
  const width = Math.max(1, container.clientWidth);
  const height = Math.max(1, container.clientHeight);

  renderer.setClearAlpha(0);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(width, height);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    width / height,
    CAMERA.near,
    CAMERA.far,
  );
  camera.position.set(CAMERA.x, CAMERA.y, CAMERA.z);
  camera.lookAt(0, 0, 0);

  const { positions, sizes, shifts } = buildNovaAttributes(
    NOVA_QUALITY_TIERS[pickQualityTier(readDeviceHints())],
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('sizes', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('shift', new THREE.BufferAttribute(shifts, 4));

  const palette = resolveNovaPalette(document.documentElement);
  const uniforms = {
    time: { value: 0 },
    uColorCore: { value: new THREE.Vector3(...palette.core) },
    uColorMid: { value: new THREE.Vector3(...palette.mid) },
    uColorDeep: { value: new THREE.Vector3(...palette.deep) },
  };

  const material = new THREE.PointsMaterial({
    size: POINT_BASE_SIZE,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = patchNovaVertex(shader.vertexShader);
    shader.fragmentShader = patchNovaFragment(shader.fragmentShader);
  };

  const points = new THREE.Points(geometry, material);
  points.rotation.order = 'ZYX';
  points.rotation.z = 0.22;
  scene.add(points);

  let pointerX = 0;
  let pointerY = 0;
  let cameraX = CAMERA.x;
  let cameraY = CAMERA.y;
  let elapsed = 0;
  let lastTime = 0;
  let running = false;

  const renderFrame = () => {
    const now = performance.now();
    const delta =
      lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, MAX_FRAME_STEP);
    lastTime = now;
    elapsed += delta * 0.5;

    uniforms.time.value = elapsed * Math.PI;
    points.rotation.y = elapsed * 0.05;

    cameraX += (pointerX * PARALLAX.horizontal - cameraX) * PARALLAX.damping;
    cameraY +=
      (CAMERA.y - pointerY * PARALLAX.vertical - cameraY) * PARALLAX.damping;
    camera.position.set(cameraX, cameraY, CAMERA.z);
    camera.lookAt(0, 0, 0);

    renderer.render(scene, camera);
  };

  const play = () => {
    if (running) return;
    running = true;
    // Drop the frame that spans the pause so the scene resumes smoothly.
    lastTime = 0;
    renderer.setAnimationLoop(renderFrame);
  };

  const pause = () => {
    if (!running) return;
    running = false;
    renderer.setAnimationLoop(null);
  };

  const resize = () => {
    const nextWidth = container.clientWidth;
    const nextHeight = container.clientHeight;
    if (nextWidth === 0 || nextHeight === 0) return;
    camera.aspect = nextWidth / nextHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(nextWidth, nextHeight);
  };

  const onPointerMove = (event: PointerEvent) => {
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    pointerY = (event.clientY / window.innerHeight) * 2 - 1;
  };

  const onVisibilityChange = () => {
    if (document.hidden) pause();
    else play();
  };

  const onContextLost = (event: Event) => {
    event.preventDefault();
    pause();
  };

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  const intersectionObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    if (entry.isIntersecting && !document.hidden) play();
    else pause();
  });
  intersectionObserver.observe(container);

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);
  renderer.domElement.addEventListener('webglcontextlost', onContextLost);

  // Attached last: if anything above throws, no orphan canvas is left in
  // the DOM for the error path to clean up.
  container.appendChild(renderer.domElement);
  play();

  return () => {
    pause();
    resizeObserver.disconnect();
    intersectionObserver.disconnect();
    window.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    // dispose() does not release the context itself; without this, dev
    // StrictMode double-mounts and HMR would exhaust the browser's
    // WebGL context budget over a session.
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}

export default function HeroScene() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const capable = useSyncExternalStore(
    subscribeWebglCapability,
    getCapableSnapshot,
    getServerSnapshot,
  );

  useEffect(() => {
    if (!capable) return;

    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let disposeScene: (() => void) | undefined;

    const start = async () => {
      try {
        const THREE = await import('three');
        if (cancelled) return;

        assertNovaShaderAnchors(
          THREE.ShaderChunk.points_vert,
          THREE.ShaderChunk.points_frag,
        );

        let renderer: WebGLRenderer;
        try {
          renderer = new THREE.WebGLRenderer({
            alpha: true,
            antialias: false,
            powerPreference: 'high-performance',
          });
        } catch {
          // No WebGL context (blocked, software-rendered, exhausted
          // budget). The hero's CSS backdrop is the fallback.
          return;
        }

        try {
          disposeScene = mountScene(THREE, renderer, container);
        } catch (error) {
          renderer.dispose();
          throw error;
        }
      } catch (error) {
        console.error('HeroScene: could not start the particle scene', error);
      }
    };

    // Built after hydration and once the browser is idle, so the scene
    // never competes with the hero copy for the largest paint.
    const cancelIdle = deferUntilIdle(() => {
      void start();
    });

    return () => {
      cancelled = true;
      cancelIdle();
      disposeScene?.();
    };
  }, [capable]);

  if (!capable) return null;

  return (
    <div
      ref={containerRef}
      aria-hidden
      className="absolute inset-0 overflow-hidden [&>canvas]:block"
    />
  );
}
