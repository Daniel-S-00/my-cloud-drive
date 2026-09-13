// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  backgroundRenderSize,
  hasHardwareWebgl,
  frameBudgetVerdict,
  FRAME_BUDGET,
  isLowMemoryDevice,
  isAdaptiveWebglCapable,
  isWebglCapable,
  pickBackgroundTier,
  prefersReducedMotion,
  readDeviceHints,
  subscribeWebglCapability,
} from './webgl-capability';

const REDUCED = '(prefers-reduced-motion: reduce)';
const COARSE = '(pointer: coarse)';

type Listener = () => void;

function installMatchMedia(initial: Record<string, boolean> = {}) {
  const state: Record<string, boolean> = { ...initial };
  const listeners = new Map<string, Set<Listener>>();

  vi.stubGlobal('matchMedia', (query: string) => {
    if (!listeners.has(query)) listeners.set(query, new Set());
    return {
      matches: Boolean(state[query]),
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: Listener) => {
        listeners.get(query)?.add(listener);
      },
      removeEventListener: (_type: string, listener: Listener) => {
        listeners.get(query)?.delete(listener);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    };
  });

  return {
    set(query: string, value: boolean) {
      state[query] = value;
      for (const listener of listeners.get(query) ?? []) listener();
    },
    listenerCount(query: string) {
      return listeners.get(query)?.size ?? 0;
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('prefersReducedMotion', () => {
  it('is true when the OS asks for less motion', () => {
    installMatchMedia({ [REDUCED]: true });
    expect(prefersReducedMotion()).toBe(true);
  });

  it('is false otherwise', () => {
    installMatchMedia();
    expect(prefersReducedMotion()).toBe(false);
  });
});

describe('isLowMemoryDevice', () => {
  it('flags devices below the 4 GB threshold', () => {
    expect(isLowMemoryDevice({ deviceMemory: 2 })).toBe(true);
  });

  it('accepts devices at or above the threshold', () => {
    expect(isLowMemoryDevice({ deviceMemory: 4 })).toBe(false);
    expect(isLowMemoryDevice({ deviceMemory: 8 })).toBe(false);
  });

  it('treats an unreported deviceMemory as "not low memory"', () => {
    expect(isLowMemoryDevice({})).toBe(false);
    expect(isLowMemoryDevice({ deviceMemory: 0 })).toBe(false);
  });
});

describe('readDeviceHints', () => {
  it('reads the navigator hints when present', () => {
    vi.stubGlobal('navigator', { deviceMemory: 8, hardwareConcurrency: 16 });
    expect(readDeviceHints()).toEqual({
      deviceMemory: 8,
      hardwareConcurrency: 16,
    });
  });

  it('reports undefined for hints the browser omits', () => {
    vi.stubGlobal('navigator', { hardwareConcurrency: 4 });
    expect(readDeviceHints()).toEqual({
      deviceMemory: undefined,
      hardwareConcurrency: 4,
    });
  });
});

describe('isWebglCapable', () => {
  it('is capable on a desktop with no blocking signal', () => {
    installMatchMedia();
    expect(isWebglCapable({ deviceMemory: 8 })).toBe(true);
  });

  it('is not capable when the user asked for less motion', () => {
    installMatchMedia({ [REDUCED]: true });
    expect(isWebglCapable({ deviceMemory: 8 })).toBe(false);
  });

  it('is not capable on touch-first devices', () => {
    installMatchMedia({ [COARSE]: true });
    expect(isWebglCapable({ deviceMemory: 8 })).toBe(false);
  });

  it('is not capable on low-memory machines', () => {
    installMatchMedia();
    expect(isWebglCapable({ deviceMemory: 2 })).toBe(false);
  });

  it('falls back to the navigator hints when none are passed', () => {
    installMatchMedia();
    vi.stubGlobal('navigator', { deviceMemory: 2, hardwareConcurrency: 4 });
    expect(isWebglCapable()).toBe(false);
  });
});

describe('isAdaptiveWebglCapable', () => {
  it('admits touch-first devices that the fixed-cost gate turns away', () => {
    installMatchMedia({ [COARSE]: true });

    expect(isAdaptiveWebglCapable({ deviceMemory: 8 })).toBe(true);
    expect(isWebglCapable({ deviceMemory: 8 })).toBe(false);
  });

  it('still refuses when the user asked for less motion', () => {
    installMatchMedia({ [REDUCED]: true });
    expect(isAdaptiveWebglCapable({ deviceMemory: 8 })).toBe(false);
  });

  it('still refuses low-memory machines', () => {
    installMatchMedia();
    expect(isAdaptiveWebglCapable({ deviceMemory: 2 })).toBe(false);
  });

  it('falls back to the navigator hints when none are passed', () => {
    installMatchMedia();
    vi.stubGlobal('navigator', { deviceMemory: 2, hardwareConcurrency: 4 });
    expect(isAdaptiveWebglCapable()).toBe(false);
  });
});

describe('subscribeWebglCapability', () => {
  it('notifies on reduced-motion changes', () => {
    const media = installMatchMedia();
    const listener = vi.fn();
    const unsubscribe = subscribeWebglCapability(listener);

    media.set(REDUCED, true);
    expect(listener).toHaveBeenCalledTimes(1);

    media.set(COARSE, true);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it('stops notifying once unsubscribed', () => {
    const media = installMatchMedia();
    const listener = vi.fn();
    const unsubscribe = subscribeWebglCapability(listener);

    expect(media.listenerCount(REDUCED)).toBe(1);
    expect(media.listenerCount(COARSE)).toBe(1);

    unsubscribe();

    expect(media.listenerCount(REDUCED)).toBe(0);
    expect(media.listenerCount(COARSE)).toBe(0);

    media.set(REDUCED, true);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('pickBackgroundTier', () => {
  it('goes lean on touch-first devices', () => {
    expect(pickBackgroundTier({ deviceMemory: 8 }, true)).toBe('lite');
  });

  it('goes lean on the weakest machines that still reach WebGL', () => {
    // 4 GB is the floor the capability gate admits; it is exactly the kind
    // of machine the budget exists for.
    expect(pickBackgroundTier({ deviceMemory: 4 }, false)).toBe('lite');
    expect(pickBackgroundTier({ hardwareConcurrency: 2 }, false)).toBe('lite');
  });

  it('keeps the full budget for machines with room to spare', () => {
    expect(pickBackgroundTier({ deviceMemory: 8 }, false)).toBe('full');
    expect(
      pickBackgroundTier({ deviceMemory: 8, hardwareConcurrency: 12 }, false),
    ).toBe('full');
  });

  it('trusts a device that reports nothing over the Chromium-only hints', () => {
    expect(pickBackgroundTier({}, false)).toBe('full');
  });
});

describe('backgroundRenderSize', () => {
  it('never renders sharper than the fixed scale it replaced', () => {
    // 1024x768 has room inside the budget, so the ceiling is what binds.
    expect(backgroundRenderSize({ width: 1024, height: 768 })).toEqual({
      width: 716,
      height: 537,
    });
  });

  it('holds the budget on a large monitor instead of scaling with it', () => {
    const size = backgroundRenderSize({ width: 2560, height: 1440 });

    expect(size.width * size.height).toBeLessThanOrEqual(700_000);
    expect(size.width / size.height).toBeCloseTo(2560 / 1440, 1);
  });

  it('spends less on the lean tier', () => {
    const viewport = { width: 1600, height: 900 };
    const full = backgroundRenderSize(viewport, 'full');
    const lite = backgroundRenderSize(viewport, 'lite');

    expect(lite.width * lite.height).toBeLessThanOrEqual(300_000);
    expect(lite.width).toBeLessThan(full.width);
    expect(lite.height).toBeLessThan(full.height);
  });

  it('keeps a floor under a tiny window', () => {
    expect(backgroundRenderSize({ width: 300, height: 200 })).toEqual({
      width: 320,
      height: 320,
    });
  });

  it('keeps the aspect ratio the scene was designed at', () => {
    const size = backgroundRenderSize({ width: 1920, height: 1080 });

    expect(size.width / size.height).toBeCloseTo(1920 / 1080, 1);
  });
});

/** A WebGL context that only knows how to answer the two probes. */
function installContext(renderer: string) {
  const loseContext = vi.fn();
  const gl = {
    getExtension: (name: string) => {
      if (name === 'WEBGL_debug_renderer_info') {
        return { UNMASKED_RENDERER_WEBGL: 37446 };
      }
      if (name === 'WEBGL_lose_context') return { loseContext };
      return null;
    },
    getParameter: () => renderer,
  };

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    gl as unknown as RenderingContext,
  );

  return { loseContext };
}

describe('hasHardwareWebgl', () => {
  it('reports no hardware path when the browser refuses a context', () => {
    // A context the browser will not hand over — no WebGL at all, a
    // blocklisted driver, or the software fallback it refuses to take.
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    expect(hasHardwareWebgl()).toBe(false);
  });

  it('takes a software renderer at its word', () => {
    installContext('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)))');

    expect(hasHardwareWebgl()).toBe(false);
  });

  it('accepts a real GPU', () => {
    installContext('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0)');

    expect(hasHardwareWebgl()).toBe(true);
  });

  it('hands the probe context back', () => {
    const { loseContext } = installContext('ANGLE (Intel, Intel(R) UHD Graphics)');

    expect(hasHardwareWebgl()).toBe(true);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});

describe('frameBudgetVerdict', () => {
  const SIXTY_HZ = 16.7;

  it('waits for enough evidence before judging', () => {
    expect(frameBudgetVerdict([100, 100, 100, 100, 100], SIXTY_HZ)).toBe(
      'keep',
    );
  });

  it('keeps a scene that holds the display cadence', () => {
    const samples = Array(FRAME_BUDGET.minSamples).fill(SIXTY_HZ);

    expect(frameBudgetVerdict(samples, SIXTY_HZ)).toBe('keep');
  });

  it('leans on a scene half again past the cadence', () => {
    const samples = Array(FRAME_BUDGET.minSamples).fill(27);

    expect(frameBudgetVerdict(samples, SIXTY_HZ)).toBe('lean');
  });

  it('drops a scene that misses most of the frames', () => {
    const samples = Array(FRAME_BUDGET.minSamples).fill(40);

    expect(frameBudgetVerdict(samples, SIXTY_HZ)).toBe('drop');
  });

  it('judges against the display rather than the clock', () => {
    // 33 ms on a 30 Hz panel is a scene keeping the cadence, not failing it.
    const samples = Array(FRAME_BUDGET.minSamples).fill(33);

    expect(frameBudgetVerdict(samples, 33.3)).toBe('keep');
  });

  it('reads the cadence off the sample when none was measured', () => {
    const samples = [...Array(12).fill(SIXTY_HZ), ...Array(12).fill(50)];

    expect(frameBudgetVerdict(samples)).toBe('drop');
  });

  it('does not let one stall condemn a scene', () => {
    const samples = [...Array(FRAME_BUDGET.minSamples).fill(SIXTY_HZ), 500];

    expect(frameBudgetVerdict(samples, SIXTY_HZ)).toBe('keep');
  });
});
