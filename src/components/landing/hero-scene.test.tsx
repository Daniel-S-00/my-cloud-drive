// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import {
  NOVA_QUALITY_TIERS,
  pickQualityTier,
} from '@/lib/nova-geometry';
import { readDeviceHints } from '@/lib/webgl-capability';
import HeroScene from './hero-scene';

type MockShader = {
  uniforms: Record<string, unknown>;
  vertexShader: string;
  fragmentShader: string;
};

type MockRenderer = {
  domElement: HTMLCanvasElement;
  setClearAlpha: ReturnType<typeof vi.fn>;
  setPixelRatio: ReturnType<typeof vi.fn>;
  setSize: ReturnType<typeof vi.fn>;
  setAnimationLoop: ReturnType<typeof vi.fn>;
  render: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  forceContextLoss: ReturnType<typeof vi.fn>;
};

type MockMaterial = {
  onBeforeCompile?: (shader: MockShader) => void;
  options: Record<string, unknown>;
  dispose: ReturnType<typeof vi.fn>;
};

type MockGeometry = {
  dispose: ReturnType<typeof vi.fn>;
  setAttribute: ReturnType<typeof vi.fn>;
};

type MockCamera = {
  aspect: number;
  updateProjectionMatrix: ReturnType<typeof vi.fn>;
  lookAt: ReturnType<typeof vi.fn>;
};

const ANCHORED_VERTEX = [
  'uniform float size;',
  'void main() {',
  '\t#include <color_vertex>',
  '\t#include <begin_vertex>',
  '\tgl_PointSize = size;',
  '}',
].join('\n');

const ANCHORED_FRAGMENT = [
  'uniform vec3 diffuse;',
  'void main() {',
  '\tvec4 diffuseColor = vec4( diffuse, opacity );',
  '\t#include <clipping_planes_fragment>',
  '}',
].join('\n');

const h = vi.hoisted(() => ({
  vertexShader: '',
  fragmentShader: '',
  throwOnRenderer: false,
  throwOnPoints: false,
  renderers: [] as MockRenderer[],
  materials: [] as MockMaterial[],
  geometries: [] as MockGeometry[],
  cameras: [] as MockCamera[],
  attributes: [] as Array<{ array: Float32Array; itemSize: number }>,
  attributeNames: [] as string[],
  reset() {
    this.vertexShader = '';
    this.fragmentShader = '';
    this.throwOnRenderer = false;
    this.throwOnPoints = false;
    this.renderers = [];
    this.materials = [];
    this.geometries = [];
    this.cameras = [];
    this.attributes = [];
    this.attributeNames = [];
  },
}));

vi.mock('three', () => {
  class WebGLRenderer {
    domElement = document.createElement('canvas');
    setClearAlpha = vi.fn();
    setPixelRatio = vi.fn();
    setSize = vi.fn();
    setAnimationLoop = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
    forceContextLoss = vi.fn();

    constructor() {
      if (h.throwOnRenderer) throw new Error('Error creating WebGL context');
      h.renderers.push(this as unknown as MockRenderer);
    }
  }

  class Scene {
    add = vi.fn();
  }

  class PerspectiveCamera {
    aspect: number;
    position = { set: vi.fn() };
    lookAt = vi.fn();
    updateProjectionMatrix = vi.fn();

    constructor(_fov: number, aspect: number) {
      this.aspect = aspect;
      h.cameras.push(this as unknown as MockCamera);
    }
  }

  class BufferGeometry {
    dispose = vi.fn();
    setAttribute = vi.fn((name: string) => {
      h.attributeNames.push(name);
    });

    constructor() {
      h.geometries.push(this as unknown as MockGeometry);
    }
  }

  class BufferAttribute {
    constructor(array: Float32Array, itemSize: number) {
      h.attributes.push({ array, itemSize });
    }
  }

  class PointsMaterial {
    onBeforeCompile?: (shader: MockShader) => void;
    dispose = vi.fn();

    constructor(public options: Record<string, unknown>) {
      h.materials.push(this as unknown as MockMaterial);
    }
  }

  class Points {
    rotation = { order: 'XYZ', x: 0, y: 0, z: 0 };
    constructor(
      public geometry: unknown,
      public material: unknown,
    ) {
      if (h.throwOnPoints) throw new Error('failed to build points');
    }
  }

  class Vector3 {
    constructor(
      public x = 0,
      public y = 0,
      public z = 0,
    ) {}
  }

  class Vector2 {
    constructor(
      public x = 0,
      public y = 0,
    ) {}

    set(x: number, y: number) {
      this.x = x;
      this.y = y;
      return this;
    }
  }

  return {
    WebGLRenderer,
    Scene,
    PerspectiveCamera,
    BufferGeometry,
    BufferAttribute,
    PointsMaterial,
    Points,
    Vector3,
    Vector2,
    AdditiveBlending: 2,
    ShaderChunk: {
      get points_vert() {
        return h.vertexShader;
      },
      get points_frag() {
        return h.fragmentShader;
      },
    },
  };
});

