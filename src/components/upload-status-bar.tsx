'use client';

import { CheckCircle2, Loader2, X, XCircle } from 'lucide-react';
import { useUpload } from '@/contexts/upload-context';
import { Progress } from '@/components/ui/progress';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/**
 * Global upload status bar shown while any file is uploading, regardless
 * of which trigger started it (FAB, drag-drop, file picker). Renders
 * fixed at the bottom so slow/large uploads are always visible.
 */
export function UploadStatusBar() {
  const { items, isUploading, overallProgress, clearCompleted } = useUpload();

  if (items.length === 0) return null;

  const active = items.filter(
    (i) => i.status === 'queued' || i.status === 'uploading',
  );
  const failed = items.filter((i) => i.status === 'error');
  const done = items.filter((i) => i.status === 'complete');
  const show = isUploading || failed.length > 0 || done.length > 0;

  if (!show) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 right-6 z-40 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border-subtle bg-bg-surface p-3 shadow-xl"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {isUploading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-accent-glow" />
          ) : failed.length > 0 ? (
            <XCircle className="h-4 w-4 shrink-0 text-red-400" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
          )}
          <span className="truncate text-sm font-medium text-text-primary">
            {isUploading
              ? `Uploading… ${overallProgress}%`
              : failed.length > 0
                ? `${failed.length} upload${failed.length > 1 ? 's' : ''} failed`
                : done.length === 1
                  ? `${done[0].fileCount} upload${done[0].fileCount > 1 ? 's' : ''} complete`
                  : `${done.length} upload${done.length > 1 ? 's' : ''} complete`}
          </span>
        </div>
        <button
          type="button"
          onClick={clearCompleted}
          aria-label="Dismiss upload status"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {isUploading && (
        <div className="mt-2 flex flex-col gap-1">
          <Progress
            value={overallProgress}
            ariaLabel="Upload progress"
          />
          {active.length > 0 && (
            <p className="truncate text-xs text-text-secondary">
              {active[0].status === 'uploading'
                ? `${active[0].name} (${formatBytes(active[0].size)})`
                : `${active.length} file${active.length > 1 ? 's' : ''} waiting`}
            </p>
          )}
        </div>
      )}

      {failed.length > 0 && (
        <p className="mt-2 text-xs text-red-400">
          {failed[0].error ?? 'Upload failed'}
        </p>
      )}
    </div>
  );
}
