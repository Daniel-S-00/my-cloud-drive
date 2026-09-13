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
import { useEnteredView } from '@/hooks/use-entered-view';
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
  /**
   * 'mount' starts the reveal on load, for the headline the page opens with.
   * 'view' waits until the headline scrolls into view, for the ones further
   * down — where a reveal that played out off screen would already be spent
   * by the time anyone saw it.
   */
  start?: 'mount' | 'view';
  /**
   * Heading level to render. The reveal has to sit on the real heading so the
   * page keeps its outline, and each section's is a different level.
   */
  as?: 'h1' | 'h2' | 'h3';
};

export function GlitchHeadline({
  parts,
  className,
  start = 'mount',
  as: Heading = 'h1',
}: GlitchHeadlineProps) {
  // The server renders the settled headline, so crawlers, no-JS readers and
  // reduced-motion users all get the real text in the first paint.
  const [frame, setFrame] = useState(() => settledFrame(parts));
  const { ref, entered } = useEnteredView<HTMLHeadingElement>();
  const ready = start === 'mount' || entered;

  // Blanked before the first client paint for anyone who allows motion. The
  // settled frame is the server's fallback — for crawlers, no-JS readers and
  // reduced motion — and leaving it up is what shows the finished headline
  // for a moment while a 'view' one scrolls into place, before the reveal
  // restarts from nothing. Blanking at mount rather than at `ready` closes
  // that window: nothing is on screen to flash in the first place.
  useBeforePaint(() => {
    if (prefersReducedMotion()) return;
    setFrame((current) => ({ ...current, revealed: 0, done: false }));
  }, []);

  useEffect(() => {
    // A 'view' headline waits blank rather than typing itself in off screen,
    // where nobody would see the reveal it was holding.
    if (!ready || frame.done) return;
    const id = setInterval(() => {
      setFrame((current) => advanceGlitch(current.chars, current.revealed));
    }, GLITCH_TIMING.tick);
    return () => clearInterval(id);
  }, [ready, frame.done]);

  const nodes: ReactNode[] = frame.chars.map((entry, index) => {
    // Characters past the reveal point are present but unpainted. Holding
    // them in the layout is what stops a centred headline from reflowing
    // character by character as it types.
    const started = index < frame.revealed;
    const scrambling = started && entry.symbol !== null;
    // The caret hangs off the last character that has started, out of flow.
    const carriesCaret = !frame.done && index === frame.revealed - 1;
    return (
      <span
        key={index}
        className={
          entry.className
            ? `landing-glitch-char ${entry.className}`
            : 'landing-glitch-char'
        }
        style={started ? undefined : { opacity: 0 }}
      >
        {/* The glyph is taken out of flow and painted over the character,
            which stays in place holding the measure. An in-flow glyph of zero
            width was not enough on its own: the headline is a shrink-to-fit
            flex item, so even that changed its width. */}
        {scrambling ? (
          <span className="landing-glitch-glyph" aria-hidden="true">
            {entry.symbol}
          </span>
        ) : null}
        <span className={scrambling ? 'landing-glitch-real' : undefined}>
          {entry.char}
        </span>
        {carriesCaret ? (
          <span className="landing-caret" aria-hidden="true" />
        ) : null}
      </span>
    );
  });

  return (
    // The scrambled glyphs are noise, so the heading is named explicitly and
    // its animated contents are hidden from assistive tech. The plain text is
    // also what the server puts in the markup, so this costs nothing for SEO.
    <Heading
      ref={ref}
      className={className}
      aria-label={parts.map((part) => part.text).join('')}
    >
      <span aria-hidden="true">{nodes}</span>
    </Heading>
  );
}
