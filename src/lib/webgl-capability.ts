import { isCoarsePointer } from './pointer';

/**
 * WebGL capability gate shared by every animated background in the app.
 *
 * A full-viewport WebGL scene is the main source of jank on weak GPUs, so
 * all of them share one policy: touch-first devices, low-memory machines,
 * and users who asked for less motion get the static treatment instead.
 */

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const COARSE_POINTER_QUERY = '(pointer: coarse)';

export type DeviceHints = {
  deviceMemory?: number;
  hardwareConcurrency?: number;
};

export function readDeviceHints(): DeviceHints {
  if (typeof navigator === 'undefined') return {};
  return {
    // Chromium-only. "Unknown" must not be mistaken for "low memory".
    deviceMemory: (navigator as Navigator & { deviceMemory?: number })
      .deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency,
  };
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia(REDUCED_MOTION_QUERY).matches;
}

export function isLowMemoryDevice(
  hints: DeviceHints = readDeviceHints(),
): boolean {
  const { deviceMemory } = hints;
  return (
    typeof deviceMemory === 'number' && deviceMemory > 0 && deviceMemory < 4
  );
}

export function isWebglCapable(hints?: DeviceHints): boolean {
  if (typeof window === 'undefined') return false;
  if (prefersReducedMotion()) return false;
  if (isCoarsePointer()) return false;
  return !isLowMemoryDevice(hints);
}

/**
 * Re-evaluate when the OS motion preference or the primary pointer type
 * changes (reduced-motion toggled, device rotated, mouse plugged in).
 */
export function subscribeWebglCapability(callback: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const reduced = window.matchMedia(REDUCED_MOTION_QUERY);
  const coarse = window.matchMedia(COARSE_POINTER_QUERY);
  reduced.addEventListener('change', callback);
  coarse.addEventListener('change', callback);
  return () => {
    reduced.removeEventListener('change', callback);
    coarse.removeEventListener('change', callback);
  };
}
