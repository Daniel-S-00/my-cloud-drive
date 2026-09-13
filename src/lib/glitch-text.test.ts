// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
  GLITCH_TIMING,
  SCRAMBLE_GLYPHS,
  advanceGlitch,
  flattenGlitchParts,
  pickGlyph,
  pickScrambleTicks,
  startDecode,
  type GlitchFrame,
} from './glitch-text';

/** Deterministic LCG, so the scramble assertions are reproducible. */
function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('flattenGlitchParts', () => {
  it('keeps every character in order, across runs', () => {
    const chars = flattenGlitchParts([{ text: 'ab' }, { text: 'cd' }]);
    expect(chars.map((entry) => entry.char)).toEqual(['a', 'b', 'c', 'd']);
  });

  it("carries each run's class names down to its characters", () => {
    // The headline's second clause is its own font and colour. If the class
    // names do not survive flattening, that styling is lost when it animates.
    const chars = flattenGlitchParts([
      { text: 'ab' },
      { text: 'cd', className: 'accent' },
    ]);
    expect(chars.map((entry) => entry.className)).toEqual([
      undefined,
      undefined,
      'accent',
      'accent',
    ]);
  });

  it('keeps spaces, so the line never reflows as it types', () => {
    const chars = flattenGlitchParts([{ text: 'a b' }]);
    expect(chars.map((entry) => entry.char)).toEqual(['a', ' ', 'b']);
  });

  it('starts every character settled', () => {
    const chars = flattenGlitchParts([{ text: 'ab' }]);
    expect(chars.every((entry) => entry.symbol === null)).toBe(true);
    expect(chars.every((entry) => entry.ticks === 0)).toBe(true);
  });

  it('handles empty input', () => {
    expect(flattenGlitchParts([])).toEqual([]);
    expect(flattenGlitchParts([{ text: '' }])).toEqual([]);
  });
});

describe('pickGlyph', () => {
  it('always returns something from the set', () => {
    const rng = seeded(11);
    for (let i = 0; i < 200; i += 1) {
      expect(SCRAMBLE_GLYPHS.includes(pickGlyph(rng))).toBe(true);
    }
  });

  it('never returns a letter, so noise cannot read as the text', () => {
    // Guards the constant rather than the function: adding a letter to
    // SCRAMBLE_GLYPHS would make a scrambling character indistinguishable
    // from a settled one.
    expect(SCRAMBLE_GLYPHS).not.toMatch(/[a-z]/i);
  });

  it('can reach every glyph in the set', () => {
    const rng = seeded(3);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i += 1) seen.add(pickGlyph(rng));
    expect(seen.size).toBe(SCRAMBLE_GLYPHS.length);
  });
});

describe('pickScrambleTicks', () => {
  it('stays inside the configured range', () => {
    const rng = seeded(7);
    for (let i = 0; i < 200; i += 1) {
      const ticks = pickScrambleTicks(rng);
      expect(ticks).toBeGreaterThanOrEqual(GLITCH_TIMING.scrambleMin);
      expect(ticks).toBeLessThanOrEqual(GLITCH_TIMING.scrambleMax);
    }
  });

  it('reaches both ends of the range, so the scramble varies', () => {
    const rng = seeded(13);
    const seen = new Set<number>();
    for (let i = 0; i < 300; i += 1) seen.add(pickScrambleTicks(rng));
    expect(seen).toContain(GLITCH_TIMING.scrambleMin);
    expect(seen).toContain(GLITCH_TIMING.scrambleMax);
  });
});

describe('startDecode', () => {
  it('starts every character at once, rather than one per tick', () => {
    const chars = flattenGlitchParts([{ text: 'abc' }]);
    const decoding = startDecode(chars, seeded(4));

    expect(decoding).toHaveLength(3);
    expect(decoding.every((entry) => entry.symbol !== null)).toBe(true);
    expect(
      decoding.every((entry) => entry.ticks === GLITCH_TIMING.decodeTicks),
    ).toBe(true);
  });

  it('resolves far faster than a headline character does', () => {
    // The point of the variant: a paragraph must not make the reader wait,
    // so its whole scramble lasts a fraction of a headline's per-character
    // scramble.
    expect(GLITCH_TIMING.decodeTicks * GLITCH_TIMING.tick).toBeLessThan(150);
  });

  it('only ever shows glyphs from the set', () => {
    const decoding = startDecode(
      flattenGlitchParts([{ text: 'abcd' }]),
      seeded(2),
    );
    for (const entry of decoding) {
      expect(SCRAMBLE_GLYPHS.includes(entry.symbol ?? '')).toBe(true);
    }
  });

  it('leaves the input untouched', () => {
    const chars = flattenGlitchParts([{ text: 'ab' }]);
    const before = chars.map((entry) => ({ ...entry }));

    startDecode(chars, seeded(1));

    expect(chars).toEqual(before);
  });

  it('drains through advanceGlitch once the reveal is already complete', () => {
    const chars = startDecode(flattenGlitchParts([{ text: 'ab' }]), seeded(5));
    let frame: GlitchFrame = { chars, revealed: chars.length, done: false };
    let guard = 0;

    while (!frame.done && guard < 20) {
      frame = advanceGlitch(frame.chars, frame.revealed, seeded(guard + 1));
      guard += 1;
    }

    expect(frame.done).toBe(true);
    expect(frame.chars.map((entry) => entry.char).join('')).toBe('ab');
    expect(frame.chars.every((entry) => entry.symbol === null)).toBe(true);
  });
});

