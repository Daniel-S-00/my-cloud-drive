'use client';

import Image from 'next/image';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  deleteFile,
  generateDownloadUrl,
  generatePreviewUrl,
} from '@/app/actions/files';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { TableCell, TableRow } from '@/components/ui/table';

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

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

export function FileRow({ file }: { file: FileRowData }) {
  const isImage = isImageMimeType(file.mimeType);
  const inFlight =
    file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';
  const isComplete = file.uploadStatus === 'complete';

  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [isDeleting, startDelete] = useTransition();
  const [isDownloading, setIsDownloading] = useState(false);

  useEffect(() => {
    if (!isImage || !isComplete) return;
    let cancelled = false;
    void (async () => {
      try {
        const { presignedUrl } = await generatePreviewUrl({ fileId: file.id });
        if (!cancelled) setPreviewUrl(presignedUrl);
      } catch {
        // Silently fail; the row will render without a thumbnail.
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

  const onConfirmDelete = () => {
    startDelete(async () => {
      try {
        await deleteFile({ fileId: file.id });
        toast.success('File deleted', { description: file.name });
        setDeleteOpen(false);
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  const onOpenPreview = async () => {
    setPreviewOpen(true);
    if (previewUrl) return;
    setPreviewLoading(true);
    try {
      const { presignedUrl } = await generatePreviewUrl({ fileId: file.id });
      setPreviewUrl(presignedUrl);
    } catch (err) {
      toast.error('Preview failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      });
    } finally {
      setPreviewLoading(false);
    }
  };

  return (
    <>
      <TableRow>
        <TableCell className="max-w-0">
          <div className="flex items-center gap-3">
            {isImage && isComplete ? (
              <button
                type="button"
                onClick={onOpenPreview}
                className="relative h-10 w-10 flex-shrink-0 overflow-hidden rounded border border-zinc-200 bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
                aria-label={`Preview ${file.name}`}
              >
                {previewUrl ? (
                  <Image
                    src={previewUrl}
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
              onClick={() => setDeleteOpen(true)}
              disabled={isDeleting}
            >
              Delete
            </Button>
          </div>
        </TableCell>
      </TableRow>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{file.name}</DialogTitle>
            <DialogDescription>
              {file.mimeType} · {formatBytes(file.sizeBytes)}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {previewLoading || !previewUrl ? (
              <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
                Loading preview…
              </div>
            ) : (
              <div className="relative">
                <Image
                  src={previewUrl}
                  alt={file.name}
                  width={1024}
                  height={1024}
                  unoptimized
                  className="h-auto w-full rounded object-contain"
                />
              </div>
            )}
          </DialogBody>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this file?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-zinc-900">{file.name}</span>{' '}
              will be hidden from your drive. The bytes stay in R2 for 30
              days before being swept.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-zinc-600">
              This action cannot be undone from the app. A future trash UI
              will let you restore deleted files within the 30-day window.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="default"
              onClick={onConfirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting…' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
