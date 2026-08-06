'use client';

import Image from 'next/image';
import { Music, Play, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { DragHandle } from '@/components/drag-handle';
import { ShareButton } from '@/components/share-button';
import { Button } from '@/components/ui/button';
import { useFileDialogs } from '@/contexts/file-dialog-context';
import { isCoarsePointer } from '@/lib/pointer';

export type FileGridFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl?: string | null;
  uploadStatus: string;
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
  dragHandle?: ReactNode;
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
  dragHandle,
  renderStatus,
  shouldScroll,
  animate = true,
}: FileGridItemProps) {
  const itemRef = useRef<HTMLDivElement>(null);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
  const { openDeleteDialog } = useFileDialogs();

  const isImage = isImageMimeType(file.mimeType);
  const isVideo = isVideoMimeType(file.mimeType);
  const isAudio = isAudioMimeType(file.mimeType);
  const hasThumbnail = Boolean(file.thumbnailUrl);

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
      className={[
        'group relative flex cursor-pointer flex-col rounded-lg border border-border-subtle bg-bg-surface transition-all duration-200 ease-out hover:-translate-y-1 hover:shadow-xl hover:shadow-accent-primary/10',
        spawnClass,
        isSelected ? 'ring-2 ring-accent-primary' : '',
      ].join(' ')}
      onClick={() => {
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
      {dragHandle ? (
        <div
          className="absolute right-1 top-1 z-10 opacity-0 transition-opacity group-hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
        >
          {dragHandle}
        </div>
      ) : null}

      <div
        className="absolute bottom-1 right-1 z-10 flex items-center gap-1 opacity-100 transition-opacity group-hover:opacity-100 md:opacity-0"
        onClick={(e) => e.stopPropagation()}
      >
        <Button
          type="button"
          variant="destructiveOutline"
          size="icon"
          aria-label={`Delete ${file.name}`}
          title="Delete"
          onClick={() => openDeleteDialog(file.id)}
        >
          <Trash2 className="h-4 w-4" />
        </Button>
        <ShareButton
          fileId={file.id}
          fileName={file.name}
          existing={file.existingShare}
          size="icon"
        />
      </div>

      <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-bg-surface-hover">
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
  isMoving?: boolean;
  shouldScroll?: boolean;
  animate?: boolean;
};

export function FileGrid({
  files,
  selectedId,
  onSelect,
  onOpen,
  isMoving = false,
  shouldScroll,
  animate = true,
}: FileGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((file, index) => {
        const inFlight =
          file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';

        return (
          <FileGridItem
            key={file.id}
            file={file}
            index={index}
            isSelected={selectedId === file.id}
            onSelect={onSelect}
            onOpen={onOpen}
            shouldScroll={shouldScroll}
            animate={animate}
            dragHandle={
              <DragHandle
                item={{ type: 'file', id: file.id, name: file.name }}
                disabled={inFlight || isMoving}
                label={`Drag ${file.name}`}
              />
            }
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
        );
      })}
    </div>
  );
}

