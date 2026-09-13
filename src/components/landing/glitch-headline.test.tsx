// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GLITCH_TIMING, SCRAMBLE_GLYPHS } from '@/lib/glitch-text';
import { GlitchHeadline } from './glitch-headline';

const PARTS = [
  { text: 'Your files, ' },
  { text: 'in your orbit.', className: 'accent' },
];
const PLAIN = 'Your files, in your orbit.';

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

type ObserverStub = { callback: IntersectionObserverCallback };

/** Records the callback, so a test decides when the heading is seen. */
function installObserver(): ObserverStub[] {
  const observers: ObserverStub[] = [];

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

  return observers;
}

function enterView(observers: ObserverStub[]) {
  act(() => {
    observers[0].callback(
      [{ isIntersecting: true }] as unknown as IntersectionObserverEntry[],
      observers[0] as unknown as IntersectionObserver,
    );
  });
}

/** The per-character spans, excluding the caret. */
function charSpans(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(
      'h1 > span[aria-hidden] > span:not(.landing-caret)',
    ),
  );
}

function hiddenCount(spans: HTMLElement[]): number {
  return spans.filter((span) => span.style.opacity === '0').length;
}

function textOf(spans: HTMLElement[]): string {
  return spans.map((span) => span.textContent ?? '').join('');
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('GlitchHeadline server output', () => {
  it('renders the real, settled headline before any script runs', () => {
    const html = renderToStaticMarkup(<GlitchHeadline parts={PARTS} />);
    const text = html.replace(/<[^>]*>/g, '');

    // This is the SEO, no-JS and reduced-motion guarantee: the markup a
    // crawler receives is the finished headline, not an empty shell.
    expect(text).toBe(PLAIN);
    expect(html).toContain(`aria-label="${PLAIN}"`);
    // Nothing is held back behind an inline opacity, so the first paint is
    // the finished text.
    expect(html).not.toContain('opacity:0');
  });
});

describe('GlitchHeadline reveal', () => {
  it('starts from the beginning rather than showing the settled text', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const spans = charSpans(container);

      expect(spans).toHaveLength(PLAIN.length);
      // The reveal begins before paint, so the blank start is what the
      // browser actually shows first.
      expect(hiddenCount(spans)).toBe(PLAIN.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts exactly one character per tick', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const spans = charSpans(container);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick);
      });
      expect(hiddenCount(spans)).toBe(PLAIN.length - 1);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick);
      });
      expect(hiddenCount(spans)).toBe(PLAIN.length - 2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('holds unrevealed characters in the layout instead of dropping them', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const spans = charSpans(container);

      // Every character is present from the start, so a centred headline
      // cannot reflow as the reveal advances.
      expect(textOf(spans)).toBe(PLAIN);
      for (const span of spans) {
        expect(span.style.display).not.toBe('none');
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('scrambles characters through noise, never a letter', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const spans = charSpans(container);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 8);
      });

      // The glyph lives in its own span ahead of the character, so the
      // character's own text is no longer what tells us it is scrambling.
      const glyphOf = (span: Element) =>
        span.querySelector('.landing-glitch-glyph')?.textContent ?? null;
      const scrambling = spans.filter((span) => glyphOf(span) !== null);
      expect(scrambling.length).toBeGreaterThan(0);
      for (const span of scrambling) {
        // A scrambling character can only ever show a glyph from the set,
        // which is why the set must not contain letters.
        expect(SCRAMBLE_GLYPHS.includes(glyphOf(span) ?? '')).toBe(true);
        // And the real character is still in the flow holding its own
        // measure — that is what stops the headline re-wrapping mid-reveal.
        expect(span.querySelector('.landing-glitch-real')?.textContent).toBe(
          PLAIN[spans.indexOf(span)],
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles every character back onto the real headline', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const spans = charSpans(container);

      act(() => {
        vi.advanceTimersByTime(
          GLITCH_TIMING.tick * (PLAIN.length + GLITCH_TIMING.scrambleMax + 2),
        );
      });

      expect(textOf(spans)).toBe(PLAIN);
      expect(hiddenCount(spans)).toBe(0);
      expect(container.querySelector('.landing-caret')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps each run’s class names on its characters', () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    const { container } = render(<GlitchHeadline parts={PARTS} />);
    const spans = charSpans(container);

    // The accent half has its own font and colour; losing it here would
    // restyle half the headline the moment it animates.
    const accented = Array.from(spans[PLAIN.indexOf('in your')].classList);
    expect(accented).toContain('accent');
    expect(Array.from(spans[0].classList)).not.toContain('accent');
    // And the positioning class is on every character from the start, so a
    // scramble never changes the box it paints into.
    for (const span of spans) {
      expect(Array.from(span.classList)).toContain('landing-glitch-char');
    }
  });
});

describe('GlitchHeadline caret', () => {
  it('appears once typing starts and goes away when it finishes', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);

      // Nothing has started, so there is nothing to point at.
      expect(container.querySelector('.landing-caret')).toBeNull();

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick);
      });
      expect(container.querySelector('.landing-caret')).not.toBeNull();

      act(() => {
        vi.advanceTimersByTime(
          GLITCH_TIMING.tick * (PLAIN.length + GLITCH_TIMING.scrambleMax + 2),
        );
      });
      expect(container.querySelector('.landing-caret')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GlitchHeadline reduced motion', () => {
  it('leaves the settled headline untouched', () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const spans = charSpans(container);

      expect(hiddenCount(spans)).toBe(0);
      expect(textOf(spans)).toBe(PLAIN);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 50);
      });

      // No typing, no scrambling, no caret.
      expect(textOf(spans)).toBe(PLAIN);
      expect(container.querySelector('.landing-caret')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GlitchHeadline accessibility', () => {
  it('names the heading, so the noise is never announced', () => {
    installMatchMedia();
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchHeadline parts={PARTS} />);
      const heading = container.querySelector('h1');

      expect(heading?.getAttribute('aria-label')).toBe(PLAIN);
      // The animated characters are transient noise and must stay out of the
      // accessibility tree; the label above is what gets read.
      expect(heading?.querySelector('span[aria-hidden="true"]')).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('GlitchHeadline view start', () => {
  it('paints nothing while it waits below the fold', () => {
    installMatchMedia();
    installObserver();
    vi.useFakeTimers();
    try {
      const { container } = render(
        <GlitchHeadline parts={PARTS} start="view" />,
      );
      const spans = charSpans(container);

      // The settled headline is the server's fallback, not a first frame:
      // leaving it up while the heading comes up the screen is the flash of
      // the finished text this start mode is meant to avoid.
      expect(hiddenCount(spans)).toBe(PLAIN.length);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 10);
      });

      // And it does not type itself in off screen either.
      expect(hiddenCount(spans)).toBe(PLAIN.length);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reveals from the start once it has scrolled into view', () => {
    installMatchMedia();
    const observers = installObserver();
    vi.useFakeTimers();
    try {
      const { container } = render(
        <GlitchHeadline parts={PARTS} start="view" />,
      );
      enterView(observers);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 3);
      });

      expect(hiddenCount(charSpans(container))).toBe(PLAIN.length - 3);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the settled headline for someone who asked for less motion', () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    installObserver();
    const { container } = render(<GlitchHeadline parts={PARTS} start="view" />);

    expect(hiddenCount(charSpans(container))).toBe(0);
  });
});
