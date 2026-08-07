'use client';

import { Download, FolderInput, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useItemActionDialogs } from '@/contexts/item-action-dialog-context';
import { useMultiSelect } from '@/contexts/multi-select-context';
import { useShareDialogs } from '@/contexts/share-dialog-context';
import { downloadFile } from '@/lib/download-file';

/**
 * Floating action bar shown while multi-select mode is active (mobile
 * long-press). Offers Move to folder (all selected), Download (files
 * only) and Share (single file only) against the whole selection.
 */
export function SelectionBar() {
  const { items, mode, exit } = useMultiSelect();
  const { openMoveDialog } = useItemActionDialogs();
  const { openShareDialog } = useShareDialogs();

  if (!mode || items.length === 0) return null;

  const fileItems = items.filter((i) => i.type === 'file');
  const singleFile =
    items.length === 1 && items[0].type === 'file' ? items[0] : null;

  const onMove = () => {
    openMoveDialog(items);
    exit();
  };

  const onDownload = () => {
    exit();
    if (fileItems.length === 0) return;
    void (async () => {
      let failed = 0;
      for (const file of fileItems) {
        try {
          await downloadFile(file.id);
        } catch (err) {
          failed += 1;
          toast.error('Download failed', {
            description: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
      if (failed === 0 && fileItems.length > 1) {
        toast.success(`${fileItems.length} files downloading`);
      }
    })();
  };

  const onShare = () => {
    if (!singleFile) return;
    exit();
    openShareDialog({
      id: singleFile.id,
      name: singleFile.name,
      existing: undefined,
    });
  };

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-3 z-40 flex justify-center px-3">
      <div
        role="toolbar"
        aria-label="Selected items"
        className="pointer-events-auto flex w-full max-w-lg items-center gap-1 rounded-xl border border-border-subtle bg-bg-surface px-2 py-1.5 shadow-2xl"
      >
        <button
          type="button"
          onClick={exit}
          aria-label="Clear selection"
          className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary"
        >
          <X className="h-4 w-4" aria-hidden />
          <span>{items.length} selected</span>
        </button>

        <span className="mx-1 h-5 w-px bg-border-subtle" aria-hidden />

        <div className="flex flex-1 items-center justify-end gap-1">
          <button
            type="button"
            onClick={onMove}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-hover"
          >
            <FolderInput className="h-4 w-4 text-text-secondary" aria-hidden />
            Move
          </button>
          <button
            type="button"
            onClick={onDownload}
            disabled={fileItems.length === 0}
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-hover disabled:opacity-40"
          >
            <Download className="h-4 w-4 text-text-secondary" aria-hidden />
            Download
          </button>
          <button
            type="button"
            onClick={onShare}
            disabled={!singleFile}
            title={
              singleFile
                ? 'Share this file'
                : 'Share is available for a single file'
            }
            className="inline-flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-hover disabled:opacity-40"
          >
            <Link2 className="h-4 w-4 text-text-secondary" aria-hidden />
            Share
          </button>
        </div>
      </div>
    </div>
  );
}
