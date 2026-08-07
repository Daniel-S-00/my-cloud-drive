'use client';

import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';

const DEFAULT_DELAY_MS = 350;
const MOVE_THRESHOLD_PX = 12;
// The synthetic click that follows a long-press release fires within a
// few frames (~50ms). Keep the window just wide enough to swallow it,
// but short enough that the next deliberate tap (which takes a human
// at least ~200ms) is never eaten.
const CLICK_SUPPRESS_WINDOW_MS = 150;
const EXEMPT_SELECTOR = '[data-no-drag]';

function isExemptTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && Boolean(target.closest(EXEMPT_SELECTOR))
  );
}

/**
 * Detects a touch long-press on a row/card (touch pointer that stays
 * still for ~350ms) and fires `onTrigger` — used on mobile to enter
 * multi-selection. It is a pure gesture recognizer: it never prevent-
 * defaults pointerdown (so taps still produce clicks), and it stops
 * recognizing on movement beyond a small threshold (scroll intent).
 *
 * Exempt targets (`[data-no-drag]`: item names, buttons, menus) are
 * ignored so the native long-press text selection / context menu still
 * works there.
 *
 * The synthetic click that follows a long-press release is swallowed so
 * it can't also navigate / open the item.
 */
export function useLongPress({
  onTrigger,
  disabled = false,
  delayMs = DEFAULT_DELAY_MS,
}: {
  onTrigger: () => void;
  disabled?: boolean;
  delayMs?: number;
}) {
  const state = useRef<{
    timerId: number | null;
    startX: number;
    startY: number;
    triggered: boolean;
  }>({ timerId: null, startX: 0, startY: 0, triggered: false });
  const lastTriggerAt = useRef(0);

  // Handles for the window-level listeners attached while a long-press
  // is in flight, so cleanup can remove them without a closure-order
  // dependency between the handlers.
  const activeListeners = useRef<{
    pointerMove: ((event: PointerEvent) => void) | null;
    pointerUp: ((event: PointerEvent) => void) | null;
  }>({ pointerMove: null, pointerUp: null });

  // Keep the latest callback without recreating the gesture listeners.
  const onTriggerRef = useRef(onTrigger);
  useEffect(() => {
    onTriggerRef.current = onTrigger;
  }, [onTrigger]);

  const clearTimer = useCallback(() => {
    if (state.current.timerId !== null) {
      clearTimeout(state.current.timerId);
      state.current.timerId = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    clearTimer();
    state.current.triggered = false;
    const listeners = activeListeners.current;
    if (listeners.pointerMove) {
      window.removeEventListener('pointermove', listeners.pointerMove);
    }
    if (listeners.pointerUp) {
      window.removeEventListener('pointerup', listeners.pointerUp);
      window.removeEventListener('pointercancel', listeners.pointerUp);
    }
    listeners.pointerMove = null;
    listeners.pointerUp = null;
  }, [clearTimer]);

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      if (state.current.timerId === null || state.current.triggered) return;
      const dx = event.clientX - state.current.startX;
      const dy = event.clientY - state.current.startY;
      if (Math.hypot(dx, dy) > MOVE_THRESHOLD_PX) {
        clearTimer();
      }
    },
    [clearTimer],
  );

  const handleWindowPointerUp = useCallback(() => {
    cleanup();
  }, [cleanup]);

  // Mount-level guards: abort if the tab loses focus mid-long-press (no
  // pointerup guaranteed), swallow the synthetic click that follows a
  // trigger, and suppress the native context menu once triggered.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.hidden) cleanup();
    };
    const onWindowBlur = () => cleanup();
    const onClick = (event: MouseEvent) => {
      if (Date.now() - lastTriggerAt.current < CLICK_SUPPRESS_WINDOW_MS) {
        lastTriggerAt.current = 0;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (state.current.triggered) {
        event.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      cleanup();
    };
  }, [cleanup]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (disabled) return;
    if (event.pointerType !== 'touch') return;
    if (isExemptTarget(event.target)) return;
    if (state.current.timerId !== null) return;
    // Deliberately no preventDefault: a quick tap must still produce a
    // click (open / navigate). The long-press is recognized purely by
    // holding still.
    state.current.startX = event.clientX;
    state.current.startY = event.clientY;
    state.current.triggered = false;
    state.current.timerId = window.setTimeout(() => {
      state.current.timerId = null;
      state.current.triggered = true;
      lastTriggerAt.current = Date.now();
      onTriggerRef.current();
    }, delayMs);

    activeListeners.current.pointerMove = handleWindowPointerMove;
    activeListeners.current.pointerUp = handleWindowPointerUp;
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
  };

  return {
    handlers: {
      onPointerDown,
    },
  };
}