/**
 * The component defers its build through `window.requestIdleCallback`,
 * so these must be installed on `window` itself — `vi.stubGlobal` only
 * reaches `globalThis`.
 */
type IdleCapableWindow = {
  requestIdleCallback?: (
    callback: () => void,
    options?: { timeout?: number },
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

const idleWindow = window as unknown as IdleCapableWindow;

function installMatchMedia(matches: Record<string, boolean> = {}) {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: Boolean(matches[query]),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  }));
}

const resizeObservers: Array<{
  callback: ResizeObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];
const intersectionObservers: Array<{
  callback: IntersectionObserverCallback;
  disconnect: ReturnType<typeof vi.fn>;
}> = [];

function installObservers() {
  resizeObservers.length = 0;
  intersectionObservers.length = 0;

  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(callback: ResizeObserverCallback) {
        resizeObservers.push({
          callback,
          disconnect: this.disconnect as unknown as ReturnType<typeof vi.fn>,
        });
      }
    },
  );

  vi.stubGlobal(
    'IntersectionObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      constructor(callback: IntersectionObserverCallback) {
        intersectionObservers.push({
          callback,
          disconnect: this.disconnect as unknown as ReturnType<typeof vi.fn>,
        });
      }
    },
  );
}

/** jsdom's document.hidden is a prototype getter; shadow it per-test. */
function setDocumentHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => value,
  });
}

function clearDocumentHidden() {
  delete (document as unknown as Record<string, unknown>).hidden;
}

function resizeTo(element: HTMLElement, width: number, height: number) {
  Object.defineProperty(element, 'clientWidth', {
    configurable: true,
    value: width,
  });
  Object.defineProperty(element, 'clientHeight', {
    configurable: true,
    value: height,
  });
}

function stubRect(
  element: HTMLElement,
  rect: { left: number; top: number; width: number; height: number },
) {
  element.getBoundingClientRect = () =>
    ({
      x: rect.left,
      y: rect.top,
      left: rect.left,
      top: rect.top,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
      width: rect.width,
      height: rect.height,
      toJSON: () => ({}),
    }) as DOMRect;
}

/**
 * MouseEvent rather than PointerEvent: the handler only reads clientX/Y,
 * and jsdom's PointerEvent support is not something to depend on.
 */
function movePointerTo(clientX: number, clientY: number) {
  act(() => {
    window.dispatchEvent(new MouseEvent('pointermove', { clientX, clientY }));
  });
}

/** The uniform objects are shared by reference, so this reads live values. */
function readUniforms() {
  const shader: MockShader = {
    uniforms: {},
    vertexShader: ANCHORED_VERTEX,
    fragmentShader: ANCHORED_FRAGMENT,
  };
  h.materials[0].onBeforeCompile?.(shader);
  return shader.uniforms;
}

function advanceFrames(count: number) {
  const loop = h.renderers[0].setAnimationLoop.mock.calls[0][0] as () => void;
  act(() => {
    for (let i = 0; i < count; i += 1) loop();
  });
}

async function flush(waitMs = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  });
}

async function mount(waitMs = 0) {
  const view = render(<HeroScene />);
  await flush(waitMs);
  return view;
}

beforeEach(() => {
  h.reset();
  h.vertexShader = ANCHORED_VERTEX;
  h.fragmentShader = ANCHORED_FRAGMENT;
  installMatchMedia();
  installObservers();
  // jsdom lacks both, and the scene defers its build to idle time.
  idleWindow.requestIdleCallback = (callback) => {
    callback();
    return 1;
  };
  idleWindow.cancelIdleCallback = () => {};
});

afterEach(() => {
  // Deliberately no unstubAllGlobals(): this file's afterEach runs BEFORE
  // @testing-library's cleanup() from vitest.setup.ts, which is what
  // unmounts the component. Unstubbing first would tear the idle stubs out
  // from under that unmount. Every test reinstalls them in beforeEach.
  clearDocumentHidden();
  vi.restoreAllMocks();
});

describe('HeroScene capability gate', () => {
  it('renders nothing when the user asked for less motion', async () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true });

    const { container } = await mount();

    expect(container.firstChild).toBeNull();
    expect(h.renderers).toHaveLength(0);
  });
});

