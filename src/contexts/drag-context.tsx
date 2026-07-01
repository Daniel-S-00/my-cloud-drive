'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';

export type DraggedItemType = 'file' | 'folder';

export type DraggedItem = {
  type: DraggedItemType;
  id: string;
  name: string;
};

export type DragContextValue = {
  // The item currently being dragged, or null when nothing is being
  // dragged. Used by rows to render visual feedback (dimmed while
  // dragging) and by drop targets to know what to do on drop.
  draggedItem: DraggedItem | null;
  // The id of the folder currently being hovered by the drag, or
  // null when no folder is hovered. Used by folder rows to render
  // a drop highlight.
  dragOverFolderId: string | null;
  // True while the root drop zone is being hovered. Rendered as a
  // distinct visual state from a folder row hover.
  dragOverRoot: boolean;
  // True while a move Server Action is in flight. Rows use this to
  // disable further dragging until the move resolves.
  isMoving: boolean;
  // A mutable ref that always holds the latest draggedItem. Drop
  // targets read this in `onDragOver` to avoid stale-closure issues
  // (React state may not have propagated to the drop target's
  // closure by the time the first dragover event fires after the
  // drag starts).
  dragItemRef: MutableRefObject<DraggedItem | null>;
  startDrag: (item: DraggedItem) => void;
  endDrag: () => void;
  // Full reset: clears draggedItem, dragOverFolderId, dragOverRoot,
  // AND isMoving. Intended for error recovery and the global
  // window-level dragend fallback.
  resetDragState: () => void;
  setDragOverFolder: (id: string | null) => void;
  setDragOverRoot: (over: boolean) => void;
  setMoving: (moving: boolean) => void;
};

const DragContext = createContext<DragContextValue | null>(null);

export function useDragContext(): DragContextValue {
  const ctx = useContext(DragContext);
  if (!ctx) {
    throw new Error('useDragContext must be used within a <DragProvider>');
  }
  return ctx;
}

export function DragProvider({ children }: { children: ReactNode }) {
  const [draggedItem, setDraggedItem] = useState<DraggedItem | null>(null);
  const [dragOverFolderId, setDragOverFolderIdState] = useState<string | null>(
    null,
  );
  const [dragOverRoot, setDragOverRootState] = useState(false);
  const [isMoving, setMovingState] = useState(false);

  // Synchronous, always-current handle to the dragged item. Updated
  // the instant a drag starts so drop targets can read the latest
  // value from event handlers without waiting for a re-render.
  const dragItemRef = useRef<DraggedItem | null>(null);

  // Monotonic generation counter used to invalidate a deferred
  // `startDrag` state update if the drag is cancelled before that
  // update applies. See `startDrag` for why the update is deferred.
  const dragGenRef = useRef(0);

  const startDrag = useCallback((item: DraggedItem) => {
    try {
      // Update the ref synchronously so `onDragOver`/`onDrop` in the
      // drop targets see the dragged item on the very first event.
      dragItemRef.current = item;

      // CRITICAL: the React state update must NOT happen during the
      // `dragstart` event. React 19 flushes discrete state updates
      // from event handlers synchronously, so calling `setDraggedItem`
      // here would re-render every row (and mount the RootDropZone in
      // a sub-folder) *while dragstart is still firing*. Chrome treats
      // that synchronous DOM mutation of the drag source / its
      // ancestors as a reason to cancel the gesture ~30ms later
      // (dropEffect becomes "none") — which is the root cause of the
      // "drag won't grab in sub-folders, ~1 in 10 works" bug.
      //
      // Deferring to a macrotask lets Chrome commit the drag before
      // any DOM mutation runs. The generation counter lets `endDrag`
      // invalidate a pending update when the drag is cancelled before
      // the timeout fires (so we never resurrect stale drag state).
      const gen = ++dragGenRef.current;
      window.setTimeout(() => {
        if (dragGenRef.current !== gen) return;
        setDraggedItem(item);
      }, 0);
    } catch (err) {
      // Defensive: log and ensure ref is in sync even if state
      // update throws (e.g. during a render race).
      console.error('DragProvider.startDrag error:', err);
    }
  }, []);

  const endDrag = useCallback(() => {
    try {
      // Bump the generation so any deferred `startDrag` update still
      // in the task queue is discarded instead of resurrecting the
      // dragged state after the drag has already ended.
      dragGenRef.current++;
      dragItemRef.current = null;
      setDraggedItem(null);
      setDragOverFolderIdState(null);
      setDragOverRootState(false);
    } catch (err) {
      console.error('DragProvider.endDrag error:', err);
    }
  }, []);

  const resetDragState = useCallback(() => {
    try {
      dragGenRef.current++;
      dragItemRef.current = null;
      setDraggedItem(null);
      setDragOverFolderIdState(null);
      setDragOverRootState(false);
      setMovingState(false);
    } catch (err) {
      console.error('DragProvider.resetDragState error:', err);
    }
  }, []);

  const setDragOverFolder = useCallback((id: string | null) => {
    try {
      setDragOverFolderIdState(id);
    } catch (err) {
      console.error('DragProvider.setDragOverFolder error:', err);
    }
  }, []);

  const setDragOverRoot = useCallback((over: boolean) => {
    try {
      setDragOverRootState(over);
    } catch (err) {
      console.error('DragProvider.setDragOverRoot error:', err);
    }
  }, []);

  const setMoving = useCallback((moving: boolean) => {
    try {
      setMovingState(moving);
    } catch (err) {
      console.error('DragProvider.setMoving error:', err);
    }
  }, []);

  // Global safety net: if a drag ends for any reason without the
  // source row's `onDragEnd` firing (e.g. the user releases the
  // mouse outside the window, or the drag is cancelled by the
  // browser), reset every piece of drag state so stale highlights
  // don't linger. `endDrag` is idempotent and React de-duplicates
  // no-op setState calls when the values are already at their
  // initial state.
  useEffect(() => {
    const handleGlobalDragEnd = () => {
      endDrag();
    };
    window.addEventListener('dragend', handleGlobalDragEnd);
    return () => {
      window.removeEventListener('dragend', handleGlobalDragEnd);
    };
  }, [endDrag]);

  const value = useMemo<DragContextValue>(
    () => ({
      draggedItem,
      dragOverFolderId,
      dragOverRoot,
      isMoving,
      dragItemRef,
      startDrag,
      endDrag,
      resetDragState,
      setDragOverFolder,
      setDragOverRoot,
      setMoving,
    }),
    [
      draggedItem,
      dragOverFolderId,
      dragOverRoot,
      isMoving,
      dragItemRef,
      startDrag,
      endDrag,
      resetDragState,
      setDragOverFolder,
      setDragOverRoot,
      setMoving,
    ],
  );

  return <DragContext.Provider value={value}>{children}</DragContext.Provider>;
}
