'use client';

import Image from 'next/image';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { generateDownloadUrl, generatePreviewUrl } from '@/app/actions/files';
import { Button } from '@/components/ui/button';
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
};

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
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

export function FileRow({ file }: { file: FileRowData }) {
  const isImage = isImageMimeType(file.mimeType);
  const inFlight =
    file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';
  const isComplete = file.uploadStatus === 'complete';

  const { openPreviewDialog, openDeleteDialog } = useFileDialogs();
  const { draggedItem, isMoving } = useDragContext();

  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Dim the row while it is being dragged. The drag is initiated
  // from the dedicated drag handle, not the row.
  const isSelfDragged =
    draggedItem?.type === 'file' && draggedItem.id === file.id;

  useEffect(() => {
    if (!isImage || !isComplete) return;
    let cancelled = false;
    void (async () => {
      try {
        const { presignedUrl } = await generatePreviewUrl({ fileId: file.id });
        if (!cancelled) setThumbnailUrl(presignedUrl);
      } catch {
        // Silently fail; the row renders without a thumbnail.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id, isImage, isComplete]);

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

  return (
    <TableRow
      // The row is NOT draggable — only the dedicated <DragHandle />
      // in the first cell initiates a drag. This avoids conflicts
      // with clickable children (preview button, action buttons,
      // and — in the folder row — the navigation <Link>).
      className={isSelfDragged ? 'opacity-50' : undefined}
    >
      <TableCell className="w-9 px-1 py-1">
        <DragHandle
          item={{ type: 'file', id: file.id, name: file.name }}
          disabled={inFlight || isMoving}
          label={`Drag ${file.name}`}
        />
      </TableCell>
      <TableCell className="max-w-0">
        <div className="flex items-center gap-3">
          {isImage && isComplete ? (
            <button
              type="button"
              onClick={() => openPreviewDialog(file.id)}
              className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
              aria-label={`Preview ${file.name}`}
            >
              {thumbnailUrl ? (
                <Image
                  src={thumbnailUrl}
                  alt=""
                  fill
                  sizes="40px"
                  unoptimized
                  className="object-cover"
                />
              ) : (
                <span className="absolute inset-0 animate-pulse bg-zinc-200" />
              )}
            </button>
          ) : (
            <div
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-zinc-200 bg-zinc-100 text-xs font-medium text-zinc-500"
            >
              {file.name.split('.').pop()?.slice(0, 3).toUpperCase() || '—'}
            </div>
          )}
          <span className="truncate font-medium text-zinc-900">
            {file.name}
          </span>
        </div>
      </TableCell>
      <TableCell className="w-32 text-zinc-600">
        {formatBytes(file.sizeBytes)}
      </TableCell>
      <TableCell className="w-40 text-zinc-600">
        {formatDate(file.createdAt)}
      </TableCell>
      <TableCell className="w-32">
        {inFlight ? (
          <span className="inline-flex items-center gap-2 text-zinc-600">
            <span className="h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            {file.uploadStatus}
          </span>
        ) : file.uploadStatus === 'complete' ? (
          <span className="text-green-700">complete</span>
        ) : (
          <span className="text-red-700">{file.uploadStatus}</span>
        )}
      </TableCell>
      <TableCell className="w-44 text-right">
        <div className="flex items-center justify-end gap-2">
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
            disabled={!isComplete}
          >
            Delete
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}
