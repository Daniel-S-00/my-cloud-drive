'use client';

import { useEffect, useMemo, useState } from 'react';
import { useEnteredView } from '@/hooks/use-entered-view';
import {
  GLITCH_TIMING,
  decodeAt,
  flattenGlitchParts,
  type GlitchPart,
} from '@/lib/glitch-text';
import { prefersReducedMotion } from '@/lib/webgl-capability';

export type GlitchTextProps = {
  /** Styled runs, in order. Each run's class names reach its characters. */
  parts: readonly GlitchPart[];
  className?: string;
};

/**
 * The short variant of the glitch entry, for running text.
 *
 * Every character scrambles at once and settles within a handful of frames,
 * with nothing hidden along the way: a paragraph the reader is waiting to
 * read must never make them wait for it to be typed out. The reveal is a
 * change of glyph, not of visibility, which is what keeps it from costing a
 * reader any time.
 *
 * The scramble is not state. It is derived from how many frames have passed
 * since the block entered view, so the render stays a plain function of the
 * tick and no effect has to kick anything off.
 *
 * Renders a plain inline span, so the caller keeps its own element and its
 * own semantics — a paragraph stays a paragraph.
 */
export function GlitchText({ parts, className }: GlitchTextProps) {
  const { ref, entered } = useEnteredView<HTMLSpanElement>();
  const settled = useMemo(() => flattenGlitchParts(parts), [parts]);
  const [frames, setFrames] = useState(0);

  // The motion preference is asked here rather than in the hook: entering
  // view and being allowed to animate are different questions, and folding
  // them together would scramble the text for someone who asked for less
  // motion.
  const animate = entered && !prefersReducedMotion();

  // Phase 0 is the settled text. Entering view jumps straight to phase 1, so
  // the scramble is already on screen in the frame the block arrives rather
  // than showing a tick of real text first.
  const phase = animate ? frames + 1 : 0;
  const chars = useMemo(() => decodeAt(settled, phase), [settled, phase]);
  const done = phase > GLITCH_TIMING.decodeTicks;

  useEffect(() => {
    if (!animate || done) return;
    const id = setInterval(() => {
      setFrames((current) => current + 1);
    }, GLITCH_TIMING.tick);
    return () => clearInterval(id);
  }, [animate, done]);

  return (
    <span ref={ref} className={className}>
      {/* The animated characters are transient noise, so the accessible text
          is a separate copy and the animation is hidden from assistive tech.
          Without it a screen reader arriving on the block mid-scramble would
          read glyphs. */}
      <span className="sr-only">{parts.map((part) => part.text).join('')}</span>
      <span aria-hidden="true">
        {chars.map((entry, index) => {
          const scrambling = entry.symbol !== null;
          return (
            <span
              key={index}
              className={
                entry.className
                  ? `landing-glitch-char ${entry.className}`
                  : 'landing-glitch-char'
              }
            >
              {/* Same trick as the headline: the glyph paints from a
                  zero-width box ahead of the character, so it costs no width.
                  Replacing the character outright was what re-wrapped a
                  paragraph and changed the containers' size while it
                  resolved. */}
              {scrambling ? (
                <span className="landing-glitch-glyph" aria-hidden="true">
                  {entry.symbol}
                </span>
              ) : null}
              <span className={scrambling ? 'landing-glitch-real' : undefined}>
                {entry.char}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
