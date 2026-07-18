'use client';

import { useState, type DragEvent } from 'react';
import { GripVertical } from 'lucide-react';
import { useDragContext, type DraggedItem } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

type DragHandleProps = {
  item: DraggedItem;
  disabled?: boolean;
  label?: string;
  className?: string;
};

export function DragHandle({
  item,
  disabled = false,
  label = 'Drag to move',
  className,
}: DragHandleProps) {
  const { startDrag, endDrag, isMoving } = useDragContext();
  const [isDragging, setIsDragging] = useState(false);

  const isDisabled = disabled || isMoving;

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
      draggable={!isDisabled}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
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
