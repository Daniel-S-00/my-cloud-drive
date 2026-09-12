import { isCoarsePointer } from './pointer';

/**
 * WebGL capability gate shared by every animated background in the app.
 *
 * A full-viewport WebGL scene is the main source of jank on weak GPUs, so
 * they share a policy: low-memory machines and users who asked for less
 * motion always get the static treatment.
 *
 * Touch-first devices are the one place the two scenes disagree, so there
 * are two gates rather than one. A fixed-cost scene holds the same budget on
 * every device, so on a phone it is a liability and gets skipped. A scene
 * that can shed cost — fewer points, capped pixel ratio — is allowed there
 * instead, as long as it actually does shed it. The caller owns that part.
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

/**
 * For fixed-cost scenes: the same budget everywhere, so a touch-first device
 * is excluded rather than left to stutter.
 */
export function isWebglCapable(hints?: DeviceHints): boolean {
  if (typeof window === 'undefined') return false;
  if (prefersReducedMotion()) return false;
  if (isCoarsePointer()) return false;
  return !isLowMemoryDevice(hints);
}

/**
 * For scenes that scale their own cost down. Touch-first devices are allowed
 * here, so whoever calls this must check {@link isCoarsePointer} and cut the
 * budget — a smaller tier and a capped pixel ratio. The pixel ratio is the
 * bigger lever of the two on a phone, where a DPR of 3 is several times the
 * fragment work of a laptop.
 */
export function isAdaptiveWebglCapable(hints?: DeviceHints): boolean {
  if (typeof window === 'undefined') return false;
  if (prefersReducedMotion()) return false;
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
