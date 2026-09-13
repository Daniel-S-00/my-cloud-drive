// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';
import { GLITCH_TIMING, SCRAMBLE_GLYPHS } from '@/lib/glitch-text';
import { GlitchText } from './glitch-text';

const PARTS = [
  { text: 'Your files stay in your orbit', className: 'accent' },
];
const PLAIN = 'Your files stay in your orbit';

type ObserverStub = { callback: IntersectionObserverCallback };
const observers: ObserverStub[] = [];
const globals = globalThis as unknown as Record<string, unknown>;

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

function installObserver() {
  globals.IntersectionObserver = class {
    callback: IntersectionObserverCallback;
    observe = vi.fn();
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
      observers.push(this as unknown as ObserverStub);
    }
  };
}

/** The animated character spans, i.e. everything inside the hidden wrapper. */
function charSpans(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>('[aria-hidden="true"] > span'),
  );
}

function enterView() {
  act(() => {
    observers[0].callback(
      [
        { isIntersecting: true, target: document.body },
      ] as unknown as IntersectionObserverEntry[],
      observers[0] as unknown as IntersectionObserver,
    );
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

beforeEach(() => {
  observers.length = 0;
  installMatchMedia();
  installObserver();
});

describe('GlitchText before it is seen', () => {
  it('renders the real, settled text', () => {
    const { container } = render(<GlitchText parts={PARTS} />);

    // Matches what the server renders, so nothing shifts when the reveal
    // does start and a reader who never scrolls still reads real words.
    expect(charSpans(container).map((span) => span.textContent).join('')).toBe(
      PLAIN,
    );
  });
});

describe('GlitchText accessibility', () => {
  it('keeps a plain copy for assistive tech and hides the animation', () => {
    const { container } = render(<GlitchText parts={PARTS} />);

    const copy = container.querySelector('.sr-only');
    expect(copy?.textContent).toBe(PLAIN);
    // The animated characters are noise; a screen reader navigating onto the
    // block mid-scramble must not read glyphs.
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('GlitchText reveal', () => {
  it('scrambles the whole block at once on entry, never hiding it', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchText parts={PARTS} />);
      enterView();

      const spans = charSpans(container);

      // Every character changes at the same moment. It is a change of glyph,
      // not of visibility: a reader never waits for a paragraph to type out.
      // The glyph sits in its own span ahead of the character, so the
      // character's text is no longer what tells us it is scrambling.
      const glyphOf = (span: Element) =>
        span.querySelector('.landing-glitch-glyph')?.textContent ?? null;
      const scrambling = spans.filter((span) => glyphOf(span) !== null);
      expect(scrambling).toHaveLength(PLAIN.length);
      for (const span of scrambling) {
        expect(SCRAMBLE_GLYPHS.includes(glyphOf(span) ?? '')).toBe(true);
        expect(span.style.opacity).not.toBe('0');
        // And the real character is still in the flow holding its measure:
        // replacing it outright was what re-wrapped paragraphs mid-decode.
        expect(span.querySelector('.landing-glitch-real')?.textContent).toBe(
          PLAIN[spans.indexOf(span)],
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('settles back onto the real text within a few frames', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchText parts={PARTS} />);
      enterView();

      act(() => {
        vi.advanceTimersByTime(
          GLITCH_TIMING.tick * (GLITCH_TIMING.decodeTicks + 1),
        );
      });

      const spans = charSpans(container);
      expect(spans.map((span) => span.textContent).join('')).toBe(PLAIN);
    } finally {
      vi.useRealTimers();
    }
  });

  it('finishes in a fixed handful of frames, however long the text is', () => {
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchText parts={PARTS} />);
      enterView();

      // The block resolves in decodeTicks frames regardless of length. A
      // reveal that started one character per tick would still be working
      // through the third character here, with the rest of the paragraph
      // still to come — which is exactly the wait this variant exists to
      // avoid.
      expect(GLITCH_TIMING.decodeTicks).toBeLessThan(PLAIN.length);
      // Bounded in frames, not in characters: the block costs the same
      // whether it holds a phrase or a paragraph.
      expect(GLITCH_TIMING.decodeTicks * GLITCH_TIMING.tick).toBeLessThan(300);

      act(() => {
        vi.advanceTimersByTime(
          GLITCH_TIMING.tick * GLITCH_TIMING.decodeTicks,
        );
      });

      expect(charSpans(container).map((span) => span.textContent).join('')).toBe(
        PLAIN,
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('carries the run class names onto its characters', () => {
    const { container } = render(<GlitchText parts={PARTS} />);

    for (const span of charSpans(container)) {
      const classes = Array.from(span.classList);
      expect(classes).toContain('accent');
      // The positioning class rides along, so a scramble never changes the
      // box the character paints into.
      expect(classes).toContain('landing-glitch-char');
    }
  });

  it('never scrambles for someone who asked for less motion', () => {
    installMatchMedia({ '(prefers-reduced-motion: reduce)': true });
    vi.useFakeTimers();
    try {
      const { container } = render(<GlitchText parts={PARTS} />);
      enterView();

      // Asserted on the frame it arrives, not after settling. The earlier
      // version of this test advanced past the scramble and so passed while
      // the block was scrambling anyway.
      expect(
        charSpans(container).map((span) => span.textContent).join(''),
      ).toBe(PLAIN);

      act(() => {
        vi.advanceTimersByTime(GLITCH_TIMING.tick * 20);
      });

      expect(
        charSpans(container).map((span) => span.textContent).join(''),
      ).toBe(PLAIN);
    } finally {
      vi.useRealTimers();
    }
  });
});
