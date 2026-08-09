'use client';

import Link from 'next/link';
import { Check, Folder } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { createFolder, deleteFolder, moveFolder } from '@/app/actions/folders';
import { Button } from '@/components/ui/button';
import { FavoriteButton } from '@/components/favorite-button';
import { ItemMenu } from '@/components/item-menu';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableCell, TableRow } from '@/components/ui/table';
import { useDragContext } from '@/contexts/drag-context';
import { useFolderDialogs } from '@/contexts/file-dialog-context';
import { useItemActionDialogs } from '@/contexts/item-action-dialog-context';
import { useMultiSelect } from '@/contexts/multi-select-context';
import { copyText } from '@/lib/clipboard';
import { isCoarsePointer } from '@/lib/pointer';
import { useItemDrag } from '@/hooks/use-item-drag';
import { useLongPress } from '@/hooks/use-long-press';

import { formatDateTime as formatDate } from '@/lib/format-date';

const DRAG_MIME = 'text/plain';

export type FolderRowData = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  filesCount: number;
  subfoldersCount: number;
  favorite?: boolean;
};

function FolderIcon({ className }: { className?: string }) {
  return <Folder className={className} aria-hidden />;
}

export function FolderRow({
  folder,
  index = 0,
  isSelected,
  onSelect,
  shouldScroll,
  animate,
}: {
  folder: FolderRowData;
  index?: number;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  shouldScroll?: boolean;
  animate?: boolean;
}) {
  const desktopRef = useRef<HTMLTableRowElement>(null);
  const mobileRef = useRef<HTMLTableRowElement>(null);

  useEffect(() => {
    if (isSelected && shouldScroll) {
      const el = desktopRef.current ?? mobileRef.current;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isSelected, shouldScroll]);
  const { openDeleteDialog } = useFolderDialogs();
  const { openMoveDialog, openRenameDialog } = useItemActionDialogs();
  const { mode: selectionMode, isSelected: isSelectedMulti, enter, toggle } =
    useMultiSelect();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const {
    draggedItem,
    dragOverFolderId,
    isMoving,
    dragItemRef,
    resetDragState,
    setDragOverFolder,
    setMoving,
  } = useDragContext();

  const selectable = { type: 'folder', id: folder.id, name: folder.name } as const;

  // The row/card is the drag source on desktop (HTML5). On mobile, a
  // long-press enters multi-selection instead of dragging.
  const dragSource = useItemDrag({
    item: selectable,
    disabled: isMoving,
  });
  const longPress = useLongPress({
    onTrigger: () => enter(selectable),
    disabled: pending || isMoving,
  });
  const isMultiSelected = isSelectedMulti(folder.id);

  const handleCopyName = async () => {
    const ok = await copyText(folder.name);
    toast.success(ok ? 'Name copied to clipboard' : 'Could not copy name');
  };

  const isSelfDragged =
    draggedItem?.type === 'folder' && draggedItem.id === folder.id;
  const isHovered = dragOverFolderId === folder.id;

  // Returns true when the current drag is acceptable as a drop on
  // this folder. We accept both files and folders, except for
  // self-drops (a folder cannot be dropped onto itself) — descendant
  // cycles are rejected server-side.
  const canAccept = (item: { type: 'file' | 'folder'; id: string } | null) => {
    if (!item) return false;
    if (item.type === 'folder' && item.id === folder.id) return false;
    return true;
  };

  const onDragOver = (event: DragEvent<HTMLTableRowElement>) => {
    try {
      // CRITICAL: the browser requires `preventDefault()` on every
      // `dragover` that should permit a subsequent drop. If we
      // early-return without it (e.g. because the context state
      // hasn't propagated yet), the drop is silently rejected.
      // The only gate we apply here is the dataTransfer MIME type,
      // which is available synchronously and tells us the drag
      // originated from our app vs. an external source.
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';

      // Use the ref (not React state) so the hover highlight
      // appears on the very first dragover after the drag starts,
      // before the next render has propagated the new context
      // value into this handler's closure.
      const liveItem = dragItemRef.current;
      if (!canAccept(liveItem)) {
        // Self-drop or no item — don't highlight, but still
        // allow the drop (server validates and returns an error).
        return;
      }
      if (!isHovered) setDragOverFolder(folder.id);
    } catch (err) {
      console.error('FolderRow onDragOver error:', err);
    }
  };

  const onDragEnter = (event: DragEvent<HTMLTableRowElement>) => {
    // Mirror the dragover handler. Some browsers fire dragenter
    // without a matching dragover in a few edge cases, so we set
    // up the hover state here too.
    try {
      if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
      event.preventDefault();
      const liveItem = dragItemRef.current;
      if (!canAccept(liveItem)) return;
      if (!isHovered) setDragOverFolder(folder.id);
    } catch (err) {
      console.error('FolderRow onDragEnter error:', err);
    }
  };

  const onDragLeave = (event: DragEvent<HTMLTableRowElement>) => {
    // Avoid flicker when the cursor moves over child elements:
    // only clear the hover state when the pointer truly leaves
    // the row. `relatedTarget` is the element the pointer entered;
    // if it's still inside the row, the dragleave is spurious.
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    if (isHovered) setDragOverFolder(null);
  };

  const onDrop = (event: DragEvent<HTMLTableRowElement>) => {
    // Prevent the browser from navigating to the dropped URL (the
    // default for text drops) and stop propagation so ancestor
    // drop targets (e.g. a wrapping section) don't also handle
    // this drop.
    event.preventDefault();
    event.stopPropagation();
    setDragOverFolder(null);

    // Read the dropped payload directly from dataTransfer so the
    // decision is based on what was actually dropped, not on
    // potentially-stale context state.
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
      // Not a valid JSON payload — ignore the drop.
    }
    if (!parsed) {
      toast.error('Invalid drop', {
        description: 'The dropped item is not recognized by this app.',
      });
      return;
    }
    if (!canAccept(parsed)) {
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
            targetFolderId: folder.id,
          });
          toast.success(
            result.wasRenamed ? 'File moved (renamed)' : 'File moved',
            {
              description: `"${dropped.name}" → "${folder.name}"${
                result.wasRenamed ? ` (renamed to "${result.newName}")` : ''
              }`,
            },
          );
        } else {
          const result = await moveFolder({
            folderId: dropped.id,
            targetParentId: folder.id,
          });
          toast.success(
            result.wasRenamed ? 'Folder moved (renamed)' : 'Folder moved',
            {
              description: `"${dropped.name}" → "${folder.name}"${
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
        // Use the full reset so isMoving is cleared alongside the
        // visual drag state — endDrag() alone would leave isMoving
        // stuck at true if the action threw before setMoving(false)
        // ran in a previous attempt.
        resetDragState();
      }
    });
  };

  // Compose the row class so the dim-while-dragging and the
  // drop-highlight states can coexist.
  const rowClass = [
    isSelfDragged ? 'opacity-50' : '',
    isHovered ? 'bg-accent-primary/15 ring-1 ring-inset ring-accent-glow' : '',
    isSelected && !isHovered ? 'bg-accent-primary/10' : '',
    'cursor-pointer',
  ]
    .filter(Boolean)
    .join(' ');

  const handleRowClick = () => {
    // While multi-select mode is active, a tap toggles the item in the
    // selection instead of opening it.
    if (selectionMode) {
      toggle(selectable);
      return;
    }
    // On touch devices a single tap opens the folder directly — no
    // double-tap needed. Selection stays for desktop precision
    // pointers (double-click opens there).
    if (isCoarsePointer()) {
      router.push(`/drive?folder=${folder.id}`);
      return;
    }
    onSelect?.(folder.id);
  };

  const handleRowDoubleClick = (event: ReactMouseEvent) => {
    // Stop the browser's double-click word selection so only a manual
    // drag inside the text selects it.
    event.preventDefault();
    router.push(`/drive?folder=${folder.id}`);
  };

  const spawnClass = animate
    ? 'animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out'
    : '';

  return (
    <>
      {/*
       * Desktop row (>= md). The row is BOTH a drop target (files /
       * folders dropped onto it move into this folder) and the drag
       * source (grabbing the row starts a move). The name is
       * `data-no-drag`, so click-dragging over it selects text for
       * copying instead of dragging.
       */}
      <TableRow
        ref={desktopRef}
        {...dragSource.handlers}
        {...longPress.handlers}
        draggable={dragSource.isDraggable}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        data-drop-folder-id={folder.id}
        data-drop-folder-name={folder.name}
        style={{ animationDelay: `${index * 50}ms` }}
        className={[
          'desktop-row',
          'group',
          'hidden md:table-row',
          spawnClass,
          rowClass || '',
          isMultiSelected ? 'bg-accent-primary/10' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <TableCell className="min-w-[12rem] md:min-w-0">
          <Link
            href={`/drive?folder=${folder.id}`}
            draggable={false}
            data-no-drag
            onClick={(e) => e.preventDefault()}
            className="flex min-w-0 items-center gap-3 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-accent-primary/15 text-accent-glow"
            >
              {isMultiSelected ? (
                <Check className="h-5 w-5" />
              ) : (
                <FolderIcon className="h-5 w-5" />
              )}
            </span>
            <span
              title={folder.name}
              className="min-w-0 flex-1 break-words font-medium text-text-primary hover:underline"
            >
              {folder.name}
            </span>
          </Link>
        </TableCell>
        <TableCell className="w-44 text-text-secondary">
          {formatDate(folder.updatedAt || folder.createdAt)}
        </TableCell>
        <TableCell className="w-32 text-text-secondary">
          {folder.subfoldersCount > 0 || folder.filesCount > 0
            ? `${folder.filesCount} file${folder.filesCount === 1 ? '' : 's'}${
                folder.subfoldersCount > 0
                  ? `, ${folder.subfoldersCount} folder${
                      folder.subfoldersCount === 1 ? '' : 's'
                    }`
                  : ''
              }`
            : 'Empty'}
        </TableCell>
        <TableCell
          className="w-44 text-right"
          onClick={(e) => e.stopPropagation()}
          data-no-drag
        >
          <div className="flex items-center justify-end gap-1">
            {/* Drive-style hover actions (desktop only; hidden on touch). */}
            <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <FavoriteButton
                type="folder"
                id={folder.id}
                favorited={!!folder.favorite}
                disabled={pending}
              />
            </div>
            <ItemMenu
              label={`Actions for ${folder.name}`}
              disabled={pending}
              onMove={() => openMoveDialog([selectable])}
              onRename={() => openRenameDialog(selectable)}
              onCopyName={handleCopyName}
              onDelete={() => openDeleteDialog(folder)}
            />
            {pending ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-accent-glow" />
                Moving…
              </span>
            ) : null}
          </div>
        </TableCell>
      </TableRow>

      {/*
       * Mobile card (< md). Mirrors the desktop drop-target so
       * dragging onto a folder still works on touch devices. The
       * card carries its own padding/typography; the wrapper
       * <tr> is layout-neutral.
       */}
      <tr
        ref={mobileRef}
        className={['mobile-card-row', 'md:hidden', spawnClass, rowClass || '']
          .filter(Boolean)
          .join(' ')}
        style={{ animationDelay: `${index * 50}ms` }}
        data-drop-folder-id={folder.id}
        data-drop-folder-name={folder.name}
        onDragOver={onDragOver}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
      >
        <td className="mobile-card-cell" colSpan={4}>
          <div
            className={[
              'mobile-card',
              isMultiSelected ? 'bg-accent-primary/10' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={handleRowClick}
            onDoubleClick={handleRowDoubleClick}
            {...longPress.handlers}
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-accent-primary/15 text-accent-glow"
              >
                {isMultiSelected ? (
                  <Check className="h-5 w-5" />
                ) : (
                  <FolderIcon className="h-5 w-5" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/drive?folder=${folder.id}`}
                  draggable={false}
                  data-no-drag
                  onClick={(e) => e.preventDefault()}
                  className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                >
                  <div
                    title={folder.name}
                    className="truncate font-medium text-text-primary"
                  >
                    {folder.name}
                  </div>
                </Link>
                <div className="mt-0.5 truncate text-xs text-text-secondary">
                  {folder.subfoldersCount > 0 || folder.filesCount > 0
                    ? `${folder.filesCount} file${
                        folder.filesCount === 1 ? '' : 's'
                      }${
                        folder.subfoldersCount > 0
                          ? `, ${folder.subfoldersCount} folder${
                              folder.subfoldersCount === 1 ? '' : 's'
                            }`
                          : ''
                      }`
                    : 'Empty folder'}
                </div>
              </div>
              <div className="flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                <ItemMenu
                  label={`Actions for ${folder.name}`}
                  disabled={pending}
                  onMove={() => openMoveDialog([selectable])}
                  onRename={() => openRenameDialog(selectable)}
                  onCopyName={handleCopyName}
                  onDelete={() => openDeleteDialog(folder)}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[3.25rem] text-sm text-text-secondary">
              <span className="whitespace-nowrap">
                {formatDate(folder.updatedAt || folder.createdAt)}
              </span>
              {pending ? (
                <span className="inline-flex items-center gap-1.5 text-xs text-text-secondary">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-accent-glow" />
                  Moving…
                </span>
              ) : null}
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}

export function NewFolderTrigger({
  parentFolderId,
}: {
  parentFolderId: string | null;
}) {
  const { openCreateDialog } = useFolderDialogs();
  return (
    <Button
      type="button"
      variant="primary"
      size="default"
      onClick={() => openCreateDialog(parentFolderId)}
    >
      New folder
    </Button>
  );
}

const FOLDER_NAME_MAX = 255;

function trimAndValidate(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Folder name cannot be empty');
  }
  if (trimmed.length > FOLDER_NAME_MAX) {
    throw new Error(
      `Folder name cannot exceed ${FOLDER_NAME_MAX} characters`,
    );
  }
  if (
    trimmed.includes('/') ||
    trimmed.includes('\\') ||
    trimmed.includes('\0')
  ) {
    throw new Error('Folder name cannot contain /, \\, or null characters');
  }
  return trimmed;
}

