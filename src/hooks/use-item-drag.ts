'use client';

import { useCallback, type DragEvent } from 'react';
import { useDragContext, type DraggedItem } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

// Elements carrying this attribute are exempt from being a drag source
// (text selection and interactive controls): the item name, action
// buttons, the 3-dot menu, etc.
const DRAG_EXEMPT_SELECTOR = '[data-no-drag]';

function isExemptTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement && Boolean(target.closest(DRAG_EXEMPT_SELECTOR))
  );
}

/**
 * Makes a file/folder row or card a drag source using native HTML5
 * drag-and-drop (mouse / precision pointers only).
 *
 * Touch has no HTML5 DnD; on mobile, moving items is done from the
 * 3-dot menu ("Move to folder") or the multi-select action bar, and a
 * long-press starts multi-selection instead (see `useLongPress`).
 *
 * The name text carries `data-no-drag`, so `dragstart` from over it is
 * cancelled and the browser falls back to text selection.
 */
export function useItemDrag({
  item,
  disabled = false,
}: {
  item: DraggedItem;
  disabled?: boolean;
}) {
  const { startDrag, endDrag, isMoving } = useDragContext();

  const isDisabled = disabled || isMoving;

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

  return {
    handlers: {
      onDragStart,
      onDragEnd,
    },
    isDraggable: !isDisabled,
  };
}
