'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useTransition,
  type DragEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { moveFolder } from '@/app/actions/folders';
import { useDragContext, type DraggedItem } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

// Touch drag arms on a long-press so it never collides with scrolling.
const TOUCH_DRAG_DELAY_MS = 350;
const TOUCH_CANCEL_DISTANCE_PX = 12;

// Elements carrying this attribute are exempt from being a drag source
// (text selection and interactive controls): the item name, action
// buttons, the 3-dot menu, etc.
const DRAG_EXEMPT_SELECTOR = '[data-no-drag]';

// Clicks within this window after a touch drag ends are swallowed so a
// long-press-then-release can't trigger row selection / navigation.
const CLICK_SUPPRESS_WINDOW_MS = 400;

type DropTarget =
  | { kind: 'folder'; id: string; name: string }
  | { kind: 'root'; id: null; name: string };

function findDropTarget(clientX: number, clientY: number): DropTarget | null {
  const el = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!el) return null;
  const folderEl = el.closest<HTMLElement>('[data-drop-folder-id]');
  if (folderEl) {
    const id = folderEl.getAttribute('data-drop-folder-id');
    const name = folderEl.getAttribute('data-drop-folder-name') ?? '';
    if (id) return { kind: 'folder', id, name };
  }
  if (el.closest('[data-drop-root]')) {
    return { kind: 'root', id: null, name: 'My Drive' };
  }
  return null;
}

function isExemptTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest(DRAG_EXEMPT_SELECTOR));
}

/**
 * Makes a file/folder row or card a drag source, on both mouse and
 * touch:
 *
 * - Mouse uses native HTML5 drag-and-drop. The consumer spreads the
 *   returned handlers onto the row/card and sets `draggable`. The name
 *   text carries `data-no-drag` so click-dragging over it selects text
 *   (dragstart is cancelled for exempt targets) instead of starting a
 *   move.
 *
 * - Touch has no HTML5 DnD, so a long-press (350ms without movement)
 *   arms a drag, a floating ghost follows the finger, `data-drop-*`
 *   attributes decide the target, and releasing over one performs the
 *   move. Exempt targets (the name, buttons) never arm, so the native
 *   long-press text selection / context menu still works there.
 */