export function FolderDialogs({ parentFolderName }: { parentFolderName: string }) {
  const { state, closeDialog } = useFolderDialogs();
  const router = useRouter();
  const [name, setName] = useState('');
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const isCreate = state.kind === 'create';
  const isDelete = state.kind === 'delete';
  const isOpen = isCreate || isDelete;

  const resetAndClose = () => {
    setName('');
    setError(null);
    closeDialog();
  };

  const onSubmitCreate = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    let cleaned: string;
    try {
      cleaned = trimAndValidate(name);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid name');
      return;
    }
    startTransition(async () => {
      try {
        const result = await createFolder({
          name: cleaned,
          parentFolderId: state.parentFolderId,
        });
        toast.success('Folder created', { description: result.folder.name });
        resetAndClose();
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not create folder';
        setError(message);
        toast.error('Create folder failed', { description: message });
      }
    });
  };

  const onConfirmDelete = () => {
    if (!state.targetFolder) return;
    const targetName = state.targetFolder.name;
    startTransition(async () => {
      try {
        const result = await deleteFolder({ folderId: state.targetFolder!.id });
        toast.success('Folder deleted', {
          description: `"${targetName}" and its contents were moved to trash (${result.filesDeleted} file${
            result.filesDeleted === 1 ? '' : 's'
          }, ${result.subfoldersDeleted} subfolder${
            result.subfoldersDeleted === 1 ? '' : 's'
          }).`,
        });
        resetAndClose();
        router.refresh();
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Could not delete folder';
        setError(message);
        toast.error('Delete folder failed', { description: message });
      }
    });
  };

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) resetAndClose();
        }}
      >
        <DialogContent>
          {isCreate ? (
            <form onSubmit={onSubmitCreate}>
              <DialogHeader>
                <DialogTitle>New folder</DialogTitle>
                <DialogDescription>
                  {state.parentFolderId
                    ? `Inside “${parentFolderName}”.`
                    : 'In My Drive (root).'}
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="folder-name">Name</Label>
                  <Input
                    id="folder-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Untitled folder"
                    autoFocus
                    disabled={pending}
                    maxLength={FOLDER_NAME_MAX}
                  />
                </div>
                {error && (
                  <p
                    className="mt-2 text-sm text-red-400"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetAndClose}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" variant="primary" disabled={pending}>
                  {pending ? 'Creating…' : 'Create folder'}
                </Button>
              </DialogFooter>
            </form>
          ) : state.targetFolder ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this folder?</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-text-primary">
                    {state.targetFolder.name}
                  </span>{' '}
                  will be moved to trash, along with{' '}
                  {state.targetFolder.filesCount} file
                  {state.targetFolder.filesCount === 1 ? '' : 's'} and{' '}
                  {state.targetFolder.subfoldersCount} subfolder
                  {state.targetFolder.subfoldersCount === 1 ? '' : 's'}.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <p className="text-sm text-text-secondary">
                  Everything stays in R2 for 30 days. A future trash UI
                  can restore from within the window.
                </p>
                {error && (
                  <p
                    className="mt-2 text-sm text-red-400"
                    role="alert"
                  >
                    {error}
                  </p>
                )}
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={resetAndClose}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  onClick={onConfirmDelete}
                  disabled={pending}
                >
                  {pending ? 'Deleting…' : 'Delete folder'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
