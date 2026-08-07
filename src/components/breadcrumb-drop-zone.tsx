'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition, type DragEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { moveFolder } from '@/app/actions/folders';
import { useDragContext } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

type BreadcrumbDropZoneProps = {
  // The parent folder's id. Drops here will move the dragged
  // file/folder into this folder (i.e. "up one level").
  parentFolderId: string;
  parentFolderName: string;
  children: ReactNode;
};

/**
 * Wraps a parent-folder breadcrumb link so that dragging a file or
 * folder onto it moves the item up one level. Clicking the
 * contained link still navigates to the parent folder; the drop
 * handlers are layered on top via the wrapper span without altering
 * the link's click behavior.
 *
 * Uses the same robust drop-target pattern as the folder rows and
 * the root drop zone: `text/plain` MIME, unconditional
 * `preventDefault()` on `dragover`, and `dataTransfer`-based
 * payload parsing in `drop` (so the decision is based on what was
 * actually dropped, not on potentially-stale context state).
 */
export function BreadcrumbDropZone({
  parentFolderId,
  parentFolderName,
  children,
}: BreadcrumbDropZoneProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [isHovered, setIsHovered] = useState(false);
  const { setDragOverRoot, setMoving, resetDragState } = useDragContext();

  const onDragOver = (event: DragEvent<HTMLSpanElement>) => {
    try {
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      // Must preventDefault to allow the drop.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      if (!isHovered) setIsHovered(true);
      // Clear any root-zone hover state (we're a more specific
      // target now).
      setDragOverRoot(false);
    } catch (err) {
      console.error('BreadcrumbDropZone onDragOver error:', err);
    }
  };

  const onDragEnter = (event: DragEvent<HTMLSpanElement>) => {
    try {
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      event.preventDefault();
      if (!isHovered) setIsHovered(true);
    } catch (err) {
      console.error('BreadcrumbDropZone onDragEnter error:', err);
    }
  };

  const onDragLeave = (event: DragEvent<HTMLSpanElement>) => {
    // Avoid flicker when the cursor moves over child elements
    // (the link, the separator text, etc.): only clear the
    // hover state when the pointer truly leaves the wrapper.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    if (isHovered) setIsHovered(false);
  };

  const onDrop = (event: DragEvent<HTMLSpanElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setIsHovered(false);

    const raw = event.dataTransfer.getData(DRAG_MIME);
    let parsed: { type: 'file' | 'folder'; id: string; name: string } | null =
      null;
    try {
      const obj = JSON.parse(raw);
      if (
        obj &&
        (obj.type === 'file' || obj.type === 'folder') &&
        typeof obj.id === 'string' &&
        typeof obj.name === 'string'
      ) {
        parsed = obj;
      }
    } catch {
      // ignore
    }
    if (!parsed) {
      toast.error('Invalid drop', {
        description: 'The dropped item is not recognized by this app.',
      });
      resetDragState();
      return;
    }

    // Reject dropping a folder onto itself.
    if (parsed.type === 'folder' && parsed.id === parentFolderId) {
      toast.error('Cannot drop here', {
        description: 'A folder cannot be moved into itself.',
      });
      return;
    }

    const dropped = parsed;
    setMoving(true);
    startTransition(async () => {
      try {
        if (dropped.type === 'file') {
          const result = await moveFile({
            fileId: dropped.id,
            targetFolderId: parentFolderId,
          });
          toast.success(
            result.wasRenamed ? 'File moved (renamed)' : 'File moved',
            {
              description: `"${dropped.name}" → "${parentFolderName}"${
                result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
              }`,
            },
          );
        } else {
          const result = await moveFolder({
            folderId: dropped.id,
            targetParentId: parentFolderId,
          });
          toast.success(
            result.wasRenamed ? 'Folder moved (renamed)' : 'Folder moved',
            {
              description: `"${dropped.name}" → "${parentFolderName}"${
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
  };

  const hoverClass = isHovered
    ? 'rounded bg-accent-primary/15 ring-2 ring-accent-glow ring-offset-1 ring-offset-bg-base'
    : 'rounded transition-colors hover:bg-bg-surface-hover';

  return (
    <span
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-drop-folder-id={parentFolderId}
      data-drop-folder-name={parentFolderName}
      className={hoverClass}
      title={`Drop here to move into "${parentFolderName}"`}
    >
      {children}
    </span>
  );
}
