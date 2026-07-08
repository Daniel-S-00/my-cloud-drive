'use client';

import { useRouter } from 'next/navigation';
import { useTransition, type DragEvent } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import { moveFile } from '@/app/actions/files';
import { moveFolder } from '@/app/actions/folders';
import { DragHandle } from '@/components/drag-handle';
import { useDragContext } from '@/contexts/drag-context';

const DRAG_MIME = 'text/plain';

export type FolderGridItemData = {
  id: string;
  name: string;
  filesCount: number;
  subfoldersCount: number;
};

type FolderGridItemProps = {
  folder: FolderGridItemData;
  isSelected: boolean;
  onSelect: (id: string) => void;
  dragHandle?: ReactNode;
};

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.379a2 2 0 0 1 1.414.586l1.121 1.121A2 2 0 0 0 12.828 7.5H18.5A2.5 2.5 0 0 1 21 10v7.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z"
        strokeLinejoin="round"
      />
    </svg>
  );
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
  isSelected,
  onSelect,
  dragHandle,
}: FolderGridItemProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const {
    dragOverFolderId,
    dragItemRef,
    resetDragState,
    setDragOverFolder,
    setMoving,
  } = useDragContext();

  const isHovered = dragOverFolderId === folder.id;

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
    'group relative flex cursor-pointer flex-col rounded-lg border border-border-subtle bg-bg-surface transition-colors hover:bg-bg-surface-hover',
    isSelected ? 'ring-2 ring-accent-primary' : '',
    isHovered ? 'bg-accent-primary/15 ring-1 ring-inset ring-accent-glow' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cardClass}
      onClick={() => onSelect(folder.id)}
      onDoubleClick={() => router.push(`/?folder=${folder.id}`)}
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
};

export function FolderGrid({
  folders,
  selectedId,
  onSelect,
  isMoving = false,
}: FolderGridProps) {
  if (folders.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {folders.map((folder) => (
        <FolderGridItem
          key={folder.id}
          folder={folder}
          isSelected={selectedId === folder.id}
          onSelect={onSelect}
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
