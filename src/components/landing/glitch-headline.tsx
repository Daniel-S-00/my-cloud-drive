'use client';

import {
  useEffect,
  useLayoutEffect,
  useState,
  type ReactNode,
} from 'react';
import {
  GLITCH_TIMING,
  advanceGlitch,
  flattenGlitchParts,
  type GlitchFrame,
  type GlitchPart,
} from '@/lib/glitch-text';
import { prefersReducedMotion } from '@/lib/webgl-capability';

/**
 * useLayoutEffect warns when a client component is rendered on the server.
 * The reveal still has to start before the browser paints, otherwise the
 * settled headline shows for a frame and then blanks — so the client wants
 * the layout variant and the server wants the plain one.
 */
const useBeforePaint =
  typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The state the server renders: everything revealed, nothing scrambling. */
function settledFrame(parts: readonly GlitchPart[]): GlitchFrame {
  const chars = flattenGlitchParts(parts);
  return { chars, revealed: chars.length, done: true };
}

export type GlitchHeadlineProps = {
  /** Styled runs, in order. Each run's class names reach its characters. */
  parts: readonly GlitchPart[];
  className?: string;
};

export function GlitchHeadline({ parts, className }: GlitchHeadlineProps) {
  // The server renders the settled headline, so crawlers, no-JS readers and
  // reduced-motion users all get the real text in the first paint.
  const [frame, setFrame] = useState(() => settledFrame(parts));

  useBeforePaint(() => {
    if (prefersReducedMotion()) return;
    setFrame((current) => ({ ...current, revealed: 0, done: false }));
  }, []);

  useEffect(() => {
    if (frame.done) return;
    const id = setInterval(() => {
      setFrame((current) => advanceGlitch(current.chars, current.revealed));
    }, GLITCH_TIMING.tick);
    return () => clearInterval(id);
  }, [frame.done]);

  const nodes: ReactNode[] = frame.chars.map((entry, index) => {
    // Characters past the reveal point are present but unpainted. Holding
    // them in the layout is what stops a centred headline from reflowing
    // character by character as it types.
    const started = index < frame.revealed;
    return (
      <span
        key={index}
        className={entry.className}
        style={started ? undefined : { opacity: 0 }}
      >
        {started && entry.symbol !== null ? entry.symbol : entry.char}
      </span>
    );
  });

  // The caret sits just past the last character that has started.
  if (!frame.done && frame.revealed > 0) {
    nodes.splice(
      frame.revealed,
      0,
      <span key="caret" className="landing-caret" />,
    );
  }

  return (
    // The scrambled glyphs are noise, so the heading is named explicitly and
    // its animated contents are hidden from assistive tech. The plain text is
    // also what the server puts in the markup, so this costs nothing for SEO.
    <h1
      className={className}
      aria-label={parts.map((part) => part.text).join('')}
    >
      <span aria-hidden="true">{nodes}</span>
    </h1>
  );
}
