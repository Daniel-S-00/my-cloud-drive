'use client';

import Image from 'next/image';
import { Play, Music } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { generateDownloadUrl } from '@/app/actions/files';
import { Button } from '@/components/ui/button';
import { ShareButton } from '@/components/share-button';
import { DragHandle } from '@/components/drag-handle';
import { TableCell, TableRow } from '@/components/ui/table';
import { useDragContext } from '@/contexts/drag-context';
import { useFileDialogs } from '@/contexts/file-dialog-context';

type FileRowData = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  uploadStatus: 'pending' | 'uploading' | 'complete' | 'failed';
  thumbnailUrl?: string | null | undefined;
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

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

import { formatDateTime as formatDate } from '@/lib/format-date';

export function FileRow({
  file,
  index = 0,
  isSelected,
  onSelect,
  shouldScroll,
  animate,
}: {
  file: FileRowData;
  index?: number;
  isSelected?: boolean;
  onSelect?: (id: string) => void;
  shouldScroll?: boolean;
  animate?: boolean;
}) {
  const rowRef = useRef<HTMLTableRowElement>(null);
  const mobileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isSelected && shouldScroll) {
      const el = rowRef.current ?? mobileRef.current;
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isSelected, shouldScroll]);
  const isImage = isImageMimeType(file.mimeType);
  const isVideo = isVideoMimeType(file.mimeType);
  const isAudio = isAudioMimeType(file.mimeType);
  const inFlight =
    file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';
  const isComplete = file.uploadStatus === 'complete';
  // A pending/failed row is a ghost (upload never finished); deleting it
  // is safe and lets users clean up. Only an actively-uploading row is
  // off-limits (cancelUpload handles that path instead).
  const canDelete = file.uploadStatus !== 'uploading';

  const { openPreviewDialog, openDeleteDialog } = useFileDialogs();
  const { draggedItem, isMoving } = useDragContext();

  const [isDownloading, setIsDownloading] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  const isSelfDragged =
    draggedItem?.type === 'file' && draggedItem.id === file.id;

  const thumbnailUrl = file.thumbnailUrl;

  const onDownload = async () => {
    setIsDownloading(true);
    try {
      const { presignedUrl, fileName } = await generateDownloadUrl({
        fileId: file.id,
      });
      const link = document.createElement('a');
      link.href = presignedUrl;
      link.download = fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Download failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const statusLabel = inFlight
    ? file.uploadStatus
    : file.uploadStatus === 'complete'
      ? 'complete'
      : file.uploadStatus;

  const handleRowClick = () => {
    onSelect?.(file.id);
  };

  const handleRowDoubleClick = () => {
    if (isComplete && (isImage || isVideo || isAudio)) {
      openPreviewDialog(file.id);
    }
  };

  const spawnClass = animate
    ? 'animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out'
    : '';

  return (
    <>
      <TableRow
        ref={rowRef}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        style={{ animationDelay: `${index * 50}ms` }}
        className={[
          'desktop-row',
          'hidden md:table-row',
          spawnClass,
          isSelfDragged ? 'opacity-50' : '',
          isSelected ? 'bg-accent-primary/10' : '',
          'cursor-pointer',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <TableCell
          className="w-9 px-1 py-1"
          onClick={(e) => e.stopPropagation()}
        >
          <DragHandle
            item={{ type: 'file', id: file.id, name: file.name }}
            disabled={inFlight || isMoving}
            label={`Drag ${file.name}`}
          />
        </TableCell>
        <TableCell className="min-w-[12rem] md:min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            {isImage && isComplete ? (
              <div className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-border-subtle bg-bg-surface-hover">
                {!thumbnailLoaded && (
                  <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-bg-surface via-bg-surface-hover to-bg-surface" />
                )}
                {thumbnailUrl && (
                  <Image
                    src={thumbnailUrl}
                    alt=""
                    fill
                    sizes="40px"
                    unoptimized
                    onLoad={() => setThumbnailLoaded(true)}
                    className={`object-cover transition-opacity duration-300 ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
                  />
                )}
              </div>
            ) : isVideo && isComplete ? (
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-accent-primary/15 text-accent-glow">
                  <Play className="h-5 w-5" aria-hidden />
              </div>
            ) : isAudio && isComplete ? (
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-accent-primary/15 text-accent-glow">
                <Music className="h-5 w-5" aria-hidden />
              </div>
            ) : (
              <div
                aria-hidden
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-bg-surface-hover text-xs font-medium text-text-secondary"
              >
                {file.name.split('.').pop()?.slice(0, 3).toUpperCase() || '—'}
              </div>
            )}
            <span
              title={file.name}
              className="min-w-0 flex-1 break-words font-medium text-text-primary"
            >
              {file.name}
            </span>
          </div>
        </TableCell>
        <TableCell className="w-32 text-text-secondary">
          {formatBytes(file.sizeBytes)}
        </TableCell>
        <TableCell className="w-40 text-text-secondary">
          {formatDate(file.createdAt)}
        </TableCell>
        <TableCell className="w-32">
          {inFlight ? (
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <span className="h-2 w-2 animate-pulse rounded-full bg-accent-glow" />
              {file.uploadStatus}
            </span>
          ) : file.uploadStatus === 'complete' ? (
            <span className="text-accent-glow">complete</span>
          ) : (
            <span className="text-red-400">{file.uploadStatus}</span>
          )}
        </TableCell>
        <TableCell
          className="w-44 text-right"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex flex-wrap items-center justify-end gap-2 md:flex-nowrap">
            <ShareButton
              fileId={file.id}
              fileName={file.name}
              existing={file.existingShare}
              enabled={isComplete}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDownload}
              disabled={!isComplete || isDownloading}
            >
              {isDownloading ? 'Preparing…' : 'Download'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => openDeleteDialog(file.id)}
              disabled={!canDelete}
            >
              Delete
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/*
       * Mobile card (< md). Single full-width cell containing a
       * vertical stack: thumbnail + name (top), then size · date
       * · actions (bottom).
       */}
      <tr className={['mobile-card-row', 'md:hidden', spawnClass].filter(Boolean).join(' ')} style={{ animationDelay: `${index * 50}ms` }}>
        <td className="mobile-card-cell" colSpan={6}>
          <div
            ref={mobileRef}
            onClick={handleRowClick}
            onDoubleClick={handleRowDoubleClick}
            className={[
              'mobile-card',
              isSelfDragged ? 'opacity-50' : '',
              isSelected ? 'bg-accent-primary/10' : '',
              'cursor-pointer rounded-md p-2',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-bg-surface-hover">
                {isImage && isComplete ? (
                  <div className="relative h-full w-full">
                    {!thumbnailLoaded && (
                      <div className="absolute inset-0 animate-pulse bg-gradient-to-r from-bg-surface via-bg-surface-hover to-bg-surface" />
                    )}
                    {thumbnailUrl && (
                      <Image
                        src={thumbnailUrl}
                        alt=""
                        fill
                        sizes="40px"
                        unoptimized
                        onLoad={() => setThumbnailLoaded(true)}
                        className={`object-cover transition-opacity duration-300 ${thumbnailLoaded ? 'opacity-100' : 'opacity-0'}`}
                      />
                    )}
                  </div>
                ) : isVideo && isComplete ? (
                  <div className="flex h-full w-full items-center justify-center bg-accent-primary/15 text-accent-glow">
                    <Play className="h-5 w-5" aria-hidden />
                  </div>
                ) : isAudio && isComplete ? (
                  <div className="flex h-full w-full items-center justify-center bg-accent-primary/15 text-accent-glow">
                    <Music className="h-5 w-5" aria-hidden />
                  </div>
                ) : (
                  <span aria-hidden className="text-xs font-medium text-text-secondary">
                    {file.name.split('.').pop()?.slice(0, 3).toUpperCase() || '—'}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div
                  title={file.name}
                  className="truncate font-medium text-text-primary"
                >
                  {file.name}
                </div>
                <div className="mt-0.5 truncate text-xs text-text-secondary">
                  {file.mimeType || 'File'}
                </div>
              </div>
              <div
                className="flex-shrink-0"
                onClick={(e) => e.stopPropagation()}
              >
                <DragHandle
                  item={{ type: 'file', id: file.id, name: file.name }}
                  disabled={inFlight || isMoving}
                  label={`Drag ${file.name}`}
                />
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[3.25rem] text-sm text-text-secondary">
              <span className="whitespace-nowrap">
                {formatBytes(file.sizeBytes)}
              </span>
              <span aria-hidden className="text-border-subtle">·</span>
              <span className="whitespace-nowrap">
                {formatDate(file.createdAt)}
              </span>
              {statusLabel !== 'complete' ? (
                <>
                  <span aria-hidden className="text-border-subtle">·</span>
                  <span
                    className={
                      inFlight
                        ? 'inline-flex items-center gap-1.5'
                        : file.uploadStatus === 'failed'
                          ? 'text-red-400'
                          : 'text-text-secondary'
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
                </>
              ) : null}
              <div
                className="ml-auto flex flex-wrap items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                <ShareButton
                  fileId={file.id}
                  fileName={file.name}
                  existing={file.existingShare}
                  enabled={isComplete}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                  disabled={!isComplete || isDownloading}
                >
                  {isDownloading ? 'Preparing…' : 'Download'}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => openDeleteDialog(file.id)}
                  disabled={!canDelete}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
