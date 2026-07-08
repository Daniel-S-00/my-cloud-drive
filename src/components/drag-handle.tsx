'use client';

import { useState, type DragEvent } from 'react';
import { useDragContext, type DraggedItem } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

type DragHandleProps = {
  item: DraggedItem;
  // When true the handle renders but does not initiate a drag.
  // Used to disable the handle during in-flight uploads, active
  // moves, or when the context reports another move is in flight.
  disabled?: boolean;
  // A short, human-readable label for screen readers and the
  // hover tooltip. Defaults to "Drag to move".
  label?: string;
  // Optional additional classes applied to the outer button.
  className?: string;
};

/**
 * Vertical "grip" icon (two columns of three dots) used as the
 * drag affordance in the file and folder rows. Hand-rolled to
 * match the lucide-react `GripVertical` style since the project
 * does not depend on lucide-react.
 */
function GripVertical({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none"
      aria-hidden
    >
      {/* Left column of dots */}
      <circle cx="9" cy="6" r="1.25" />
      <circle cx="9" cy="12" r="1.25" />
      <circle cx="9" cy="18" r="1.25" />
      {/* Right column of dots */}
      <circle cx="15" cy="6" r="1.25" />
      <circle cx="15" cy="12" r="1.25" />
      <circle cx="15" cy="18" r="1.25" />
    </svg>
  );
}

/**
 * Dedicated drag handle button used by the file and folder rows.
 *
 * Scoping the drag to a single, clearly marked button (rather than
 * the whole row) eliminates the interference that HTML5 drag
 * events suffer when the row also contains interactive children
 * like Next.js `<Link>` components — especially after soft
 * navigations into subfolders, where the previous "the entire row
 * is draggable" pattern intermittently failed because the link's
 * own pointer event handling stole the dragstart.
 *
 * The handle is the only element in the row that initiates a drag;
 * the rest of the row keeps its normal click behavior (open
 * preview, follow a link, press a button, etc.).
 */
export function DragHandle({
  item,
  disabled = false,
  label = 'Drag to move',
  className,
}: DragHandleProps) {
  const { startDrag, endDrag, isMoving } = useDragContext();
  // Suppress the native browser drag image preview at the start of
  // the drag — the default ghost is opaque and obscures the row
  // underneath. We render our own subtle dim instead.
  const [isDragging, setIsDragging] = useState(false);

  const isDisabled = disabled || isMoving;

  const onDragStart = (event: DragEvent<HTMLButtonElement>) => {
    try {
      if (isDisabled) {
        event.preventDefault();
        return;
      }
      // Prevent the event from bubbling to ancestor handlers that
      // could interfere with dragstart (notably the Next.js Link
      // used for folder navigation in the folder row).
      event.stopPropagation();
      event.dataTransfer.setData(
        DRAG_MIME,
        JSON.stringify({ type: item.type, id: item.id, name: item.name }),
      );
      event.dataTransfer.effectAllowed = 'move';
      startDrag(item);
      // Defer the visual (isDragging) state update out of the
      // dragstart event for the same reason startDrag defers its own
      // state: a synchronous className mutation on the drag source
      // during dragstart can make Chrome cancel the gesture. The dim
      // is cosmetic, so it's fine for it to apply a frame later.
      window.setTimeout(() => setIsDragging(true), 0);
    } catch (err) {
      console.error('DragHandle onDragStart error:', err);
      endDrag();
      setIsDragging(false);
    }
  };

  const onDragEnd = () => {
    setIsDragging(false);
    // Always clean up drag state on dragend, regardless of
    // whether a move was triggered.
    endDrag();
  };

  // The handle is dim while actively dragging and slightly more
  // prominent on hover so the affordance is discoverable.
  const baseClass = [
    'flex h-7 w-5 cursor-grab items-center justify-center rounded text-text-secondary transition-colors',
    isDisabled
      ? 'cursor-not-allowed opacity-40'
      : 'hover:bg-bg-surface-hover hover:text-text-primary active:cursor-grabbing',
    isDragging ? 'opacity-40' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      // Only this element is the drag source. The enclosing row
      // is NOT draggable, so click events on Links / buttons
      // inside the row are never preempted by a drag.
      draggable={!isDisabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      // Block the click on the handle so it doesn't accidentally
      // activate parent click handlers (e.g. opening a preview).
      onClick={(event) => event.preventDefault()}
      disabled={isDisabled}
      aria-label={label}
      title={label}
      className={baseClass}
      data-testid="drag-handle"
    >
      <GripVertical className="h-4 w-4" />
    </button>
  );
}
