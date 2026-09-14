'use client';

import { useEffect, useRef, useSyncExternalStore } from 'react';
import type { WebGLRenderer } from 'three';
import {
  NOVA_PLANE_TILT,
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
import { isCoarsePointer } from '@/lib/pointer';
import {
  isAdaptiveWebglCapable,
  readDeviceHints,
  subscribeWebglCapability,
} from '@/lib/webgl-capability';

type ThreeModule = typeof import('three');

/**
 * A pure dolly: the camera sits on the same sight line as the original
 * (0, 3.2, 24) but 1.5x closer, so the framing is that of a 1.5x zoom rather
 * than a different vantage point. The dust disc is scaled to compensate, so
 * only the system itself grows on screen.
 */
const CAMERA = { fov: 55, near: 1, far: 200, x: 0, y: 2.13, z: 16 } as const;
const PARALLAX = {
  horizontal: 1.07,
  vertical: 0.67,
  damping: 0.045,
} as const;
const POINT_BASE_SIZE = 0.1;
const MAX_PIXEL_RATIO = 2;
/**
 * A phone reporting a DPR of 3 renders nine times the pixels of the same
 * layout at 1. Cap it hard there: the scene is soft-focus particles, so the
 * loss in sharpness is invisible while the fragment work collapses.
 */
const COARSE_PIXEL_RATIO_CAP = 1.5;
const MAX_FRAME_STEP = 0.1;
/** How quickly the cursor influence fades in and out. */
const POINTER_EASING = 0.09;
const IDLE_TIMEOUT_MS = 1200;
const IDLE_FALLBACK_MS = 200;

// useSyncExternalStore wants stable references; the constant server
// snapshot is what SSR renders, and the real value swaps in after
// hydration so there is no markup mismatch.
const getCapableSnapshot = () => isAdaptiveWebglCapable();
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

  // Touch-first devices are allowed in by isAdaptiveWebglCapable, so they
  // have to pay for it here: a smaller tier and a capped pixel ratio.
  const coarse = isCoarsePointer();

  renderer.setClearAlpha(0);
  renderer.setPixelRatio(
    Math.min(
      window.devicePixelRatio || 1,
      coarse ? COARSE_PIXEL_RATIO_CAP : MAX_PIXEL_RATIO,
    ),
  );
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

  // A coarse pointer already rules out a discrete GPU, so the memory and
  // core-count hint is not worth consulting — go straight to the smaller
  // tier rather than trusting a Chromium-only signal to catch it.
  const tier = coarse ? 'medium' : pickQualityTier(readDeviceHints());
  const { positions, sizes, orbits, spins, shades } = buildNovaAttributes(
    NOVA_QUALITY_TIERS[tier],
  );

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('sizes', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('orbits', new THREE.BufferAttribute(orbits, 3));
  geometry.setAttribute('spins', new THREE.BufferAttribute(spins, 3));
  geometry.setAttribute('shades', new THREE.BufferAttribute(shades, 1));

  const palette = resolveNovaPalette(document.documentElement);
  const uniforms = {
    time: { value: 0 },
    uColorCore: { value: new THREE.Vector3(...palette.core) },
    uColorMid: { value: new THREE.Vector3(...palette.mid) },
    uColorDeep: { value: new THREE.Vector3(...palette.deep) },
    uPointer: { value: new THREE.Vector2(0, 0) },
    uPointerAspect: { value: width / height },
    uPointerStrength: { value: 0 },
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
  // One lean for the whole system, so the disc runs diagonally across the
  // frame. Rotating the object is the same transform the shader would apply
  // per vertex, only free.
  points.rotation.z = NOVA_PLANE_TILT;
  scene.add(points);

  let pointerX = 0;
  let pointerY = 0;
  let pointerClientX: number | null = null;
  let pointerClientY: number | null = null;
  let pointerPending = false;
  let hoverTarget = 0;
  let hoverStrength = 0;
  let cameraX = CAMERA.x;
  let cameraY = CAMERA.y;
  let elapsed = 0;
  let lastTime = 0;
  let running = false;

  /**
   * Converts the cursor into the hero's own NDC space and eases the
   * influence in or out. The layout is only read while the pointer has
   * actually moved, so a resting cursor costs nothing per frame.
   */
  const updatePointer = () => {
    if (pointerPending && pointerClientX !== null && pointerClientY !== null) {
      pointerPending = false;
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        hoverTarget =
          pointerClientX >= rect.left &&
          pointerClientX <= rect.right &&
          pointerClientY >= rect.top &&
          pointerClientY <= rect.bottom
            ? 1
            : 0;
        uniforms.uPointer.value.set(
          ((pointerClientX - rect.left) / rect.width) * 2 - 1,
          -(((pointerClientY - rect.top) / rect.height) * 2 - 1),
        );
      }
    }

    hoverStrength += (hoverTarget - hoverStrength) * POINTER_EASING;
    uniforms.uPointerStrength.value = hoverStrength;
  };

  const renderFrame = () => {
    const now = performance.now();
    const delta =
      lastTime === 0 ? 0 : Math.min((now - lastTime) / 1000, MAX_FRAME_STEP);
    lastTime = now;
    elapsed += delta * 0.5;

    uniforms.time.value = elapsed * Math.PI;

    cameraX += (pointerX * PARALLAX.horizontal - cameraX) * PARALLAX.damping;
    cameraY +=
      (CAMERA.y - pointerY * PARALLAX.vertical - cameraY) * PARALLAX.damping;
    camera.position.set(cameraX, cameraY, CAMERA.z);
    camera.lookAt(0, 0, 0);

    updatePointer();
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
    uniforms.uPointerAspect.value = nextWidth / nextHeight;
  };

  const onPointerMove = (event: PointerEvent) => {
    pointerX = (event.clientX / window.innerWidth) * 2 - 1;
    pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    pointerPending = true;
  };

  const onPointerLeave = () => {
    pointerPending = false;
    hoverTarget = 0;
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
  document.addEventListener('pointerleave', onPointerLeave);
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
    document.removeEventListener('pointerleave', onPointerLeave);
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

function HeroScene() {
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

export default HeroScene;
