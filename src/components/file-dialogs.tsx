'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  deleteFile,
  generateDownloadUrl,
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
  /**
   * A long-lived (24h), cached presigned URL signed server-side.
   * Present for viewable media (image/* + video/*) that is ready
   * (uploadStatus === 'complete'). Used both as the row thumbnail and
   * as the modal preview source so the browser can cache it across
   * navigations. Null for non-media or not-yet-ready files.
   */
  thumbnailUrl?: string | null;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * True for files the Media Viewer can render in-browser. Images are
 * shown via `<Image>`; videos via the native `<video controls>`;
 * audio via `<audio controls>`.
 */
export function isViewableMedia(mimeType: string): boolean {
  const mt = mimeType.toLowerCase();
  return mt.startsWith('image/') || mt.startsWith('video/') || mt.startsWith('audio/');
}

function isVideoMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('video/');
}

function isAudioMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('audio/');
}

/**
 * A simple spinning loader shown while the presigned URL for a
 * preview is being fetched (initial open or after next/prev
 * navigation).
 */
function PreviewSpinner() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex h-full min-h-[16rem] flex-col items-center justify-center gap-3 text-sm text-text-secondary"
    >
      <LoaderCircle className="h-8 w-8 animate-spin text-accent-glow" aria-hidden />
      <span>Loading preview…</span>
    </div>
  );
}

type PreviewBodyProps = {
  file: FileDialogsFile;
};

function PreviewBody({ file }: PreviewBodyProps) {
  // The preview URL is now signed SERVER-SIDE and passed in via the
  // `thumbnailUrl` prop (a cached, long-lived 24h URL). We no longer
  // fetch it in a useEffect on mount — that re-signed on every open
  // and every prev/next navigation, producing a different URL string
  // each time and defeating the browser cache.
  const url = file.thumbnailUrl ?? null;

  if (!url) {
    return <PreviewSpinner />;
  }

  if (isAudioMimeType(file.mimeType)) {
    return (
      <div className="flex flex-1 items-center justify-center p-3 md:p-4">
        <audio
          key={url}
          src={url}
          controls
          autoPlay
          preload="metadata"
          className="w-full max-w-lg"
        >
          Your browser does not support audio playback.
        </audio>
      </div>
    );
  }

  return (
    <div className="relative flex flex-1 items-center justify-center overflow-hidden">
      {isVideoMimeType(file.mimeType) ? (
        <video
          key={url}
          src={url}
          controls
          autoPlay
          playsInline
          preload="metadata"
          className="max-h-full max-w-full object-contain"
        >
          Your browser does not support video playback.
        </video>
      ) : (
        <Image
          src={url}
          alt={file.name}
          width={1920}
          height={1080}
          unoptimized
          className="max-h-full max-w-full object-contain"
        />
      )}
    </div>
  );
}

/**
 * Chevron for prev/next media navigation. Provided by lucide-react.
 */

type PreviewDialogProps = {
  files: FileDialogsFile[];
  mediaFiles: FileDialogsFile[];
  initialFileId: string;
  onDownload: (fileId: string) => void;
};

