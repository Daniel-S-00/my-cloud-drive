// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  isLowMemoryDevice,
  isAdaptiveWebglCapable,
  isWebglCapable,
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
