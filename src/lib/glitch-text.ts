/**
 * Character state for the glitch entry the landing headline types in through.
 *
 * The character list is flat and every entry carries its own class names, so
 * one pass can drive characters that came from differently styled runs. The
 * headline's second clause is its own font and colour, and flattening the
 * markup away would lose that.
 *
 * Pure by design: the timing and the glyph choice are testable without a DOM
 * or a clock.
 */

/**
 * Glyphs a character cycles through before settling. Deliberately free of
 * letters, so a scrambling character can never be mistaken for the real one.
 */
export const SCRAMBLE_GLYPHS = '#*+-=<>/\\_[]{}()';

export const GLITCH_TIMING = {
  /**
   * Milliseconds between characters. The headline is the page's largest
   * paint, so the whole reveal is tuned to finish well under a second.
   */
  tick: 22,
  /** Scramble ticks applied to a freshly revealed character. */
  scrambleMin: 2,
  scrambleMax: 5,
} as const;

export type GlitchPart = {
  text: string;
  /** Class names from the source run, carried down to each character. */
  className?: string;
};

export type GlitchChar = {
  /** The character this one settles on. */
  char: string;
  className?: string;
  /** Glyph shown instead of `char` while scrambling, null once settled. */
  symbol: string | null;
  /** Scramble ticks left; 0 means settled. */
  ticks: number;
};

export type GlitchFrame = {
  chars: GlitchChar[];
  /** How many characters have been started. */
  revealed: number;
  /** True once everything is revealed and nothing is still scrambling. */
  done: boolean;
};

/**
 * Flattens styled text runs into one character list. Spaces are kept as
 * characters rather than dropped: they hold the line open, which is what
 * keeps the headline from reflowing as it types.
 */
export function flattenGlitchParts(parts: readonly GlitchPart[]): GlitchChar[] {
  const chars: GlitchChar[] = [];
  for (const part of parts) {
    for (const char of part.text) {
      chars.push({ char, className: part.className, symbol: null, ticks: 0 });
    }
  }
  return chars;
}

/** Picks a glyph for a scrambling character. */
export function pickGlyph(rng: () => number = Math.random): string {
  return SCRAMBLE_GLYPHS[Math.floor(rng() * SCRAMBLE_GLYPHS.length)];
}

/** How many ticks a freshly revealed character scrambles for. */
export function pickScrambleTicks(rng: () => number = Math.random): number {
  const { scrambleMin, scrambleMax } = GLITCH_TIMING;
  return (
    scrambleMin + Math.floor(rng() * (scrambleMax - scrambleMin + 1))
  );
}

/**
 * Advances the reveal by one tick: the next character starts scrambling, and
 * every character already scrambling either takes a new glyph or settles on
 * its real one.
 *
 * Returned as a fresh array so React sees the change. The counts here are
 * tiny, so rebuilding beats tracking diffs by hand. Entries that did not
 * change keep their identity, which keeps the untouched spans cheap to
 * reconcile.
 */
export function advanceGlitch(
  chars: readonly GlitchChar[],
  revealed: number,
  rng: () => number = Math.random,
): GlitchFrame {
  const next = chars.map((entry) => {
    if (entry.ticks <= 0) return entry;
    const ticks = entry.ticks - 1;
    return ticks <= 0
      ? { ...entry, ticks: 0, symbol: null }
      : { ...entry, ticks, symbol: pickGlyph(rng) };
  });

  if (revealed >= next.length) {
    return { chars: next, revealed, done: next.every((e) => e.ticks <= 0) };
  }

  next[revealed] = {
    ...next[revealed],
    symbol: pickGlyph(rng),
    ticks: pickScrambleTicks(rng),
  };

  const revealedNext = revealed + 1;
  return {
    chars: next,
    revealed: revealedNext,
    done:
      revealedNext >= next.length && next.every((entry) => entry.ticks <= 0),
  };
}