function PreviewDialog({
  files,
  mediaFiles,
  initialFileId,
  onDownload,
}: PreviewDialogProps) {
  const { closeDialog } = useFileDialogs();
  // The active file in the viewer. Initialized from the file the
  // user clicked; updated by prev/next navigation. The parent
  // re-mounts this component on every open, so we don't need to
  // listen for `initialFileId` changes here.
  const [activeFileId, setActiveFileId] = useState(initialFileId);

  // The "active file" must be looked up in the FULL list (a user
  // can preview a file that's not in the media-filtered list if
  // the parent ever passes a non-media file). The position in the
  // media list, however, is what drives the prev/next buttons.
  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId) ?? null,
    [files, activeFileId],
  );

  const mediaIndex = useMemo(
    () => mediaFiles.findIndex((f) => f.id === activeFileId),
    [mediaFiles, activeFileId],
  );
  const canGoPrev = mediaIndex > 0;
  const canGoNext =
    mediaIndex >= 0 && mediaIndex < mediaFiles.length - 1;

  const goPrev = useCallback(() => {
    if (canGoPrev) {
      setActiveFileId(mediaFiles[mediaIndex - 1].id);
    }
  }, [canGoPrev, mediaFiles, mediaIndex]);

  const goNext = useCallback(() => {
    if (canGoNext) {
      setActiveFileId(mediaFiles[mediaIndex + 1].id);
    }
  }, [canGoNext, mediaFiles, mediaIndex]);

  // Keyboard shortcuts: ←/→ to navigate, Esc to close. The Esc
  // handler is redundant with the native <dialog> Esc behavior
  // but stays in case the user is focused on a child control
  // (e.g. the video player) that swallows the event.
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'ArrowLeft') {
        if (canGoPrev) {
          event.preventDefault();
          goPrev();
        }
      } else if (event.key === 'ArrowRight') {
        if (canGoNext) {
          event.preventDefault();
          goNext();
        }
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeDialog();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [canGoPrev, canGoNext, goPrev, goNext, closeDialog]);

  if (!activeFile) return null;

  const mediaPosition =
    mediaIndex >= 0 && mediaFiles.length > 0
      ? `${mediaIndex + 1} of ${mediaFiles.length}`
      : null;

  return (
    <DialogContent animated className="sm:rounded-xl">
      <DialogHeader className="flex-row items-start justify-between gap-3 border-b border-border-subtle p-3 md:p-4">
        <div className="flex min-w-0 flex-col gap-1">
          <DialogTitle
            title={activeFile.name}
            className="break-words text-text-primary"
          >
            {activeFile.name}
          </DialogTitle>
          <DialogDescription>
            {activeFile.mimeType || 'Unknown type'} ·{' '}
            {formatBytes(activeFile.sizeBytes)}
            {mediaPosition ? (
              <span className="text-text-secondary/70">
                {' · '}
                {mediaPosition}
              </span>
            ) : null}
          </DialogDescription>
        </div>
        <button
          type="button"
          onClick={closeDialog}
          aria-label="Close preview"
          className="-m-2 inline-flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </DialogHeader>
      <div className="relative flex min-h-[300px] flex-1 flex-col bg-bg-base">
        <PreviewBody key={activeFile.id} file={activeFile} />
        {canGoPrev ? (
          <button
            type="button"
            onClick={goPrev}
            aria-label={`Previous media (${mediaFiles[mediaIndex - 1]?.name ?? ''})`}
            className="absolute left-2 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-bg-surface/60 text-text-primary shadow-md backdrop-blur-md transition-colors hover:bg-bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow sm:flex"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        ) : null}
        {canGoNext ? (
          <button
            type="button"
            onClick={goNext}
            aria-label={`Next media (${mediaFiles[mediaIndex + 1]?.name ?? ''})`}
            className="absolute right-2 top-1/2 z-10 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-border-subtle bg-bg-surface/60 text-text-primary shadow-md backdrop-blur-md transition-colors hover:bg-bg-surface focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow sm:flex"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        ) : null}
      </div>
      <div className="flex flex-col-reverse items-center justify-between gap-2 border-t border-border-subtle p-3 md:flex-row md:p-4">
        <span className="flex items-center gap-1 text-xs text-text-secondary/70">
          <kbd className="rounded border border-border-subtle bg-bg-surface-hover px-1 font-mono text-[0.7rem]">
            ←
          </kbd>
          <kbd className="rounded border border-border-subtle bg-bg-surface-hover px-1 font-mono text-[0.7rem]">
            →
          </kbd>
          to browse ·
          <kbd className="rounded border border-border-subtle bg-bg-surface-hover px-1 font-mono text-[0.7rem]">
            Esc
          </kbd>
          to close
        </span>
        <Button
          type="button"
          variant="primary"
          onClick={() => onDownload(activeFile.id)}
        >
          Download
        </Button>
      </div>
    </DialogContent>
  );
}

export type FileDialogsProps = {
  files: FileDialogsFile[];
  /**
   * The viewable-media subset of `files` (image/* + video/*).
   * The parent computes this so the dialog can focus on rendering
   * and prev/next navigation. If omitted, the dialog falls back
   * to filtering `files` itself.
   */
  mediaFiles?: FileDialogsFile[];
};

export function FileDialogs({ files, mediaFiles: mediaFilesProp }: FileDialogsProps) {
  const { state, closeDialog } = useFileDialogs();

  // The full list of viewable media (image/* + video/*) in the
  // current folder. Used by the preview to compute prev/next
  // navigation. If the parent supplied a pre-filtered list, use
  // it as-is; otherwise filter on the fly.
  const mediaFiles = useMemo(
    () =>
      mediaFilesProp ?? files.filter((f) => isViewableMedia(f.mimeType)),
    [files, mediaFilesProp],
  );

  // The file currently being deleted (separate from the preview
  // state). The Delete dialog is opened from the file row's
  // Delete button, not from the preview.
  const fileToDelete = state.fileId
    ? (files.find((f) => f.id === state.fileId) ?? null)
    : null;

  const [isDeleting, startDelete] = useTransition();

  const onDownload = useCallback(async (fileId: string) => {
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
  }, []);

  const onConfirmDelete = () => {
    if (!fileToDelete) return;
    const targetName = fileToDelete.name;
    startDelete(async () => {
      try {
        await deleteFile({ fileId: fileToDelete.id });
        toast.success('File deleted', { description: targetName });
        closeDialog();
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  const previewFileId =
    state.kind === 'preview' && state.fileId ? state.fileId : null;

  return (
    <>
      <Dialog
        open={state.kind === 'preview' && previewFileId !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        {previewFileId !== null ? (
          // The `key` forces a fresh PreviewDialog (and its local
          // activeFileId state) every time the user opens the
          // preview with a new file, so prev/next navigation from
          // a previous session is forgotten on each open.
          <PreviewDialog
            key={previewFileId}
            files={files}
            mediaFiles={mediaFiles}
            initialFileId={previewFileId}
            onDownload={(id) => void onDownload(id)}
          />
        ) : null}
      </Dialog>

      <Dialog
        open={state.kind === 'delete' && fileToDelete !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent animated>
          {fileToDelete ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete this file?</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-text-primary">
                    {fileToDelete.name}
                  </span>{' '}
                  will be hidden from your drive. The bytes stay in R2 for 30
                  days before being swept.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <p className="text-sm text-text-secondary">
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
                  variant="destructive"
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
