// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
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

function report(isIntersecting: boolean) {
  act(() => {
    observers[0].callback(
      [{ isIntersecting }] as unknown as IntersectionObserverEntry[],
      observers[0] as unknown as IntersectionObserver,
    );
  });
}

function enterView() {
  report(true);
}

function leaveView() {
  report(false);
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
  it('paints nothing while the loop waits, not the settled phrase', () => {
    const { container } = render(<GlitchMorph phrases={PHRASES} />);
    const spans = charSpans(container);

    // The opening phrase is in the markup — the server rendered it, and it
    // holds the measure — but on screen the line stays empty until the loop
    // is writing it. Showing the settled phrase here is the flash of the
    // finished text this component is supposed to avoid.
    expect(spans).toHaveLength(PHRASES[0].text.length);
    expect(spans.every((span) => span.style.opacity === '0')).toBe(true);
    expect(shownText(container)).toBe('');
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

      // Still blank: an off-screen loop would have burned its whole cycle
      // before anyone saw it, and the settled phrase standing in for it
      // would flash the finished text the moment it scrolled into view.
      expect(shownText(container)).toBe('');
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the settled fallback when there is no observer to start the loop', () => {
    // Blanking is only safe while something can come along and start the
    // loop. Without an observer nothing ever would, and the line would be
    // empty for good — the settled phrase is the graceful answer there.
    const globals = globalThis as unknown as Record<string, unknown>;
    const saved = globals.IntersectionObserver;
    delete globals.IntersectionObserver;

    try {
      const { container } = render(<GlitchMorph phrases={PHRASES} />);

      expect(shownText(container)).toBe(PHRASES[0].text);
    } finally {
      globals.IntersectionObserver = saved;
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

  it('writes the phrase in again after it leaves the screen', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchMorph phrases={PHRASES} />);
      enterView();

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 40);
      });

      leaveView();
      // Back on screen, the turn starts over rather than resuming wherever
      // the pause landed — a resume mid-hold would put the whole phrase up
      // with no writing, which is the flash this all exists to avoid.
      enterView();

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 2);
      });

      const visible = charSpans(container).filter(
        (span) => span.style.opacity !== '0',
      );
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.length).toBeLessThan(PHRASES[0].text.length);
      expect(shownText(container)).toBe(
        PHRASES[0].text.slice(0, visible.length),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('server-renders the settled phrase when there is no observer at all', () => {
    // The real server has no IntersectionObserver, and reading "no observer"
    // as visible paints a scrambling frame there that the client's first
    // render disagrees with — a hydration mismatch that throws the whole tree
    // away. The stub has to go for this to reproduce at all: the test
    // environment installs one, so the condition would never be true here.
    const globals = globalThis as unknown as Record<string, unknown>;
    const saved = globals.IntersectionObserver;
    delete globals.IntersectionObserver;

    try {
      const serverHtml = renderToStaticMarkup(<GlitchMorph phrases={PHRASES} />);

      expect(serverHtml).toContain(PHRASES[0].text);
      expect(serverHtml).not.toContain('landing-glitch-glyph');
    } finally {
      globals.IntersectionObserver = saved;
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
