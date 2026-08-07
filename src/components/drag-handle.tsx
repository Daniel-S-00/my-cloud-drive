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
import { GripVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { moveFolder } from '@/app/actions/folders';
import { useDragContext, type DraggedItem } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

// Touch drag arms on a long-press so it never collides with
// scrolling. These tune the activation window.
const TOUCH_DRAG_DELAY_MS = 350;
const TOUCH_CANCEL_DISTANCE_PX = 12;

type DragHandleProps = {
  item: DraggedItem;
  disabled?: boolean;
  label?: string;
  className?: string;
};

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

/**
 * Drag handle for both mouse and touch.
 *
 * Mouse uses the native HTML5 drag-and-drop API (the `draggable`
 * attribute + `dragstart`/`dragend` below) which the drop targets
 * consume via their `onDrop` handlers.
 *
 * Touch has no HTML5 DnD, so the handle re-implements the gesture
 * with Pointer Events: a long-press (350ms, no movement) arms the
 * drag, then a floating ghost follows the finger while `data-drop-*`
 * attributes on the folder rows / root drop zone decide the target,
 * and releasing over one performs the move. The handle carries
 * `touch-action: none` so a drag started on it never turns into
 * page scroll.
 */
export function DragHandle({
  item,
  disabled = false,
  label = 'Drag to move',
  className,
}: DragHandleProps) {
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
  const [isDragging, setIsDragging] = useState(false);
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
  // Handles for the window-level listeners attached while a touch
  // drag is in flight. Stored so cleanup can remove them without
  // creating a closure-order dependency between the handlers.
  const activeListeners = useRef<{
    pointerMove: ((event: PointerEvent) => void) | null;
    pointerUp: ((event: PointerEvent) => void) | null;
    touchMove: ((event: TouchEvent) => void) | null;
  }>({ pointerMove: null, pointerUp: null, touchMove: null });
  const ghostRef = useRef<HTMLDivElement | null>(null);

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
      // source card is usually an aborted drag, so cancel silently
      // instead of surfacing an error (descendant cycles are still
      // rejected server-side).
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
                  result.wasRenamed
                    ? ` (renamed to "${result.newName}")`
                    : ''
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
                  result.wasRenamed
                    ? ` (renamed to "${result.newName}")`
                    : ''
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

  const handleTouchMovePrevent = useCallback(
    (event: TouchEvent) => {
      // The handle's touch-action:none already stops scroll for
      // gestures that start on it; this is a belt-and-suspenders
      // guard while a touch drag is armed.
      if (touchState.current.active) {
        event.preventDefault();
      }
    },
    [],
  );

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
      if (isCancel || !target) {
        endDrag();
        return;
      }
      performDrop(target);
    },
    [cleanupTouchDrag, endDrag, performDrop],
  );

  const onPointerDown = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (isDisabled) return;
    if (event.pointerType !== 'touch') return;
    // Cancel the native long-press context menu / text selection.
    event.preventDefault();

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

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    try {
      if (isDisabled) {
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
      window.setTimeout(() => setIsDragging(true), 0);
    } catch (err) {
      console.error('DragHandle onDragStart error:', err);
      endDrag();
      setIsDragging(false);
    }
  };

  const onDragEnd = () => {
    setIsDragging(false);
    endDrag();
  };

  // Clean up window listeners if the component unmounts mid-drag.
  // `cleanupTouchDrag` is idempotent (clears the pending timer, removes
  // any attached listeners, hides the ghost), so calling it unconditionally
  // is safe both during an active drag and on a plain unmount.
  useEffect(() => {
    return () => {
      cleanupTouchDrag();
      endDrag();
      hideGhost();
    };
  }, [cleanupTouchDrag, endDrag, hideGhost]);

  const baseClass = [
    'flex h-7 w-5 cursor-grab touch-none items-center justify-center rounded text-text-secondary transition-colors',
    isDisabled
      ? 'cursor-not-allowed opacity-40'
      : 'hover:bg-bg-surface-hover hover:text-text-primary active:cursor-grabbing',
    isDragging || isTouchDragging ? 'opacity-40' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      draggable={!isDisabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onPointerDown={onPointerDown}
      onClick={(event) => event.preventDefault()}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className={baseClass}
      data-testid="drag-handle"
    >
      <GripVertical className="h-4 w-4" aria-hidden />
    </button>
  );
}
