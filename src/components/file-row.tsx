'use client';

import Image from 'next/image';
import { Check, Link2, Music, Play } from 'lucide-react';
import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { ItemMenu } from '@/components/item-menu';
import { ShareButton } from '@/components/share-button';
import { TableCell, TableRow } from '@/components/ui/table';
import { useDragContext } from '@/contexts/drag-context';
import { useFileDialogs } from '@/contexts/file-dialog-context';
import { useItemActionDialogs } from '@/contexts/item-action-dialog-context';
import { useMultiSelect } from '@/contexts/multi-select-context';
import { useShareDialogs } from '@/contexts/share-dialog-context';
import { copyText } from '@/lib/clipboard';
import { downloadFile } from '@/lib/download-file';
import { isCoarsePointer } from '@/lib/pointer';
import { useItemDrag } from '@/hooks/use-item-drag';
import { useLongPress } from '@/hooks/use-long-press';

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
  const canPreview = isComplete && (isImage || isVideo || isAudio);
  // A pending/failed row is a ghost (upload never finished); deleting it
  // is safe and lets users clean up. Only an actively-uploading row is
  // off-limits (cancelUpload handles that path instead).
  const canDelete = file.uploadStatus !== 'uploading';

  const { openPreviewDialog, openDeleteDialog } = useFileDialogs();
  const { openMoveDialog, openRenameDialog } = useItemActionDialogs();
  const { openShareDialog } = useShareDialogs();
  const { draggedItem, isMoving } = useDragContext();
  const { mode: selectionMode, isSelected: isSelectedMulti, enter, toggle } =
    useMultiSelect();

  const selectable = { type: 'file', id: file.id, name: file.name } as const;

  // The row/card itself is the drag source on desktop (HTML5). On
  // mobile, a long-press enters multi-selection instead of dragging.
  const dragSource = useItemDrag({
    item: selectable,
    disabled: isMoving || inFlight,
  });
  const longPress = useLongPress({
    onTrigger: () => enter(selectable),
    disabled: isMoving || inFlight,
  });
  const isMultiSelected = isSelectedMulti(file.id);

  const [isDownloading, setIsDownloading] = useState(false);
  const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

  const isSelfDragged =
    draggedItem?.type === 'file' && draggedItem.id === file.id;

  const thumbnailUrl = file.thumbnailUrl;

  const handleCopyName = async () => {
    const ok = await copyText(file.name);
    toast.success(ok ? 'Name copied to clipboard' : 'Could not copy name');
  };

  const handleMenuDownload = () => {
    void onDownload();
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

  const onDownload = async () => {
    setIsDownloading(true);
    try {
      await downloadFile(file.id);
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
    // While multi-select mode is active, a tap toggles the file in the
    // selection instead of opening the preview.
    if (selectionMode) {
      toggle(selectable);
      return;
    }
    // On touch devices a single tap opens the preview directly — no
    // double-tap needed. Selection stays for non-previewable files
    // and desktop precision pointers.
    if (canPreview && isCoarsePointer()) {
      openPreviewDialog(file.id);
      return;
    }
    onSelect?.(file.id);
  };

  const handleRowDoubleClick = (event: ReactMouseEvent) => {
    // Stop the browser's double-click word selection so only a manual
    // drag inside the text selects it.
    event.preventDefault();
    if (canPreview) {
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
        {...dragSource.handlers}
        {...longPress.handlers}
        draggable={dragSource.isDraggable}
        onClick={handleRowClick}
        onDoubleClick={handleRowDoubleClick}
        style={{ animationDelay: `${index * 50}ms` }}
        className={[
          'desktop-row',
          'hidden md:table-row',
          spawnClass,
          isSelfDragged ? 'opacity-50' : '',
          isSelected || isMultiSelected ? 'bg-accent-primary/10' : '',
          'cursor-pointer',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <TableCell className="min-w-[12rem] md:min-w-0">
          <div className="flex min-w-0 items-center gap-3" data-no-drag>
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
                {isMultiSelected ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center bg-accent-primary/40"
                  >
                    <Check className="h-5 w-5 text-white" />
                  </span>
                ) : null}
              </div>
            ) : isVideo && isComplete ? (
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-accent-primary/15 text-accent-glow">
                  <Play className="h-5 w-5" aria-hidden />
                  {isMultiSelected ? (
                    <Check className="absolute h-5 w-5 text-white drop-shadow" />
                  ) : null}
              </div>
            ) : isAudio && isComplete ? (
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-accent-primary/15 text-accent-glow">
                <Music className="h-5 w-5" aria-hidden />
                {isMultiSelected ? (
                  <Check className="absolute h-5 w-5 text-white drop-shadow" />
                ) : null}
              </div>
            ) : (
              <div
                aria-hidden
                className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-bg-surface-hover text-xs font-medium text-text-secondary"
              >
                {isMultiSelected ? (
                  <Check className="h-5 w-5 text-accent-glow" />
                ) : (
                  file.name.split('.').pop()?.slice(0, 3).toUpperCase() || '—'
                )}
              </div>
            )}
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1">
              <span
                title={file.name}
                className="min-w-0 break-words font-medium text-text-primary"
              >
                {file.name}
              </span>
              {file.existingShare ? (
                <span
                  title="Shared"
                  role="img"
                  aria-label="Shared"
                  className="inline-flex shrink-0 items-center text-text-secondary"
                >
                  <Link2 className="h-3.5 w-3.5" />
                </span>
              ) : null}
              {inFlight ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bg-surface-hover px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent-glow" />
                  {file.uploadStatus}
                </span>
              ) : file.uploadStatus === 'failed' ? (
                <span className="inline-flex shrink-0 items-center rounded-full bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-400">
                  {file.uploadStatus}
                </span>
              ) : null}
            </span>
          </div>
        </TableCell>
        <TableCell className="w-32 text-text-secondary">
          {formatBytes(file.sizeBytes)}
        </TableCell>
        <TableCell className="w-40 text-text-secondary">
          {formatDate(file.createdAt)}
        </TableCell>
        <TableCell
          className="w-56 text-right"
          onClick={(e) => e.stopPropagation()}
          data-no-drag
        >
          <div className="flex flex-wrap items-center justify-end gap-1 md:flex-nowrap">
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
              variant="destructiveOutline"
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
       * vertical stack: thumbnail + name (top), then size · date ·
       * status (bottom). All actions live in the 3-dot menu on mobile.
       */}
      <tr className={['mobile-card-row', 'md:hidden', spawnClass].filter(Boolean).join(' ')} style={{ animationDelay: `${index * 50}ms` }}>
        <td className="mobile-card-cell" colSpan={4}>
          <div
            ref={mobileRef}
            onClick={handleRowClick}
            onDoubleClick={handleRowDoubleClick}
            {...dragSource.handlers}
            {...longPress.handlers}
            draggable={dragSource.isDraggable}
            className={[
              'mobile-card',
              isSelfDragged ? 'opacity-50' : '',
              isSelected || isMultiSelected ? 'bg-accent-primary/10' : '',
              'cursor-pointer rounded-md p-2',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="flex items-start gap-3">
              <div className="relative flex h-10 w-10 flex-shrink-0 items-center justify-center overflow-hidden rounded border border-border-subtle bg-bg-surface-hover">
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
                {isMultiSelected ? (
                  <span
                    aria-hidden
                    className="absolute inset-0 flex items-center justify-center bg-accent-primary/40"
                  >
                    <Check className="h-5 w-5 text-white" />
                  </span>
                ) : null}
              </div>
              <div className="min-w-0 flex-1" data-no-drag>
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
            </div>
          </div>
        </td>
      </tr>
    </>
  );
}
