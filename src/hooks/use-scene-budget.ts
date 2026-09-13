'use client';

import { useEffect, useState } from 'react';
import {
  FRAME_BUDGET,
  frameBudgetVerdict,
  type SceneVerdict,
} from '@/lib/webgl-capability';

/**
 * Frames sampled while the scene is still off, to learn the display's own
 * cadence before there is anything else to blame a slow frame on.
 */
const CALIBRATION_FRAMES = 10;

/**
 * Watches what a scene costs and answers whether it should keep running.
 *
 * Both phases are passive: a requestAnimationFrame callback reading
 * timestamps, never a render of its own. Nothing like a synthetic benchmark
 * is needed — the expensive thing is already running, and the only question
 * is whether to let it finish.
 *
 * While the scene is off the hook measures the display: the frame time of a
 * screen with nothing to draw. That number is what lets one verdict mean the
 * same thing on a 30 Hz panel and on a 120 Hz one. Once the scene is drawing
 * it samples frame times and judges them against it.
 *
 * The verdict only moves one way, and sampling stops the moment it is
 * conclusive: a device that cannot carry the scene should not have to keep
 * proving it.
 */
export function useSceneBudget(active: boolean): SceneVerdict {
  const [cadence, setCadence] = useState<number | null>(null);
  const [verdict, setVerdict] = useState<SceneVerdict>('keep');

  useEffect(() => {
    if (active || cadence !== null) return;

    let handle = 0;
    let previous = 0;
    let seen = 0;
    const samples: number[] = [];

    const tick = (now: number) => {
      if (previous > 0 && !document.hidden) samples.push(now - previous);
      previous = now;
      seen += 1;

      if (seen >= CALIBRATION_FRAMES) {
        // The fastest frame is the one least polluted by the page's own
        // work, so it is the closest thing to the display's cadence.
        if (samples.length > 0) setCadence(Math.min(...samples));
        return;
      }
      handle = window.requestAnimationFrame(tick);
    };

    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [active, cadence]);

  useEffect(() => {
    if (!active || verdict !== 'keep') return;

    let handle = 0;
    let previous = 0;
    let seen = 0;
    const samples: number[] = [];

    const tick = (now: number) => {
      if (previous > 0 && !document.hidden) samples.push(now - previous);
      previous = now;
      seen += 1;

      if (seen <= FRAME_BUDGET.warmupFrames) {
        handle = window.requestAnimationFrame(tick);
        return;
      }

      if (samples.length >= FRAME_BUDGET.maxSamples) {
        setVerdict(frameBudgetVerdict(samples, cadence));
        return;
      }

      if (
        samples.length >= FRAME_BUDGET.minSamples &&
        samples.length % FRAME_BUDGET.checkEvery === 0
      ) {
        const next = frameBudgetVerdict(samples, cadence);
        if (next !== 'keep') {
          setVerdict(next);
          return;
        }
      }

      handle = window.requestAnimationFrame(tick);
    };

    handle = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(handle);
  }, [active, verdict, cadence]);

  return verdict;
}
