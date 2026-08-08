'use client';

import Image from 'next/image';
import { Check, Download, Music, Play, Share2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { FavoriteButton } from '@/components/favorite-button';
import { ItemMenu } from '@/components/item-menu';
import { useDragContext } from '@/contexts/drag-context';
import { useFileDialogs } from '@/contexts/file-dialog-context';
import { useItemActionDialogs } from '@/contexts/item-action-dialog-context';
import { useMultiSelect } from '@/contexts/multi-select-context';
import { useShareDialogs } from '@/contexts/share-dialog-context';
import { useItemDrag } from '@/hooks/use-item-drag';
import { useLongPress } from '@/hooks/use-long-press';
import { copyText } from '@/lib/clipboard';
import { downloadFile } from '@/lib/download-file';
import { isCoarsePointer } from '@/lib/pointer';

export type FileGridFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl?: string | null;
  uploadStatus: string;
  favorite?: boolean;
  existingShare?: { id: string; shareUrl: string; expiresAt: string | null } | null;
};

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

function isVideoMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('video/');
}

function isAudioMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('audio/');
}

type FileGridItemProps = {
  file: FileGridFile;
  index?: number;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  renderStatus?: () => ReactNode;
  shouldScroll?: boolean;
  animate?: boolean;
};

function FileGridItem({
  file,
  index = 0,
  isSelected,
  onSelect,
  onOpen,
  renderStatus,
  shouldScroll,
  animate = true,
}: FileGridItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const { openDeleteDialog } = useFileDialogs();
  const { openMoveDialog, openRenameDialog } = useItemActionDialogs();
  const { openShareDialog } = useShareDialogs();
  const { isMoving } = useDragContext();
  const { mode: selectionMode, isSelected: isSelectedMulti, enter, toggle } =
    useMultiSelect();

  const isImage = isImageMimeType(file.mimeType);
  const isVideo = isVideoMimeType(file.mimeType);
  const isAudio = isAudioMimeType(file.mimeType);
  const hasThumbnail = Boolean(file.thumbnailUrl);
  const inFlight =
    file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';
  const isComplete = file.uploadStatus === 'complete';
  const canDelete = file.uploadStatus !== 'uploading';

  const selectable = { type: 'file', id: file.id, name: file.name } as const;

  // The card is the drag source on desktop (HTML5). On mobile, a
  // long-press enters multi-selection instead of dragging.
  const dragSource = useItemDrag({
    item: selectable,
    disabled: isMoving || inFlight,
  });
  const longPress = useLongPress({
    onTrigger: () => enter(selectable),
    disabled: isMoving || inFlight,
  });
  const isMultiSelected = isSelectedMulti(file.id);

  const handleCopyName = async () => {
    const ok = await copyText(file.name);
    toast.success(ok ? 'Name copied to clipboard' : 'Could not copy name');
  };

  const handleMenuDownload = () => {
    void downloadFile(file.id).catch((err) => {
      toast.error('Download failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    });
  };

  const handleMenuShare = () => {
    const existing = file.existingShare;
    if (existing) {
      void copyText(existing.shareUrl).then((ok) => {
        toast.success(ok ? 'Link copied to clipboard' : 'Could not copy link');
      });
      return;
    }
    openShareDialog({
      id: file.id,
      name: file.name,
      existing: file.existingShare,
    });
  };

  useEffect(() => {
    if (isSelected && shouldScroll && itemRef.current) {
      itemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [isSelected, shouldScroll]);

  const spawnClass = animate
    ? 'animate-in fade-in slide-in-from-bottom-4 duration-200 ease-out'
    : '';

  return (
    <div
      ref={itemRef}
      style={{ animationDelay: `${index * 50}ms` }}
      {...dragSource.handlers}
      {...longPress.handlers}
      draggable={dragSource.isDraggable}
      className={[
        'group relative flex cursor-pointer flex-col rounded-lg border border-border-subtle bg-bg-surface transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-accent-primary/10',
        spawnClass,
        isSelected ? 'ring-2 ring-accent-primary' : '',
        isMultiSelected ? 'bg-accent-primary/10' : '',
      ].join(' ')}
      onClick={() => {
        // While multi-select mode is active, a tap toggles selection.
        if (selectionMode) {
          toggle(selectable);
          return;
        }
        // Touch-first devices open on a single tap (no double-tap).
        if (isCoarsePointer()) {
          onOpen(file.id);
          return;
        }
        onSelect(file.id);
      }}
      onDoubleClick={(e) => {
        // Stop the browser's double-click word selection.
        e.preventDefault();
        onOpen(file.id);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onSelect(file.id);
      }}
    >
      {isMultiSelected ? (
        <span
          aria-hidden
          className="absolute left-1 top-1 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-accent-primary text-white shadow"
        >
          <Check className="h-4 w-4" />
        </span>
      ) : null}

      <div
        className="absolute right-1 top-1 z-10"
        onClick={(e) => e.stopPropagation()}
        data-no-drag
      >
        <ItemMenu
          label={`Actions for ${file.name}`}
          disabled={!canDelete}
          onMove={() => openMoveDialog([selectable])}
          onRename={() => openRenameDialog(selectable)}
          onCopyName={handleCopyName}
          onDownload={isComplete ? handleMenuDownload : undefined}
          onShare={isComplete ? handleMenuShare : undefined}
          shareLabel={file.existingShare ? 'Copy link' : 'Share…'}
          onDelete={() => openDeleteDialog(file.id)}
        />
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-bg-surface-hover">
        {/* Drive-style hover actions, overlaid on the thumbnail so they
            never collide with a long filename in the text block below. */}
        <div
          className="absolute bottom-2 right-2 z-10 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:hidden"
          onClick={(e) => e.stopPropagation()}
          data-no-drag
        >
          <FavoriteButton
            type="file"
            id={file.id}
            favorited={!!file.favorite}
            disabled={!canDelete}
            className="bg-bg-surface/80 shadow backdrop-blur-sm"
          />
          {isComplete ? (
            <>
              <button
                type="button"
                aria-label="Download"
                title="Download"
                data-no-drag
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleMenuDownload();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-bg-surface/80 text-text-secondary shadow backdrop-blur-sm transition-colors hover:bg-bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Download className="h-4 w-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label="Share"
                title="Share"
                data-no-drag
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  handleMenuShare();
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-bg-surface/80 text-text-secondary shadow backdrop-blur-sm transition-colors hover:bg-bg-surface hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Share2 className="h-4 w-4" aria-hidden />
              </button>
            </>
          ) : null}
        </div>
        {isImage && hasThumbnail ? (
          <>
            {!thumbnailLoaded && (
              <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-bg-surface via-bg-surface-hover to-bg-surface" />
            )}
            <Image
              src={file.thumbnailUrl!}
              alt={file.name}
              fill
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
              unoptimized
              loading="eager"
              onLoad={() => setThumbnailLoaded(true)}
              className={`object-cover transition-opacity duration-300 ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
          </>
        ) : isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-accent-primary/10">
            <Play className="h-12 w-12 text-accent-primary/60" aria-hidden />
          </div>
        ) : isAudio ? (
          <div className="flex h-full w-full items-center justify-center bg-accent-primary/10">
            <Music className="h-12 w-12 text-accent-primary/60" aria-hidden />
          </div>
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="select-none rounded bg-bg-surface-hover px-3 py-1.5 text-xs font-semibold uppercase text-text-secondary">
              {file.name.split('.').pop()?.slice(0, 4) || 'FILE'}
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-1 p-3">
        <span
          title={file.name}
          data-no-drag
          className="line-clamp-2 text-sm font-medium text-text-primary break-words"
        >
          {file.name}
        </span>
        {renderStatus?.()}
      </div>
    </div>
  );
}

type FileGridProps = {
  files: FileGridFile[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  shouldScroll?: boolean;
  animate?: boolean;
};

export function FileGrid({
  files,
  selectedId,
  onSelect,
  onOpen,
  shouldScroll,
  animate = true,
}: FileGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((file, index) => (
        <FileGridItem
          key={file.id}
          file={file}
          index={index}
          isSelected={selectedId === file.id}
          onSelect={onSelect}
          onOpen={onOpen}
          shouldScroll={shouldScroll}
          animate={animate}
          renderStatus={() => {
            if (file.uploadStatus === 'complete') return null;
            const inFlight =
              file.uploadStatus === 'pending' ||
              file.uploadStatus === 'uploading';
            return (
              <span
                className={
                  inFlight
                    ? 'inline-flex items-center gap-1.5 text-xs text-text-secondary'
                    : file.uploadStatus === 'failed'
                      ? 'text-xs text-red-400'
                      : 'text-xs text-text-secondary'
                }
              >
                {inFlight ? (
                  <>
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-glow" />
                    {file.uploadStatus}
                  </>
                ) : (
                  file.uploadStatus
                )}
              </span>
            );
          }}
        />
      ))}
    </div>
  );
}
