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

      const scrambling = spans.filter(
        (span, index) => (span.textContent ?? '') !== PLAIN[index],
      );
      expect(scrambling.length).toBeGreaterThan(0);
      for (const span of scrambling) {
        // A scrambling character can only ever show a glyph from the set,
        // which is why the set must not contain letters.
        expect(SCRAMBLE_GLYPHS.includes(span.textContent ?? '')).toBe(true);
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
    expect(spans[PLAIN.indexOf('in your')].className).toBe('accent');
    expect(spans[0].className).toBe('');
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
