/**
 * True on touch-first devices (phones/tablets) where the primary
 * pointer has no hover and coarse accuracy. Used to switch row
 * interactions to touch-friendly defaults (e.g. single tap opens).
 */
export function isCoarsePointer(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(pointer: coarse)').matches;
}
