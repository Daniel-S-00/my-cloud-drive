'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  GLITCH_TIMING,
  MORPH_TIMING,
  morphAt,
  morphCycle,
  type GlitchPart,
} from '@/lib/glitch-text';
import { prefersReducedMotion } from '@/lib/webgl-capability';

export type GlitchMorphProps = {
  /** Phrases to cycle through, in order. */
  phrases: readonly GlitchPart[];
  /** Extra classes for the wrapper. */
  className?: string;
};

/**
 * A phrase that rewrites itself: held for a beat, scrambled away one
 * character at a time, and the next one scrambled in the same way.
 *
 * Two things keep it steady and cheap. Every phrase sits in the same grid
 * cell, so the cell is as wide as the longest one and the text around it
 * never reflows as the phrase changes length. And the loop only ticks while
 * it is on screen — a hero has no business rendering 45 times a second once
 * it has scrolled away.
 */
export function GlitchMorph({ phrases, className }: GlitchMorphProps) {
  const host = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      setVisible(entries.some((entry) => entry.isIntersecting));
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Frame zero is the first phrase, settled. That is what the server renders
  // and what someone who asked for less motion keeps seeing.
  // Only tick while it is actually on screen.
  //
  // Deliberately no fallback for a browser without an IntersectionObserver:
  // "no observer" is also true during the server render, so treating it as
  // visible made the server paint a scrambling frame that the client's first
  // render disagreed with — a hydration mismatch that threw away the whole
  // tree. Without an observer the phrase simply holds still, which is the
  // graceful answer anyway.
  const animating = !prefersReducedMotion() && visible;
  // Start on the write that brings the opening phrase in rather than on its
  // hold, so the line scrambles itself alive instead of appearing already
  // spelled out. That write closes the previous turn of the loop, which is
  // why the offset counts back a whole turn.
  const { total, erase } = morphCycle(phrases);
  const offset =
    phrases.length > 0
      ? (phrases.length - 1) * total + MORPH_TIMING.hold + erase
      : 0;
  const state = useMemo(
    () => morphAt(phrases, animating ? frame + offset : 0),
    [phrases, animating, frame, offset],
  );

  useEffect(() => {
    if (!animating) return;
    const id = setInterval(
      () => setFrame((current) => current + 1),
      GLITCH_TIMING.tick,
    );
    return () => clearInterval(id);
  }, [animating]);

  return (
    <span
      ref={host}
      className={className ? `landing-morph ${className}` : 'landing-morph'}
    >
      {/* One phrase reaches assistive tech; the rest are decoration on the
          same idea, and the animated layers are noise. */}
      <span className="sr-only">
        {phrases.length > 0 ? phrases[0].text : ''}
      </span>
      {phrases.map((phrase, index) => (
        <span
          key={`ghost-${index}`}
          className="landing-morph-ghost"
          aria-hidden="true"
        >
          {phrase.text}
        </span>
      ))}
      <span className="landing-morph-live" aria-hidden="true">
        {state.chars.map((entry, index) => {
          const shown = index < state.revealed;
          const scrambling = shown && entry.symbol !== null;
          return (
            <span
              key={index}
              className={
                entry.className
                  ? `landing-glitch-char ${entry.className}`
                  : 'landing-glitch-char'
              }
              style={shown ? undefined : { opacity: 0 }}
            >
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
