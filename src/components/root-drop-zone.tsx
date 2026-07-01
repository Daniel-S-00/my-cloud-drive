'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type DragEvent } from 'react';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { moveFolder } from '@/app/actions/folders';
import { useDragContext } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

/**
 * Drop zone at the top of the browse section that moves a dragged
 * file or folder up to the root of the drive (My Drive).
 *
 * IMPORTANT: this component is ALWAYS mounted while inside a
 * sub-folder. When nothing is being dragged it is hidden with the
 * `hidden` class rather than unmounted. Mounting the zone in
 * response to `dragstart` (i.e. returning `null` until
 * `draggedItem` is set) inserts a new DOM node into the page
 * *during a live drag*, which Chromium interprets as a mutation
 * under the cursor and cancels the gesture — the drag "grabs" for a
 * single frame and then evaporates. This is why dragging reliably
 * failed in sub-folders (root has no zone, so its DOM was stable)
 * but only ~1 in 10 times (a timing race between the React commit
 * and the native drag pump). Toggling a class on an existing node
 * is a style change, not an insertion, so it does not cancel the
 * drag.
 */
export function RootDropZone() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    draggedItem,
    dragOverRoot,
    isMoving,
    setDragOverRoot,
    setMoving,
    resetDragState,
  } = useDragContext();

  // Hidden (but still in the DOM) when nothing is being dragged or
  // while a move is already in flight. We use a class toggle instead
  // of returning null so no DOM node is inserted during a drag —
  // see the component doc comment for why that matters.
  const isVisible = draggedItem !== null && !isMoving;

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    try {
      // Only allow drop for our drag payload. External file drops
      // (e.g. from the OS) are handled by the upload drop zone.
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      // CRITICAL: must preventDefault to permit the drop.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      setDragOverRoot(true);
    } catch (err) {
      console.error('RootDropZone onDragOver error:', err);
    }
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    try {
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      event.preventDefault();
      setDragOverRoot(true);
    } catch (err) {
      console.error('RootDropZone onDragEnter error:', err);
    }
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    // Guard against the flicker caused by dragleave firing on
    // child elements: only clear the highlight when the pointer
    // truly leaves the zone.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    setDragOverRoot(false);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    // Prevent the browser's default drop behavior (e.g. navigating
    // to a dropped URL) and stop propagation so no ancestor drop
    // target also handles this drop.
    event.preventDefault();
    event.stopPropagation();
    setDragOverRoot(false);

    // Read the payload from dataTransfer (more reliable than the
    // potentially-stale context state).
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

    const dropped = parsed;
    setMoving(true);
    startTransition(async () => {
      try {
        if (dropped.type === 'file') {
          const result = await moveFile({
            fileId: dropped.id,
            targetFolderId: null,
          });
          toast.success(
            result.wasRenamed ? 'File moved (renamed)' : 'File moved',
            {
              description: `"${dropped.name}" → My Drive${
                result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
              }`,
            },
          );
        } else {
          const result = await moveFolder({
            folderId: dropped.id,
            targetParentId: null,
          });
          toast.success(
            result.wasRenamed ? 'Folder moved (renamed)' : 'Folder moved',
            {
              description: `"${dropped.name}" → My Drive${
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

  return (
    <div
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      data-testid="root-drop-zone"
      className={[
        // `hidden` removes the node from layout without unmounting
        // it (keeping the drop target live in the DOM across the
        // dragstart → drag lifecycle). See component doc comment.
        isVisible ? 'flex' : 'hidden',
        'items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-2 text-center text-sm transition-colors',
        dragOverRoot
          ? 'animate-pulse border-blue-400 bg-blue-50 text-blue-800'
          : 'border-zinc-300 bg-zinc-50 text-zinc-500 hover:border-zinc-400',
      ].join(' ')}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="h-4 w-4"
        aria-hidden
      >
        <path
          d="M12 19V5M5 12l7-7 7 7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      <span>
        {pending
          ? 'Moving…'
          : dragOverRoot
            ? 'Release to move to My Drive'
            : 'Drop here to move to My Drive'}
      </span>
    </div>
  );
}