describe('advanceGlitch', () => {
  const HEADLINE = 'Your files, in your orbit.';

  /** Runs the effect to completion and reports what it took to get there. */
  function runToEnd(text: string, seed: number) {
    const rng = seeded(seed);
    let frame: GlitchFrame = {
      chars: flattenGlitchParts([{ text }]),
      revealed: 0,
      done: false,
    };
    const symbols: string[] = [];
    let ticks = 0;

    while (!frame.done && ticks < 500) {
      for (const entry of frame.chars) {
        if (entry.symbol !== null) symbols.push(entry.symbol);
      }
      frame = advanceGlitch(frame.chars, frame.revealed, rng);
      ticks += 1;
    }

    return { frame, ticks, symbols };
  }

  it('starts exactly one character per tick, in order', () => {
    const rng = seeded(2);
    const chars = flattenGlitchParts([{ text: 'abc' }]);

    const first = advanceGlitch(chars, 0, rng);
    expect(first.revealed).toBe(1);
    expect(first.chars[0].symbol).not.toBeNull();
    // Not started yet, so still settled — present but invisible.
    expect(first.chars[1].symbol).toBeNull();
    expect(first.chars[2].symbol).toBeNull();

    const second = advanceGlitch(first.chars, first.revealed, rng);
    expect(second.revealed).toBe(2);
    expect(second.chars[1].symbol).not.toBeNull();
  });

  it('shows noise while scrambling, never the real character', () => {
    const { symbols } = runToEnd(HEADLINE, 4);
    expect(symbols.length).toBeGreaterThan(0);
    for (const symbol of symbols) {
      expect(SCRAMBLE_GLYPHS.includes(symbol)).toBe(true);
    }
  });

  it('settles every character back onto its own glyph', () => {
    const { frame } = runToEnd(HEADLINE, 9);
    expect(frame.done).toBe(true);
    expect(frame.chars.every((entry) => entry.symbol === null)).toBe(true);
    expect(frame.chars.map((entry) => entry.char).join('')).toBe(HEADLINE);
    expect(frame.revealed).toBe(frame.chars.length);
  });

  it('always finishes, so the caret can be removed', () => {
    const { ticks } = runToEnd(HEADLINE, 21);
    // One tick per character, plus however long the last one scrambles.
    // Without this bound a character could scramble forever.
    expect(ticks).toBeLessThanOrEqual(
      HEADLINE.length + GLITCH_TIMING.scrambleMax,
    );
  });

  it('leaves the input untouched', () => {
    const chars = flattenGlitchParts([{ text: 'ab' }]);
    const before = chars.map((entry) => ({ ...entry }));

    advanceGlitch(chars, 0, seeded(3));

    expect(chars).toEqual(before);
  });

  it('keeps untouched entries identical, so their spans stay cheap', () => {
    const chars = flattenGlitchParts([{ text: 'abc' }]);
    const frame = advanceGlitch(chars, 0, seeded(6));

    expect(frame.chars[1]).toBe(chars[1]);
    expect(frame.chars[2]).toBe(chars[2]);
  });

  it('reports done only once nothing is left scrambling', () => {
    const rng = seeded(8);
    const chars = flattenGlitchParts([{ text: 'ab' }]);

    let frame = advanceGlitch(chars, 0, rng);
    frame = advanceGlitch(frame.chars, frame.revealed, rng);
    expect(frame.revealed).toBe(2);
    // Everything is revealed, but the scramble is still running.
    expect(frame.done).toBe(false);

    let guard = 0;
    while (!frame.done && guard < 50) {
      frame = advanceGlitch(frame.chars, frame.revealed, rng);
      guard += 1;
    }
    expect(frame.done).toBe(true);
  });

  it('handles an empty character list', () => {
    const frame = advanceGlitch([], 0, seeded(1));
    expect(frame.done).toBe(true);
    expect(frame.revealed).toBe(0);
  });
});
