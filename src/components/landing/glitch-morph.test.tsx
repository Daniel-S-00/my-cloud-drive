// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { GlitchMorph } from './glitch-morph';
import { GLITCH_TIMING, MORPH_TIMING, morphCycle } from '@/lib/glitch-text';

const PHRASES = [
  { text: 'Private to you.' },
  { text: 'Yours to share.' },
  { text: 'Never locked in.' },
];

const REDUCED = '(prefers-reduced-motion: reduce)';

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

type ObserverStub = {
  callback: IntersectionObserverCallback;
  observe: ReturnType<typeof vi.fn>;
  disconnect: ReturnType<typeof vi.fn>;
};

const observers: ObserverStub[] = [];

function installObserver() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      callback: IntersectionObserverCallback;
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
      takeRecords = () => [];
      root = null;
      rootMargin = '';
      thresholds = [];

      constructor(callback: IntersectionObserverCallback) {
        this.callback = callback;
        observers.push(this as unknown as ObserverStub);
      }
    },
  );
}

/** The characters the live layer is actually painting. */
function charSpans(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('.landing-morph-live > span'),
  );
}

function glyphOf(span: Element): string | null {
  return span.querySelector('.landing-glitch-glyph')?.textContent ?? null;
}

/** The phrase the live layer is spelling out, hidden characters excluded. */
function shownText(container: HTMLElement): string {
  return charSpans(container)
    .filter((span) => span.style.opacity !== '0')
    .map((span) => span.querySelector('span:last-child')?.textContent ?? '')
    .join('');
}

function enterView() {
  act(() => {
    observers[0].callback(
      [{ isIntersecting: true }] as unknown as IntersectionObserverEntry[],
      observers[0] as unknown as IntersectionObserver,
    );
  });
}

beforeEach(() => {
  observers.length = 0;
  installMatchMedia();
  installObserver();
});

afterEach(() => {
  vi.restoreAllMocks();
  // No unstubAllGlobals: vitest runs this file's afterEach before
  // testing-library's cleanup, and unmounting needs the observer still there.
});

describe('GlitchMorph', () => {
  it('opens on the first phrase, settled', () => {
    const { container } = render(<GlitchMorph phrases={PHRASES} />);

    expect(shownText(container)).toBe(PHRASES[0].text);
    expect(container.querySelectorAll('.landing-glitch-glyph')).toHaveLength(0);
  });

  it('holds every phrase in the layout, so the width cannot change', () => {
    const { container } = render(<GlitchMorph phrases={PHRASES} />);

    const ghosts = Array.from(
      container.querySelectorAll('.landing-morph-ghost'),
    ).map((ghost) => ghost.textContent);

    // The widest phrase fixes the measure even while a shorter one is showing.
    expect(ghosts).toEqual(PHRASES.map((phrase) => phrase.text));
  });

  it('reaches assistive tech with one phrase, and hides the noise', () => {
    const { container } = render(<GlitchMorph phrases={PHRASES} />);

    expect(container.querySelector('.sr-only')?.textContent).toBe(
      PHRASES[0].text,
    );
    expect(
      container.querySelector('.landing-morph-live')?.getAttribute('aria-hidden'),
    ).toBe('true');
  });

  it('waits for the element to come into view before running', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchMorph phrases={PHRASES} />);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 40);
      });

      // Still the opening phrase: an off-screen loop would have burned its
      // whole cycle before anyone saw it.
      expect(shownText(container)).toBe(PHRASES[0].text);
    } finally {
      vi.useRealTimers();
    }
  });

  it('writes the opening phrase in rather than appearing spelled out', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchMorph phrases={PHRASES} />);
      enterView();

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 3);
      });

      const visible = charSpans(container).filter(
        (span) => span.style.opacity !== '0',
      );

      // A prefix of the opening phrase, with noise still trailing the edge.
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(PHRASES[0].text.length);
      expect(shownText(container)).toBe(
        PHRASES[0].text.slice(0, visible.length),
      );
      expect(
        visible.filter((span) => glyphOf(span) !== null).length,
      ).toBeGreaterThan(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays on the opening phrase for someone who asked for less motion', () => {
    installMatchMedia({ [REDUCED]: true });
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchMorph phrases={PHRASES} />);
      enterView();

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 200);
      });

      expect(shownText(container)).toBe(PHRASES[0].text);
      expect(container.querySelectorAll('.landing-glitch-glyph')).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('takes the frames off the longest phrase', () => {
    // Guards the coupling: the component ticks once per frame, so the frame
    // budget has to be the one the cycle advertises.
    expect(MORPH_TIMING.hold).toBeGreaterThan(0);
    expect(morphCycle(PHRASES).write).toBe(
      Math.max(...PHRASES.map((phrase) => phrase.text.length)),
    );
  });
});
