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
import { useFileDialogs } from '@/contexts/file-dialog-context';

export type FileDialogsFile = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

type PreviewBodyProps = {
  file: FileDialogsFile;
};

function PreviewBody({ file }: PreviewBodyProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { presignedUrl } = await generatePreviewUrl({ fileId: file.id });
        if (!cancelled) setUrl(presignedUrl);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Unknown error');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [file.id]);

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-zinc-500">
        <p>Preview failed.</p>
        <p className="text-xs text-zinc-400">{error}</p>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-zinc-500">
        Loading preview…
      </div>
    );
  }

  return (
    <div className="relative">
      <Image
        src={url}
        alt={file.name}
        width={1024}
        height={1024}
        unoptimized
        className="h-auto w-full rounded object-contain"
      />
    </div>
  );
}

export function FileDialogs({ files }: { files: FileDialogsFile[] }) {
  const { state, closeDialog } = useFileDialogs();

  const active = state.fileId
    ? (files.find((f) => f.id === state.fileId) ?? null)
    : null;

  const [isDeleting, startDelete] = useTransition();

  const onDownload = async (fileId: string) => {
    try {
      const { presignedUrl, fileName } = await generateDownloadUrl({ fileId });
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
    }
  };

  const onConfirmDelete = () => {
    if (!active) return;
    const targetName = active.name;
    startDelete(async () => {
      try {
        await deleteFile({ fileId: active.id });
        toast.success('File deleted', { description: targetName });
        closeDialog();
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <>
      <Dialog
        open={state.kind === 'preview' && active !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent className="max-w-3xl">
          {active && state.kind === 'preview' ? (
            <>
              <DialogHeader>
                <DialogTitle>{active.name}</DialogTitle>
                <DialogDescription>
                  {active.mimeType} · {formatBytes(active.sizeBytes)}
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <PreviewBody key={active.id} file={active} />
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void onDownload(active.id)}
                >
                  Download
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={state.kind === 'delete' && active !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {active && state.kind === 'delete' ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this file?</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-zinc-900">
                    {active.name}
                  </span>{' '}
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
                  onClick={closeDialog}
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
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
