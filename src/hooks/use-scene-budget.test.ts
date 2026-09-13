// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useSceneBudget } from './use-scene-budget';

/** Frames the hook spends learning the display before the scene starts. */
const CALIBRATION_FRAMES = 10;

type QueuedFrame = { handle: number; callback: FrameRequestCallback };

let queue: QueuedFrame[] = [];
let nextHandle = 1;
let clock = 0;

function installRaf() {
  queue = [];
  nextHandle = 1;
  clock = 0;

  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const handle = nextHandle;
    nextHandle += 1;
    queue.push({ handle, callback });
    return handle;
  });
  vi.stubGlobal('cancelAnimationFrame', (handle: number) => {
    queue = queue.filter((entry) => entry.handle !== handle);
  });
}

/** Runs the queued frame `delta` ms after the previous one. */
function frame(delta: number) {
  const next = queue.shift();
  if (!next) throw new Error('no frame was queued');

  clock += delta;
  act(() => next.callback(clock));
}

/** Drives the probe until it stops asking for frames, or the cap is hit. */
function run(delta: number, maxFrames = 200) {
  for (let index = 0; index < maxFrames && queue.length > 0; index += 1) {
    frame(delta);
  }
}

function start() {
  return renderHook(
    ({ running }: { running: boolean }) => useSceneBudget(running),
    { initialProps: { running: false } },
  );
}

/** A display of the given cadence, then the scene switching on. */
function calibrate(delta: number) {
  const view = start();

  run(delta, CALIBRATION_FRAMES);
  view.rerender({ running: true });

  return view;
}

beforeEach(() => {
  installRaf();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useSceneBudget', () => {
  it('keeps a scene the display can carry', () => {
    const view = calibrate(16.7);

    run(16.7);

    expect(view.result.current).toBe('keep');
    expect(queue).toHaveLength(0);
  });

  it('drops a scene that cannot keep up', () => {
    const view = calibrate(16.7);

    run(50);

    expect(view.result.current).toBe('drop');
    // Conclusive means done: the device is not asked to keep proving it.
    expect(queue).toHaveLength(0);
  });

  it('leans on a scene that is behind but not hopeless', () => {
    const view = calibrate(16.7);

    run(27);

    expect(view.result.current).toBe('lean');
    expect(queue).toHaveLength(0);
  });

  it('judges against the display it measured, not a fixed 60 Hz', () => {
    // A 30 Hz panel and a scene that holds it exactly: nothing to fix.
    const view = calibrate(33.3);

    run(33.3);

    expect(view.result.current).toBe('keep');
  });

  it('does not sample a scene that was never started', () => {
    const view = start();

    run(16.7, CALIBRATION_FRAMES);

    // The probe is idle again: with the cadence known there is nothing left
    // to watch until the scene is running.
    expect(queue).toHaveLength(0);
    expect(view.result.current).toBe('keep');
  });
});
