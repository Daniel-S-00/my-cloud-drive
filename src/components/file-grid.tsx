'use client';

import Image from 'next/image';
import type { ReactNode } from 'react';
import { DragHandle } from '@/components/drag-handle';

export type FileGridFile = {
  id: string;
  name: string;
  mimeType: string;
  thumbnailUrl?: string | null;
  uploadStatus: string;
};

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

function isVideoMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('video/');
}

type FileGridItemProps = {
  file: FileGridFile;
  isSelected: boolean;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  dragHandle?: ReactNode;
  renderStatus?: () => ReactNode;
};

function FileGridItem({
  file,
  isSelected,
  onSelect,
  onOpen,
  dragHandle,
  renderStatus,
}: FileGridItemProps) {
  const isImage = isImageMimeType(file.mimeType);
  const isVideo = isVideoMimeType(file.mimeType);
  const hasThumbnail = Boolean(file.thumbnailUrl);

  return (
    <div
      className={[
        'group relative flex cursor-pointer flex-col rounded-lg border border-border-subtle bg-bg-surface transition-colors hover:bg-bg-surface-hover',
        isSelected ? 'ring-2 ring-accent-primary' : '',
      ].join(' ')}
      onClick={() => onSelect(file.id)}
      onDoubleClick={() => onOpen(file.id)}
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

      <div className="relative aspect-square w-full overflow-hidden rounded-t-lg bg-bg-surface-hover">
        {isImage && hasThumbnail ? (
          <Image
            src={file.thumbnailUrl!}
            alt={file.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 20vw"
            unoptimized
            loading="eager"
            className="object-cover"
          />
        ) : isVideo ? (
          <div className="flex h-full w-full items-center justify-center bg-accent-primary/10">
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className="h-12 w-12 text-accent-primary/60"
              aria-hidden
            >
              <path d="M8 5.5v13a.5.5 0 0 0 .77.42l10-6.5a.5.5 0 0 0 0-.84l-10-6.5A.5.5 0 0 0 8 5.5Z" />
            </svg>
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
};

export function FileGrid({
  files,
  selectedId,
  onSelect,
  onOpen,
  isMoving = false,
}: FileGridProps) {
  if (files.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {files.map((file) => {
        const inFlight =
          file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';

        return (
          <FileGridItem
            key={file.id}
            file={file}
            isSelected={selectedId === file.id}
            onSelect={onSelect}
            onOpen={onOpen}
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
