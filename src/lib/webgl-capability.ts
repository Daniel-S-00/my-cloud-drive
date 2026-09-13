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

/**
 * How much a full-viewport background canvas is allowed to spend on a given
 * device. `full` is a machine with room to spare; `lite` is one that got
 * through the gates but should still be treated carefully.
 */
export type BackgroundTier = 'full' | 'lite';

/**
 * Canvas pixels a full-viewport background may render, per frame.
 *
 * These scenes sit behind a card and are upscaled by CSS, so the eye never
 * sees the difference between a 700k-pixel canvas and a 4M-pixel one — but
 * the GPU pays for every one of them, on every frame. The budget is what
 * keeps a 2560-wide window (1.8M pixels at the old fixed 0.7 scale) from
 * being the most expensive thing on the page.
 */
const BACKGROUND_PIXEL_BUDGET: Record<BackgroundTier, number> = {
  full: 700_000,
  lite: 300_000,
};

/**
 * Ceiling on the share of the viewport rendered, so a small window does not
 * spend its budget twice over. This is the fixed scale the backgrounds used
 * before the budget existed; nothing renders sharper than this.
 */
const MAX_BACKGROUND_SCALE = 0.7;

/** Floor on either side, so a tiny window still gets a usable canvas. */
const MIN_BACKGROUND_SIDE = 320;

/**
 * Picks the tier for a scene that can shed cost. Coarse pointers and the
 * weakest machines that still reach WebGL get the lean budget; anything that
 * reports nothing (Firefox and Safari hide `deviceMemory`) is trusted.
 *
 * The memory boundary is deliberately one notch above {@link isLowMemoryDevice}:
 * that gate answers "can this run at all", this one answers "how much should
 * it spend", so the 4 GB machines it admits are exactly the ones that belong
 * here rather than in the full tier.
 */
export function pickBackgroundTier(
  hints: DeviceHints = readDeviceHints(),
  coarse: boolean = isCoarsePointer(),
): BackgroundTier {
  if (coarse) return 'lite';

  const { deviceMemory, hardwareConcurrency } = hints;
  if (
    typeof deviceMemory === 'number' &&
    deviceMemory > 0 &&
    deviceMemory <= 4
  ) {
    return 'lite';
  }
  if (
    typeof hardwareConcurrency === 'number' &&
    hardwareConcurrency > 0 &&
    hardwareConcurrency <= 2
  ) {
    return 'lite';
  }

  return 'full';
}

/**
 * Canvas size for a background at a given viewport, in canvas pixels.
 *
 * The scale is uniform (the scene keeps its aspect ratio) and comes from the
 * pixel budget rather than a fixed fraction, so the cost of the scene does
 * not grow with the size of the monitor it is displayed on.
 */
export function backgroundRenderSize(
  viewport: { width: number; height: number },
  tier: BackgroundTier = 'full',
): { width: number; height: number } {
  const width = Math.max(1, viewport.width);
  const height = Math.max(1, viewport.height);
  const scale = Math.min(
    MAX_BACKGROUND_SCALE,
    Math.sqrt(BACKGROUND_PIXEL_BUDGET[tier] / (width * height)),
  );

  return {
    // Floored, not rounded: the budget is a cap, and rounding a pixel up on
    // each axis is enough to slip a few thousand pixels over it.
    width: Math.max(MIN_BACKGROUND_SIDE, Math.floor(width * scale)),
    height: Math.max(MIN_BACKGROUND_SIDE, Math.floor(height * scale)),
  };
}

/** Renderer strings that mean the browser is drawing on the CPU. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|software|basic render/i;

/**
 * Whether this browser can reach a hardware GPU at all.
 *
 * `failIfMajorPerformanceCaveat` is the browser answering the question for
 * us: it refuses a context it would have to fall back to software for
 * (Chrome's SwiftShader, Firefox's llvmpipe). That is exactly what a machine
 * with hardware acceleration switched off — or a driver the browser has
 * blocklisted after it crashed — ends up with. Those setups are the worst
 * place to put a full-viewport scene, and the browser can say so before we
 * pay to find out. When the debug extension is unavailable the renderer
 * string is empty, and the context is taken at its word.
 */
export function hasHardwareWebgl(): boolean {
  if (typeof document === 'undefined') return false;

  let gl: WebGLRenderingContext | null = null;
  try {
    gl = document.createElement('canvas').getContext('webgl', {
      failIfMajorPerformanceCaveat: true,
    });
  } catch {
    return false;
  }
  if (!gl) return false;

  const debug = gl.getExtension('WEBGL_debug_renderer_info');
  const renderer = debug
    ? String(gl.getParameter(debug.UNMASKED_RENDERER_WEBGL))
    : '';
  // The probe context has served its purpose; hand it back so it does not
  // sit in the browser's small WebGL context budget.
  gl.getExtension('WEBGL_lose_context')?.loseContext();

  return !SOFTWARE_RENDERER.test(renderer);
}

/** What a scene that measures itself should do next. */
export type SceneVerdict = 'keep' | 'lean' | 'drop';

/**
 * Budget for the live frame-time probe.
 *
 * Nothing here renders on its own: the probe is a requestAnimationFrame
 * callback reading timestamps while the real scene runs, which is as close
 * to free as a measurement gets. What it costs is the frames a bad device
 * draws before the verdict lands, so the windows are short on purpose.
 */
export const FRAME_BUDGET = {
  /**
   * Frames ignored once the scene starts. The first ones after a scene
   * appears are the shader compiles and the texture uploads — the most
   * expensive of the session, and the least representative of it.
   */
  warmupFrames: 20,
  /** The least evidence a verdict may rest on. */
  minSamples: 20,
  /** The most a struggling device has to draw before it is let go. */
  maxSamples: 90,
  /** How often the running samples are re-judged while sampling. */
  checkEvery: 10,
  /** Median frame time over the display's cadence: running lean. */
  leanRatio: 1.5,
  /** ...and past this, the scene is missing most of what the screen offers. */
  dropRatio: 2.2,
} as const;

/** Order statistic of a small sample, without interpolation. */
function percentile(samples: readonly number[], fraction: number): number {
  const sorted = [...samples].sort((a, b) => a - b);
  const position = Math.round(fraction * (sorted.length - 1));
  return sorted[Math.min(sorted.length - 1, Math.max(0, position))];
}

/**
 * Reads the frames the scene has cost so far and says what to do about it.
 *
 * Everything is relative to the display's own cadence rather than to an
 * absolute frame time, because the same 33 ms frame means "this screen runs
 * at 30 Hz" on one device and "this scene is missing every other frame" on
 * another. The median carries the verdict — a single slow frame from a font
 * swap or a garbage collection must not condemn a scene that is otherwise
 * keeping up. When the caller has no cadence on hand (the calibration never
 * finished), the fastest frames in the sample stand in for it.
 */
export function frameBudgetVerdict(
  samples: readonly number[],
  cadence?: number | null,
): SceneVerdict {
  if (samples.length < FRAME_BUDGET.minSamples) return 'keep';

  const baseline = Math.max(1, cadence ?? percentile(samples, 0.1));
  const ratio = percentile(samples, 0.5) / baseline;

  if (ratio >= FRAME_BUDGET.dropRatio) return 'drop';
  if (ratio >= FRAME_BUDGET.leanRatio) return 'lean';
  return 'keep';
}
