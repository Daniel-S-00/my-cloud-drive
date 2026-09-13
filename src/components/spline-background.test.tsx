// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import SplineBackground from './spline-background';
import { backgroundRenderSize } from '@/lib/webgl-capability';

const app = vi.hoisted(() => ({
  setSize: vi.fn(),
  stop: vi.fn(),
  play: vi.fn(),
  dispose: vi.fn(),
}));

const hardware = vi.hoisted(() => ({ available: true }));

const probe = vi.hoisted(() => ({
  verdict: 'keep' as 'keep' | 'lean' | 'drop',
}));

vi.mock('@/lib/webgl-capability', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/webgl-capability')>()),
  // jsdom has no WebGL at all, so the hardware probe would always refuse.
  hasHardwareWebgl: () => hardware.available,
}));

vi.mock('@/hooks/use-scene-budget', () => ({
  useSceneBudget: () => probe.verdict,
}));

vi.mock('@splinetool/react-spline', async () => {
  const React = await import('react');
  return {
    default: function MockSpline({
      onLoad,
    }: {
      onLoad?: (loaded: unknown) => void;
    }) {
      React.useEffect(() => {
        onLoad?.(app);
        return () => app.dispose();
      }, [onLoad]);
      return <div data-testid="spline-canvas" />;
    },
  };
});

const COARSE = '(pointer: coarse)';

let idleQueue: Array<() => void> = [];
let runIdleImmediately = true;

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

function installIdle() {
  idleQueue = [];
  vi.stubGlobal('requestIdleCallback', (callback: () => void) => {
    if (runIdleImmediately) {
      callback();
      return 1;
    }
    idleQueue.push(callback);
    return idleQueue.length;
  });
  vi.stubGlobal('cancelIdleCallback', () => {});
}

function setHints(hints: Record<string, number>) {
  for (const [key, value] of Object.entries(hints)) {
    Object.defineProperty(window.navigator, key, { value, configurable: true });
  }
}

function viewport() {
  return { width: window.innerWidth, height: window.innerHeight };
}

beforeEach(() => {
  vi.clearAllMocks();
  runIdleImmediately = true;
  hardware.available = true;
  probe.verdict = 'keep';
  installMatchMedia();
  installIdle();
  setHints({ deviceMemory: 8, hardwareConcurrency: 8 });
});

afterEach(() => {
  const navigator = window.navigator as unknown as Record<string, unknown>;
  delete navigator.deviceMemory;
  delete navigator.hardwareConcurrency;
  vi.unstubAllGlobals();
});

describe('SplineBackground', () => {
  it('keeps the static backdrop when the device cannot run the scene', () => {
    installMatchMedia({ [COARSE]: true });
    const { container } = render(<SplineBackground />);

    expect(container.querySelector('.drafting-grid')).not.toBeNull();
    expect(screen.queryByTestId('spline-canvas')).toBeNull();
    expect(app.setSize).not.toHaveBeenCalled();
  });

  it('keeps the static backdrop when the browser has no hardware path', () => {
    hardware.available = false;
    const { container } = render(<SplineBackground />);

    expect(container.querySelector('.drafting-grid')).not.toBeNull();
    expect(screen.queryByTestId('spline-canvas')).toBeNull();
    expect(app.setSize).not.toHaveBeenCalled();
  });

  it('waits for the first idle moment before mounting the scene', async () => {
    runIdleImmediately = false;
    render(<SplineBackground />);

    // The runtime has not been asked for anything yet: on a weak machine
    // this is the difference between parsing the scene and painting the
    // page first.
    expect(screen.queryByTestId('spline-canvas')).toBeNull();
    expect(app.setSize).not.toHaveBeenCalled();

    act(() => {
      for (const callback of idleQueue) callback();
    });

    expect(await screen.findByTestId('spline-canvas')).not.toBeNull();
  });

  it('sizes the canvas from the pixel budget, not the viewport', async () => {
    render(<SplineBackground />);
    await screen.findByTestId('spline-canvas');

    const expected = backgroundRenderSize(viewport());

    expect(app.setSize).toHaveBeenCalledWith(expected.width, expected.height);
    expect(expected.width * expected.height).toBeLessThanOrEqual(700_000);
    expect(expected.width).toBeLessThan(window.innerWidth);
  });

  it('runs the lean tier smaller and without pointer interaction', async () => {
    setHints({ deviceMemory: 4, hardwareConcurrency: 4 });
    const { container } = render(<SplineBackground />);
    await screen.findByTestId('spline-canvas');

    const expected = backgroundRenderSize(viewport(), 'lite');

    expect(app.setSize).toHaveBeenCalledWith(expected.width, expected.height);
    expect(expected.width).toBeLessThan(backgroundRenderSize(viewport()).width);
    expect(container.querySelector('.pointer-events-none')).not.toBeNull();
  });

  it('steps down when the probe catches the scene behind', async () => {
    probe.verdict = 'lean';
    const { container } = render(<SplineBackground />);
    await screen.findByTestId('spline-canvas');

    const expected = backgroundRenderSize(viewport(), 'lite');

    expect(app.setSize).toHaveBeenCalledWith(expected.width, expected.height);
    expect(container.querySelector('.pointer-events-none')).not.toBeNull();
  });

  it('gives the scene up when the probe measures it failing', async () => {
    const view = render(<SplineBackground />);
    await screen.findByTestId('spline-canvas');
    expect(app.dispose).not.toHaveBeenCalled();

    probe.verdict = 'drop';
    view.rerender(<SplineBackground />);

    expect(view.container.querySelector('.drafting-grid')).not.toBeNull();
    expect(screen.queryByTestId('spline-canvas')).toBeNull();
    // Unmounting the scene is what frees the GPU: the wrapper disposes the
    // runtime, and with it the WebGL context.
    expect(app.dispose).toHaveBeenCalled();
  });
});
