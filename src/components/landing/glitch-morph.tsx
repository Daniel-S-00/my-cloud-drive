'use client';

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  GLITCH_TIMING,
  MORPH_TIMING,
  morphAt,
  morphCycle,
  type GlitchPart,
} from '@/lib/glitch-text';
import { prefersReducedMotion } from '@/lib/webgl-capability';

/**
 * useLayoutEffect warns when a client component is rendered on the server.
 * The blank has to land before the browser paints, otherwise the settled
 * phrase shows for a frame and then jumps into the scramble.
 */
const useBeforePaint =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

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
 *
 * It never sits there spelled out, either. The settled opening phrase is the
 * fallback the server renders and all a reader who asked for less motion
 * needs; everyone else watches the phrase arrive, because writing it is the
 * only way it reaches the screen.
 */
export function GlitchMorph({ phrases, className }: GlitchMorphProps) {
  const host = useRef<HTMLSpanElement | null>(null);
  const [visible, setVisible] = useState(false);
  const [frame, setFrame] = useState(0);
  const [painted, setPainted] = useState(false);

  // The client's first render has to agree with the server's settled phrase
  // or hydration throws the tree away, so the blank lands on the paint right
  // after that one.
  useBeforePaint(() => setPainted(true), []);

  useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver((entries) => {
      const onScreen = entries.some((entry) => entry.isIntersecting);
      setVisible(onScreen);
      // Leaving the stage restarts the turn. Picking a frozen loop back up
      // would drop the phrase on screen whole whenever the pause happened to
      // land in its hold, which is the settled state the blank below exists
      // to keep out of sight; restarting writes every appearance in the same
      // way.
      if (!onScreen) setFrame(0);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Frame zero is the first phrase, settled: what the server renders, and
  // what someone who asked for less motion keeps.
  // Only tick while it is actually on screen.
  //
  // Deliberately no fallback for a browser without an IntersectionObserver:
  // "no observer" is also true during the server render, so treating it as
  // visible made the server paint a scrambling frame that the client's first
  // render disagreed with — a hydration mismatch that threw away the whole
  // tree. Without an observer the phrase simply holds still, which is the
  // graceful answer anyway.
  const reduced = prefersReducedMotion();
  const animating = !reduced && visible;
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

  // While the loop is not running, the settled phrase is a fallback and not
  // a state to watch: left on screen it is the finished text parked there
  // before the scramble, and the same flash every time the line comes back
  // into view. A browser with no observer is the exception — blanking there
  // would leave nothing behind it.
  const waiting =
    painted &&
    !reduced &&
    typeof IntersectionObserver !== 'undefined' &&
    !animating;
  const revealed = waiting ? 0 : state.revealed;

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
          const shown = index < revealed;
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
