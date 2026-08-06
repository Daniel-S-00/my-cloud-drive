'use client';

import { useRouter } from 'next/navigation';
import { Folder, Trash2 } from 'lucide-react';
import { useEffect, useRef, useTransition, type DragEvent, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { moveFolder } from '@/app/actions/folders';
import { DragHandle } from '@/components/drag-handle';
import { Button } from '@/components/ui/button';
import { useDragContext } from '@/contexts/drag-context';
import { useFolderDialogs } from '@/contexts/file-dialog-context';

const DRAG_MIME = 'text/plain';

export type FolderGridItemData = {
  id: string;
  name: string;
  filesCount: number;
  subfoldersCount: number;
};

type FolderGridItemProps = {
  folder: FolderGridItemData;
  index?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  dragHandle?: ReactNode;
  shouldScroll?: boolean;
  animate?: boolean;
};

function FolderIcon({ className }: { className?: string }) {
  return <Folder className={className} aria-hidden />;
}

function canAcceptDrop(
  item: { type: 'file' | 'folder'; id: string } | null,
  folderId: string,
): boolean {
  if (!item) return false;
  if (item.type === 'folder' && item.id === folderId) return false;
  return true;
}

function FolderGridItem({
  folder,
  index = 0,
  isSelected,
  onSelect,
  dragHandle,
  shouldScroll,
  animate = true,
}: FolderGridItemProps) {
  const router = useRouter();
  const itemRef = useRef<HTMLDivElement>(null);
  const [, startTransition] = useTransition();
  const { openDeleteDialog } = useFolderDialogs();

  const {
    dragOverFolderId,
    dragItemRef,
    resetDragState,
    setDragOverFolder,
    setMoving,
  } = useDragContext();

  const isHovered = dragOverFolderId === folder.id;

  const spawnClass = animate
    ? 'animate-in fade-in slide-in-from-bottom-4 duration-200 ease-out'
    : '';

  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const liveItem = dragItemRef.current;
    if (!canAcceptDrop(liveItem, folder.id)) return;
    if (!isHovered) setDragOverFolder(folder.id);
  };

  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!event.dataTransfer.types.includes(DRAG_MIME)) return;
    event.preventDefault();
    const liveItem = dragItemRef.current;
    if (!canAcceptDrop(liveItem, folder.id)) return;
    if (!isHovered) setDragOverFolder(folder.id);
  };

  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    const next = event.relatedTarget as Node | null;
    if (next && event.currentTarget.contains(next)) return;
    if (isHovered) setDragOverFolder(null);
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragOverFolder(null);

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
      // not a valid payload
    }
    if (!parsed) return;
    if (!canAcceptDrop(parsed, folder.id)) return;

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
        resetDragState();
      }
    });
  };

  const cardClass = [
    'group relative flex cursor-pointer flex-col rounded-lg border border-border-subtle bg-bg-surface transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-accent-primary/10',
    spawnClass,
    isSelected ? 'ring-2 ring-accent-primary' : '',
    isHovered ? 'bg-accent-primary/15 ring-1 ring-inset ring-accent-glow' : '',
  ]
    .filter(Boolean)
    .join(' ');

  useEffect(() => {
    if (isSelected && shouldScroll && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isSelected, shouldScroll]);

  return (
    <div
      ref={itemRef}
      className={cardClass}
      style={{ animationDelay: `${index * 50}ms` }}
      onClick={() => onSelect(folder.id)}
      onDoubleClick={(e: ReactMouseEvent) => {
        // Stop the browser's double-click word selection.
        e.preventDefault();
        router.push(`/drive?folder=${folder.id}`);
      }}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(folder.id);
      }}
    >
      {dragHandle ? (
        <div
          className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {dragHandle}
        </div>
      ) : null}

      <div
        className="absolute bottom-1 right-1 z-10 opacity-100 transition-opacity group-hover:opacity-100 md:opacity-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="destructiveOutline"
          size="icon"
          aria-label={`Delete ${folder.name}`}
          title="Delete"
          onClick={() => openDeleteDialog(folder)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex aspect-square w-full items-center justify-center rounded-t-lg bg-accent-primary/10">
        <FolderIcon className="h-16 w-16 text-accent-primary/50" />
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span
          title={folder.name}
          className="line-clamp-2 text-sm font-medium text-text-primary break-words"
        >
          {folder.name}
        </span>
        <span className="text-xs text-text-secondary">
          {folder.subfoldersCount > 0 || folder.filesCount > 0
            ? `${folder.filesCount} file${folder.filesCount === 1 ? '' : 's'}${
                folder.subfoldersCount > 0
                  ? `, ${folder.subfoldersCount} folder${
                      folder.subfoldersCount === 1 ? '' : 's'
                    }`
                  : ''
              }`
            : 'Empty'}
        </span>
      </div>
    </div>
  );
}

export type { FolderGridItemProps };

type FolderGridProps = {
  folders: FolderGridItemData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isMoving?: boolean;
  shouldScroll?: boolean;
  animate?: boolean;
};

export function FolderGrid({
  folders,
  selectedId,
  onSelect,
  isMoving = false,
  shouldScroll,
  animate = true,
}: FolderGridProps) {
  if (folders.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {folders.map((folder, index) => (
        <FolderGridItem
          key={folder.id}
          folder={folder}
          index={index}
          isSelected={selectedId === folder.id}
          onSelect={onSelect}
          shouldScroll={shouldScroll}
          animate={animate}
          dragHandle={
            <DragHandle
              item={{ type: 'folder', id: folder.id, name: folder.name }}
              disabled={isMoving}
              label={`Drag ${folder.name}`}
            />
          }
        />
      ))}
    </div>
  );
}