export function useItemDrag({
  item,
  disabled = false,
}: {
  item: DraggedItem;
  disabled?: boolean;
}) {
  const router = useRouter();
  const {
    startDrag,
    endDrag,
    isMoving,
    setDragOverFolder,
    setDragOverRoot,
    setMoving,
    resetDragState,
    dragItemRef,
  } = useDragContext();
  const [, startTransition] = useTransition();
  const [isTouchDragging, setIsTouchDragging] = useState(false);

  const isDisabled = disabled || isMoving;

  const touchState = useRef<{
    timerId: number | null;
    startX: number;
    startY: number;
    active: boolean;
    lastTargetKey: string | null;
  }>({
    timerId: null,
    startX: 0,
    startY: 0,
    active: false,
    lastTargetKey: null,
  });
  // Handles for the window-level listeners attached while a touch drag
  // is in flight. Stored so cleanup can remove them without creating a
  // closure-order dependency between the handlers.
  const activeListeners = useRef<{
    pointerMove: ((event: PointerEvent) => void) | null;
    pointerUp: ((event: PointerEvent) => void) | null;
    touchMove: ((event: TouchEvent) => void) | null;
  }>({ pointerMove: null, pointerUp: null, touchMove: null });
  const ghostRef = useRef<HTMLDivElement | null>(null);
  const lastDragEndAt = useRef(0);

  const positionGhost = useCallback((clientX: number, clientY: number) => {
    const ghost = ghostRef.current;
    if (!ghost) return;
    ghost.style.transform = `translate(${clientX - 8}px, ${clientY - 48}px)`;
  }, []);

  const showGhost = useCallback(
    (clientX: number, clientY: number) => {
      if (ghostRef.current) return;
      const ghost = document.createElement('div');
      ghost.className =
        'pointer-events-none fixed left-0 top-0 z-[100] flex max-w-[16rem] items-center gap-2 truncate rounded-lg border border-accent-primary/40 bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary shadow-2xl';
      ghost.setAttribute('data-testid', 'drag-ghost');
      ghost.textContent = item.name;
      document.body.appendChild(ghost);
      ghostRef.current = ghost;
      positionGhost(clientX, clientY);
    },
    [item, positionGhost],
  );

  const hideGhost = useCallback(() => {
    ghostRef.current?.remove();
    ghostRef.current = null;
  }, []);

  const applyTargetHighlight = useCallback(
    (target: DropTarget | null) => {
      const key = target ? `${target.kind}:${target.id ?? ''}` : null;
      if (key === touchState.current.lastTargetKey) return;
      touchState.current.lastTargetKey = key;
      if (target?.kind === 'folder') {
        setDragOverRoot(false);
        setDragOverFolder(target.id);
      } else if (target?.kind === 'root') {
        setDragOverFolder(null);
        setDragOverRoot(true);
      } else {
        setDragOverFolder(null);
        setDragOverRoot(false);
      }
    },
    [setDragOverFolder, setDragOverRoot],
  );

  const performDrop = useCallback(
    (target: DropTarget) => {
      const dropped = dragItemRef.current ?? item;
      const targetFolderId = target.kind === 'folder' ? target.id : null;
      const targetName = target.kind === 'folder' ? target.name : 'My Drive';

      // Self-drop guard: on touch a long-press-and-release over the
      // source itself is usually an aborted drag, so cancel silently
      // (descendant cycles are still rejected server-side).
      if (dropped.type === 'folder' && targetFolderId === dropped.id) {
        endDrag();
        return;
      }

      setMoving(true);
      startTransition(async () => {
        try {
          if (dropped.type === 'file') {
            const result = await moveFile({
              fileId: dropped.id,
              targetFolderId,
            });
            toast.success(
              result.wasRenamed ? 'File moved (renamed)' : 'File moved',
              {
                description: `"${dropped.name}" → "${targetName}"${
                  result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
                }`,
              },
            );
          } else {
            const result = await moveFolder({
              folderId: dropped.id,
              targetParentId: targetFolderId,
            });
            toast.success(
              result.wasRenamed ? 'Folder moved (renamed)' : 'Folder moved',
              {
                description: `"${dropped.name}" → "${targetName}"${
                  result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
                }`,
              },
            );
          }
          router.refresh();
        } catch (err) {
          toast.error('Move failed', {
            description: err instanceof Error ? err.message : 'Unknown error',
          });
        } finally {
          resetDragState();
        }
      });
    },
    [dragItemRef, endDrag, item, resetDragState, router, setMoving, startTransition],
  );

  const cleanupTouchDrag = useCallback(() => {
    const state = touchState.current;
    if (state.timerId !== null) {
      clearTimeout(state.timerId);
      state.timerId = null;
    }
    state.active = false;
    state.lastTargetKey = null;
    setIsTouchDragging(false);
    hideGhost();
    const listeners = activeListeners.current;
    if (listeners.pointerMove) {
      window.removeEventListener('pointermove', listeners.pointerMove);
    }
    if (listeners.pointerUp) {
      window.removeEventListener('pointerup', listeners.pointerUp);
      window.removeEventListener('pointercancel', listeners.pointerUp);
    }
    if (listeners.touchMove) {
      window.removeEventListener('touchmove', listeners.touchMove);
    }
    listeners.pointerMove = null;
    listeners.pointerUp = null;
    listeners.touchMove = null;
  }, [hideGhost]);

  // Abort any pending long-press or in-flight touch drag without
  // performing a drop. Used when the tab loses focus mid-gesture so a
  // missed pointerup/pointercancel can't leave the touchmove blocker
  // attached or drag state stale. Idempotent.
  const abortTouchDrag = useCallback(() => {
    cleanupTouchDrag();
    endDrag();
  }, [cleanupTouchDrag, endDrag]);

  const handleTouchMovePrevent = useCallback((event: TouchEvent) => {
    // While a touch drag is armed, eat the underlying touchmove so the
    // gesture never turns into page scroll.
    if (touchState.current.active) {
      event.preventDefault();
    }
  }, []);

  const handleWindowPointerMove = useCallback(
    (event: PointerEvent) => {
      const state = touchState.current;
      if (state.active) {
        positionGhost(event.clientX, event.clientY);
        applyTargetHighlight(findDropTarget(event.clientX, event.clientY));
        return;
      }
      // Not armed yet: if the finger moves too far the user is
      // scrolling — cancel the pending long-press.
      if (state.timerId !== null) {
        const dx = event.clientX - state.startX;
        const dy = event.clientY - state.startY;
        if (Math.hypot(dx, dy) > TOUCH_CANCEL_DISTANCE_PX) {
          clearTimeout(state.timerId);
          state.timerId = null;
        }
      }
    },
    [applyTargetHighlight, positionGhost],
  );

  const handleWindowPointerUp = useCallback(
    (event: PointerEvent) => {
      const wasActive = touchState.current.active;
      const target = wasActive
        ? findDropTarget(event.clientX, event.clientY)
        : null;
      const isCancel = event.type === 'pointercancel';
      cleanupTouchDrag();
      if (!wasActive) return;
      if (event.type !== 'pointercancel') {
        // A synthetic click follows touch pointerup; swallow it so a
        // long-press release can't also navigate / select the row.
        lastDragEndAt.current = Date.now();
      }
      if (isCancel || !target) {
        endDrag();
        return;
      }
      performDrop(target);
    },
    [cleanupTouchDrag, endDrag, performDrop],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (isDisabled) return;
    if (event.pointerType !== 'touch') return;
    // Exempt targets (name text, buttons, menu) keep native long-press
    // behavior (text selection / context menu) — never arm from them.
    if (isExemptTarget(event.target)) return;
    // NOTE: we deliberately do NOT preventDefault here so a quick tap
    // still produces a click (row selection / navigation). Scrolling is
    // blocked only once the long-press has actually armed.

    const state = touchState.current;
    state.startX = event.clientX;
    state.startY = event.clientY;
    state.timerId = window.setTimeout(() => {
      if (touchState.current.active) return;
      touchState.current.active = true;
      setIsTouchDragging(true);
      startDrag(item);
      showGhost(event.clientX, event.clientY);
    }, TOUCH_DRAG_DELAY_MS);

    activeListeners.current.pointerMove = handleWindowPointerMove;
    activeListeners.current.pointerUp = handleWindowPointerUp;
    activeListeners.current.touchMove = handleTouchMovePrevent;
    window.addEventListener('pointermove', handleWindowPointerMove);
    window.addEventListener('pointerup', handleWindowPointerUp);
    window.addEventListener('pointercancel', handleWindowPointerUp);
    window.addEventListener('touchmove', handleTouchMovePrevent, {
      passive: false,
    });
  };

  const onDragStart = (event: DragEvent<HTMLElement>) => {
    try {
      if (isDisabled || isExemptTarget(event.target)) {
        // Cancelling lets the browser fall back to default behavior —
        // dragging over the name selects its text, dragging on a
        // control does nothing.
        event.preventDefault();
        return;
      }
      event.stopPropagation();
      event.dataTransfer.setData(
        DRAG_MIME,
        JSON.stringify({ type: item.type, id: item.id, name: item.name }),
      );
      event.dataTransfer.effectAllowed = 'move';
      startDrag(item);
    } catch (err) {
      console.error('useItemDrag onDragStart error:', err);
      endDrag();
    }
  };

  const onDragEnd = useCallback(() => {
    endDrag();
  }, [endDrag]);

  // Mount-level guards: swallow the synthetic click right after a touch
  // drag, and suppress the native context menu while one is armed.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (Date.now() - lastDragEndAt.current < CLICK_SUPPRESS_WINDOW_MS) {
        lastDragEndAt.current = 0;
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const onContextMenu = (event: MouseEvent) => {
      if (touchState.current.active) {
        event.preventDefault();
      }
    };
    document.addEventListener('click', onClick, true);
    document.addEventListener('contextmenu', onContextMenu, true);
    // If the tab loses focus mid-gesture (phone locks, app switched
    // away) no pointerup/pointercancel is guaranteed to fire. Abort
    // the pending long-press / active drag so the window-level
    // touchmove blocker and drag state can't linger and freeze input.
    const onVisibilityChange = () => {
      if (document.hidden) abortTouchDrag();
    };
    const onWindowBlur = () => abortTouchDrag();
    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.removeEventListener('contextmenu', onContextMenu, true);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [abortTouchDrag]);

  // Clean up window listeners if the component unmounts mid-drag.
  useEffect(() => {
    return () => {
      cleanupTouchDrag();
      endDrag();
      hideGhost();
    };
  }, [cleanupTouchDrag, endDrag, hideGhost]);

  return {
    handlers: {
      onDragStart,
      onDragEnd,
      onPointerDown,
    },
    isDraggable: !isDisabled,
    isTouchDragging,
  };
}
