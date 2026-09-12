// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { isCoarsePointer } from './pointer';
import {
  isAdaptiveWebglCapable,
  isWebglCapable,
  prefersReducedMotion,
  readDeviceHints,
  subscribeWebglCapability,
} from './webgl-capability';

/**
 * These modules are imported during server rendering, where `window` does
 * not exist. The guards keep them side-effect free there.
 */
describe('without a DOM', () => {
  it('has no window to measure', () => {
    expect(typeof window).toBe('undefined');
  });

  it('is not capable', () => {
    expect(isWebglCapable()).toBe(false);
  });

  it('is not adaptively capable either', () => {
    expect(isAdaptiveWebglCapable()).toBe(false);
  });

  it('has no motion preference to honour', () => {
    expect(prefersReducedMotion()).toBe(false);
  });

  it('has no coarse pointer', () => {
    expect(isCoarsePointer()).toBe(false);
  });

  it('subscribes to nothing and returns a callable teardown', () => {
    const unsubscribe = subscribeWebglCapability(() => {});
    expect(typeof unsubscribe).toBe('function');
    expect(() => unsubscribe()).not.toThrow();
  });

  it('still reads whatever device hints the runtime exposes', () => {
    const hints = readDeviceHints();
    expect(Object.keys(hints).sort()).toEqual([
      'deviceMemory',
      'hardwareConcurrency',
    ]);
  });

  it('reports no hints when the runtime has no navigator', () => {
    const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
    if (descriptor?.configurable) {
      Object.defineProperty(globalThis, 'navigator', {
        configurable: true,
        value: undefined,
      });
    }

    try {
      expect(readDeviceHints()).toEqual({});
    } finally {
      if (descriptor) {
        Object.defineProperty(globalThis, 'navigator', descriptor);
      }
    }
  });
});