describe('HeroScene mounting', () => {
  it('appends a canvas once the browser is idle', async () => {
    const { container } = await mount();

    expect(h.renderers).toHaveLength(1);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('makes the canvas transparent so the page backdrop shows through', async () => {
    await mount();

    expect(h.renderers[0].setClearAlpha).toHaveBeenCalledWith(0);
  });

  it('caps the pixel ratio', async () => {
    await mount();

    expect(h.renderers[0].setPixelRatio).toHaveBeenCalledWith(
      Math.min(window.devicePixelRatio || 1, 2),
    );
  });

  it('uploads the position, sizes, orbits, spins and shades attributes', async () => {
    await mount();

    expect(h.attributeNames).toEqual([
      'position',
      'sizes',
      'orbits',
      'spins',
      'shades',
    ]);
    expect(h.attributes.map((attribute) => attribute.itemSize)).toEqual([
      3, 1, 3, 3, 1,
    ]);
  });

  it('sizes the cloud to the quality tier it picked', async () => {
    await mount();

    const expectedTier = pickQualityTier(readDeviceHints());
    const counts = NOVA_QUALITY_TIERS[expectedTier];
    const expectedCount =
      counts.coreCount + counts.planetoidCount + counts.dustCount;

    const positions = h.attributes[0];
    expect(positions.itemSize).toBe(3);
    expect(positions.array.length).toBe(expectedCount * 3);
    expect([72_000, 144_000]).toContain(expectedCount);
  });

  it('starts the render loop', async () => {
    await mount();

    expect(h.renderers[0].setAnimationLoop).toHaveBeenCalledTimes(1);
    expect(typeof h.renderers[0].setAnimationLoop.mock.calls[0][0]).toBe('function');
  });

  it('renders a frame without throwing', async () => {
    await mount();

    const loop = h.renderers[0].setAnimationLoop.mock.calls[0][0] as () => void;
    act(() => {
      loop();
    });

    expect(h.renderers[0].render).toHaveBeenCalledTimes(1);
  });

  it('observes the container for resizes and visibility', async () => {
    await mount();

    expect(resizeObservers).toHaveLength(1);
    expect(intersectionObservers).toHaveLength(1);
  });

  it('falls back to a timer when requestIdleCallback is unavailable', async () => {
    delete idleWindow.requestIdleCallback;

    const { container } = await mount(250);

    expect(h.renderers).toHaveLength(1);
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  it('leaves no canvas behind when the scene fails to build', async () => {
    h.throwOnPoints = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = await mount();

    expect(h.renderers).toHaveLength(1);
    expect(h.renderers[0].dispose).toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});

describe('HeroScene resizing', () => {
  it('resizes the renderer and camera when the container changes', async () => {
    const { container } = await mount();
    const sceneContainer = container.firstElementChild as HTMLElement;
    resizeTo(sceneContainer, 800, 600);

    const observer = resizeObservers[0];
    act(() => {
      observer.callback([], observer as unknown as ResizeObserver);
    });

    expect(h.renderers[0].setSize).toHaveBeenLastCalledWith(800, 600);
    expect(h.cameras[0].aspect).toBeCloseTo(800 / 600, 6);
    expect(h.cameras[0].updateProjectionMatrix).toHaveBeenCalled();
  });

  it('ignores a collapsed container', async () => {
    await mount();

    const observer = resizeObservers[0];
    act(() => {
      observer.callback([], observer as unknown as ResizeObserver);
    });

    // Only the initial sizing done at mount.
    expect(h.renderers[0].setSize).toHaveBeenCalledTimes(1);
  });

  it('keeps the cursor influence circular across a resize', async () => {
    const { container } = await mount();
    const sceneContainer = container.firstElementChild as HTMLElement;
    resizeTo(sceneContainer, 800, 600);

    const observer = resizeObservers[0];
    act(() => {
      observer.callback([], observer as unknown as ResizeObserver);
    });

    expect(
      (readUniforms().uPointerAspect as { value: number }).value,
    ).toBeCloseTo(800 / 600, 6);
  });
});

describe('HeroScene cursor reaction', () => {
  it('points the influence at the cursor while it is over the hero', async () => {
    const { container } = await mount();
    stubRect(container.firstElementChild as HTMLElement, {
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    });

    movePointerTo(250, 125);
    advanceFrames(40);

    const uniforms = readUniforms();
    const pointer = (uniforms.uPointer as { value: { x: number; y: number } })
      .value;
    const strength = uniforms.uPointerStrength as { value: number };

    // 250/1000 -> -0.5 in NDC x, and 125/500 flipped to +0.5 in NDC y.
    expect(pointer.x).toBeCloseTo(-0.5, 6);
    expect(pointer.y).toBeCloseTo(0.5, 6);
    expect(strength.value).toBeGreaterThan(0.9);
  });

  it('stays inert until the cursor actually moves', async () => {
    const { container } = await mount();
    stubRect(container.firstElementChild as HTMLElement, {
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    });

    advanceFrames(20);

    expect((readUniforms().uPointerStrength as { value: number }).value).toBe(0);
  });

  it('eases the influence out once the cursor leaves the hero', async () => {
    const { container } = await mount();
    stubRect(container.firstElementChild as HTMLElement, {
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    });

    movePointerTo(250, 125);
    advanceFrames(40);
    expect(
      (readUniforms().uPointerStrength as { value: number }).value,
    ).toBeGreaterThan(0.9);

    movePointerTo(250, 5000);
    advanceFrames(60);

    expect(
      (readUniforms().uPointerStrength as { value: number }).value,
    ).toBeLessThan(0.05);
  });

  it('fades out when the pointer leaves the document entirely', async () => {
    const { container } = await mount();
    stubRect(container.firstElementChild as HTMLElement, {
      left: 0,
      top: 0,
      width: 1000,
      height: 500,
    });

    movePointerTo(500, 250);
    advanceFrames(40);

    act(() => {
      document.dispatchEvent(new MouseEvent('pointerleave'));
    });
    advanceFrames(60);

    expect(
      (readUniforms().uPointerStrength as { value: number }).value,
    ).toBeLessThan(0.05);
  });

  it('stays inert when the container has no measurable size', async () => {
    // jsdom reports an all-zero rect by default, mirroring a collapsed or
    // not-yet-laid-out hero. Dividing by that width would produce NaN.
    await mount();

    movePointerTo(10, 10);
    advanceFrames(5);

    const uniforms = readUniforms();
    const pointer = (uniforms.uPointer as { value: { x: number; y: number } })
      .value;

    expect((uniforms.uPointerStrength as { value: number }).value).toBe(0);
    expect(Number.isNaN(pointer.x)).toBe(false);
    expect(Number.isNaN(pointer.y)).toBe(false);
  });
});

describe('HeroScene shader wiring', () => {
  it('patches the built-in points material', async () => {
    await mount();

    const material = h.materials[0];
    expect(material).toBeDefined();
    expect(typeof material.onBeforeCompile).toBe('function');

    const shader: MockShader = {
      uniforms: {},
      vertexShader: ANCHORED_VERTEX,
      fragmentShader: ANCHORED_FRAGMENT,
    };
    material.onBeforeCompile?.(shader);

    expect(Object.keys(shader.uniforms).sort()).toEqual([
      'time',
      'uColorCore',
      'uColorDeep',
      'uColorMid',
      'uPointer',
      'uPointerAspect',
      'uPointerStrength',
    ]);
    expect(shader.vertexShader).toContain('gl_PointSize = size * sizes;');
    expect(shader.vertexShader).toContain('uColorCore');
    expect(shader.fragmentShader).toContain('pow(1.0 - novaR2, 2.0)');
  });

  it('feeds the theme palette into the shader uniforms', async () => {
    await mount();

    const shader: MockShader = {
      uniforms: {},
      vertexShader: ANCHORED_VERTEX,
      fragmentShader: ANCHORED_FRAGMENT,
    };
    h.materials[0].onBeforeCompile?.(shader);

    const core = (shader.uniforms.uColorCore as { value: { x: number; y: number; z: number } })
      .value;
    expect(core.x).toBeGreaterThan(0);
    expect(core.x).toBeLessThanOrEqual(1);
  });

  it('logs and stays inert when three no longer matches the anchors', async () => {
    h.vertexShader = 'uniform float size; void main() {}';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = await mount();

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy.mock.calls[0][0]).toContain('HeroScene');
    expect(h.renderers).toHaveLength(0);
    expect(container.querySelector('canvas')).toBeNull();
  });
});

describe('HeroScene failure handling', () => {
  it('stays silent when the browser cannot give a WebGL context', async () => {
    h.throwOnRenderer = true;
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { container } = await mount();

    expect(h.renderers).toHaveLength(0);
    expect(container.querySelector('canvas')).toBeNull();
    expect(errorSpy).not.toHaveBeenCalled();
  });
});

describe('HeroScene pausing', () => {
  it('stops rendering while the hero is off screen', async () => {
    await mount();

    const observer = intersectionObservers[0];
    act(() => {
      observer.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });

    expect(h.renderers[0].setAnimationLoop).toHaveBeenLastCalledWith(null);
  });

  it('resumes rendering when the hero comes back', async () => {
    await mount();

    const observer = intersectionObservers[0];
    act(() => {
      observer.callback(
        [{ isIntersecting: false } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });
    act(() => {
      observer.callback(
        [{ isIntersecting: true } as IntersectionObserverEntry],
        observer as unknown as IntersectionObserver,
      );
    });

    expect(h.renderers[0].setAnimationLoop).toHaveBeenLastCalledWith(
      expect.any(Function),
    );
  });

  it('ignores an empty observation batch', async () => {
    await mount();

    const observer = intersectionObservers[0];
    act(() => {
      observer.callback([], observer as unknown as IntersectionObserver);
    });

    expect(h.renderers[0].setAnimationLoop).toHaveBeenCalledTimes(1);
  });

  it('does not restart or re-pause a loop that is already in that state', async () => {
    await mount();

    const observer = intersectionObservers[0];
    const notify = (isIntersecting: boolean) =>
      act(() => {
        observer.callback(
          [{ isIntersecting } as IntersectionObserverEntry],
          observer as unknown as IntersectionObserver,
        );
      });

    notify(true); // already running -> no-op
    notify(false); // pauses
    notify(false); // already paused -> no-op

    expect(h.renderers[0].setAnimationLoop).toHaveBeenCalledTimes(2);
  });

  it('pauses while the tab is hidden and resumes when it is visible', async () => {
    await mount();

    setDocumentHidden(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(h.renderers[0].setAnimationLoop).toHaveBeenLastCalledWith(null);

    setDocumentHidden(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(h.renderers[0].setAnimationLoop).toHaveBeenLastCalledWith(
      expect.any(Function),
    );
  });

  it('stops the loop when the GPU context is lost', async () => {
    const { container } = await mount();
    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    act(() => {
      canvas?.dispatchEvent(new Event('webglcontextlost', { cancelable: true }));
    });

    expect(h.renderers[0].setAnimationLoop).toHaveBeenLastCalledWith(null);
  });

  it('advances between successive frames', async () => {
    await mount();

    const loop = h.renderers[0].setAnimationLoop.mock.calls[0][0] as () => void;
    act(() => {
      loop();
      loop();
    });

    expect(h.renderers[0].render).toHaveBeenCalledTimes(2);
  });
});

describe('HeroScene teardown', () => {
  it('releases every GPU resource on unmount', async () => {
    const { container, unmount } = await mount();

    unmount();

    expect(h.renderers[0].setAnimationLoop).toHaveBeenLastCalledWith(null);
    expect(h.geometries[0].dispose).toHaveBeenCalled();
    expect(h.materials[0].dispose).toHaveBeenCalled();
    expect(h.renderers[0].dispose).toHaveBeenCalled();
    expect(h.renderers[0].forceContextLoss).toHaveBeenCalled();
    expect(container.querySelector('canvas')).toBeNull();
  });

  it('disconnects its observers on unmount', async () => {
    const { unmount } = await mount();

    unmount();

    expect(resizeObservers[0].disconnect).toHaveBeenCalled();
    expect(intersectionObservers[0].disconnect).toHaveBeenCalled();
  });

  it('does not mount anything if it unmounts before the build finishes', async () => {
    const { unmount } = render(<HeroScene />);
    unmount();
    await flush();

    expect(h.renderers).toHaveLength(0);
  });
});

describe('HeroScene on touch-first devices', () => {
  it('mounts anyway, on the smaller tier and a capped pixel ratio', async () => {
    installMatchMedia({ '(pointer: coarse)': true });
    Object.defineProperty(window, 'devicePixelRatio', {
      configurable: true,
      value: 3,
    });

    try {
      await mount();

      // The fixed-cost gate turns touch devices away; the adaptive one admits
      // them, so the scene has to actually shed the budget it was let in on.
      expect(h.renderers).toHaveLength(1);
      expect(h.renderers[0].setPixelRatio).toHaveBeenCalledWith(1.5);

      const counts = NOVA_QUALITY_TIERS.medium;
      const total =
        counts.coreCount + counts.planetoidCount + counts.dustCount;
      const position = h.attributes.find((entry) => entry.itemSize === 3);
      expect(position?.array.length).toBe(total * 3);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', {
        configurable: true,
        value: 1,
      });
    }
  });

  it('still refuses to mount when the user asked for less motion', async () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true });

    const { container } = await mount();

    expect(container.firstChild).toBeNull();
    expect(h.renderers).toHaveLength(0);
  });
});
