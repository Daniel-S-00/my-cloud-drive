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
  morphAt,
  morphCycle,
  MORPH_TIMING,
  stableGlyph,
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

  it('lasts long enough to register and short enough not to gate reading', () => {
    // The first cut ran at four ticks, which resolved before the eye caught
    // it and read as a snap rather than a decode. It stays bounded: the block
    // is a change of glyph over text that is already in place, so this
    // decides how long the noise lasts, not how long the reader waits.
    const total = GLITCH_TIMING.decodeTicks * GLITCH_TIMING.tick;
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThan(300);
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

describe('morphCycle', () => {
  it('sizes every phrase window to the longest phrase', () => {
    // One character leaves per frame and one arrives per frame, so the
    // longest phrase decides the window and no phrase gets cut off.
    expect(morphCycle([{ text: 'ab' }])).toEqual({
      erase: 2,
      write: 2,
      total: MORPH_TIMING.hold + 4,
    });
    expect(morphCycle([{ text: 'ab' }, { text: 'abcdefghij' }])).toEqual({
      erase: 10,
      write: 10,
      total: MORPH_TIMING.hold + 20,
    });
  });

  it('still yields a usable window for an empty list', () => {
    expect(morphCycle([])).toEqual({
      erase: 1,
      write: 1,
      total: MORPH_TIMING.hold + 2,
    });
  });
});

describe('stableGlyph', () => {
  it('only ever returns glyphs from the set', () => {
    for (let seed = 0; seed < 200; seed += 1) {
      expect(SCRAMBLE_GLYPHS.includes(stableGlyph(seed))).toBe(true);
    }
  });

  it('is stable for one seed and spread across seeds', () => {
    expect(stableGlyph(7)).toBe(stableGlyph(7));

    const seen = new Set<string>();
    for (let seed = 0; seed < 200; seed += 1) seen.add(stableGlyph(seed));
    expect(seen.size).toBeGreaterThan(4);
  });
});

describe('morphAt', () => {
  const PHRASES = [
    { text: 'in your orbit.' },
    { text: 'on your terms.' },
    { text: 'under your control.' },
  ];
  const cycle = morphCycle(PHRASES);
  const { hold } = MORPH_TIMING;

  it('opens on the first phrase, settled', () => {
    const state = morphAt(PHRASES, 0);

    expect(state.index).toBe(0);
    expect(state.revealed).toBe(PHRASES[0].text.length);
    // Hold is the quiet part of the cycle: nothing is scrambling.
    expect(state.chars.every((entry) => entry.symbol === null)).toBe(true);
  });

  it('stays settled for the whole hold window', () => {
    const lastHeld = morphAt(PHRASES, hold - 1);

    expect(lastHeld.index).toBe(0);
    expect(lastHeld.chars.every((entry) => entry.symbol === null)).toBe(true);
  });

  it('takes one character away per frame while erasing', () => {
    expect(morphAt(PHRASES, hold).revealed).toBe(PHRASES[0].text.length - 1);
    expect(morphAt(PHRASES, hold + 1).revealed).toBe(
      PHRASES[0].text.length - 2,
    );
  });

  it('trails noise at the moving edge, and only there', () => {
    const state = morphAt(PHRASES, hold + 2);
    const visible = state.chars.slice(0, state.revealed);
    const noisy = visible.filter((entry) => entry.symbol !== null);

    expect(noisy.length).toBeGreaterThan(0);
    // The phrase behind the edge has already settled — noise is the tell of
    // movement, so covering the whole line with it would read as static.
    expect(noisy.length).toBeLessThan(visible.length);
    for (const entry of noisy) {
      expect(SCRAMBLE_GLYPHS.includes(entry.symbol ?? '')).toBe(true);
    }
    expect(visible[0].symbol).toBeNull();
  });

  it('brings the next phrase in one character at a time', () => {
    expect(morphAt(PHRASES, hold + cycle.erase).revealed).toBe(1);
    expect(morphAt(PHRASES, hold + cycle.erase + 1).revealed).toBe(2);
  });

  it('moves on to the next phrase, and wraps at the end of the list', () => {
    expect(morphAt(PHRASES, cycle.total + hold).index).toBe(1);
    expect(morphAt(PHRASES, cycle.total * PHRASES.length + 1).index).toBe(0);
  });

  it('renders a frame identically, so a re-render cannot reshuffle it', () => {
    const frame = hold + 3;

    expect(morphAt(PHRASES, frame)).toEqual(morphAt(PHRASES, frame));
  });

  it('wraps cleanly for a negative or a far-future frame', () => {
    // Reading backwards is a legitimate query and must not index out of the
    // list: one frame before the start is the closing frame of the loop
    // before, not of the opening one.
    expect(morphAt(PHRASES, -1)).toEqual(
      morphAt(PHRASES, cycle.total * PHRASES.length - 1),
    );

    // A whole number of turns, so it lands back on the opening phrase.
    expect(morphAt(PHRASES, cycle.total * 300).index).toBe(0);
  });

  it('survives an empty phrase list', () => {
    const state = morphAt([], 0);

    expect(state.chars).toEqual([]);
    expect(state.revealed).toBe(0);
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
