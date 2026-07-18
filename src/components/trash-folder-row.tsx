'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  permanentDeleteFolder,
  restoreFolder,
} from '@/app/actions/folders';
import { Button } from '@/components/ui/button';
import { Folder } from 'lucide-react';
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
import { formatDateTime as formatDate } from '@/lib/format-date';

export type TrashFolderRowData = {
  id: string;
  name: string;
  filesCount: number;
  subfoldersCount: number;
  deletedAt: string | null;
  daysRemaining: number;
  purgingSoon: boolean;
};

type DialogKind = 'restore' | 'permanent-delete' | null;

function FolderIcon({ className }: { className?: string }) {
  return <Folder className={className} aria-hidden />;
}

export function TrashFolderRow({ folder }: { folder: TrashFolderRowData }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<DialogKind>(null);
  const [pending, startTransition] = useTransition();

  const close = () => setDialog(null);

  const navigateInto = () => {
    router.push(`/trash?folder=${folder.id}`);
  };

  const onConfirmRestore = () => {
    startTransition(async () => {
      try {
        const result = await restoreFolder({ folderId: folder.id });
        toast.success('Folder restored', {
          description: `"${folder.name}" was restored along with ${result.restoredFileCount} file${
            result.restoredFileCount === 1 ? '' : 's'
          } and ${result.restoredFolderCount} folder${
            result.restoredFolderCount === 1 ? '' : 's'
          }.`,
        });
        close();
      } catch (err) {
        toast.error('Restore failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  const onConfirmPermanentDelete = () => {
    startTransition(async () => {
      try {
        const result = await permanentDeleteFolder({ folderId: folder.id });
        toast.success('Folder permanently deleted', {
          description: `"${folder.name}" and ${result.deletedFileCount} file${
            result.deletedFileCount === 1 ? '' : 's'
          } were removed (${result.deletedFolderCount} folder${
            result.deletedFolderCount === 1 ? '' : 's'
          } deleted).`,
        });
        if (result.r2DeletedCount < result.deletedFileCount) {
          toast.warning('Some R2 objects were already missing', {
            description: `${
              result.deletedFileCount - result.r2DeletedCount
            } file(s) were only removed from the database.`,
          });
        }
        close();
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <>
      {/* Desktop row (>= md) */}
      <TableRow className="desktop-row hidden border-b border-border-subtle transition-colors hover:bg-bg-surface-hover md:table-row">
        <TableCell className="min-w-[12rem] md:min-w-0">
          <button
            type="button"
            onClick={navigateInto}
            className="flex w-full min-w-0 items-center gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-accent-primary/15 text-accent-glow"
            >
              <FolderIcon className="h-5 w-5" />
            </span>
            <div className="flex min-w-0 flex-col">
              <span
                title={folder.name}
                className="min-w-0 break-words font-medium text-text-primary hover:underline"
              >
                {folder.name}
              </span>
              <span className="text-xs text-text-secondary">
                {folder.filesCount} file{folder.filesCount === 1 ? '' : 's'}
                {folder.subfoldersCount > 0
                  ? `, ${folder.subfoldersCount} folder${
                      folder.subfoldersCount === 1 ? '' : 's'
                    } inside`
                  : ' inside'}
              </span>
            </div>
          </button>
        </TableCell>
        <TableCell className="w-44 text-text-secondary">
          {formatDate(folder.deletedAt)}
        </TableCell>
        <TableCell className="w-40">
          {folder.daysRemaining <= 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/40">
              Purge pending
            </span>
          ) : folder.purgingSoon ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/40">
              {folder.daysRemaining} day{folder.daysRemaining === 1 ? '' : 's'} left
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary ring-1 ring-inset ring-border-subtle">
              {folder.daysRemaining} days left
            </span>
          )}
        </TableCell>
        <TableCell className="w-56 text-right">
          <div className="flex flex-wrap items-center justify-end gap-2 md:flex-nowrap">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={() => setDialog('restore')}
            >
              Restore
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => setDialog('permanent-delete')}
            >
              Delete forever
            </Button>
          </div>
        </TableCell>
      </TableRow>

      {/* Mobile card (< md) */}
      <tr className="mobile-card-row md:hidden">
        <td className="mobile-card-cell" colSpan={4}>
          <div className="mobile-card">
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-accent-primary/15 text-accent-glow"
              >
                <FolderIcon className="h-5 w-5" />
              </span>
              <button
                type="button"
                onClick={navigateInto}
                className="min-w-0 flex-1 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <div
                  title={folder.name}
                  className="truncate font-medium text-text-primary"
                >
                  {folder.name}
                </div>
                <div className="mt-0.5 truncate text-xs text-text-secondary">
                  {folder.filesCount} file{folder.filesCount === 1 ? '' : 's'}
                  {folder.subfoldersCount > 0
                    ? `, ${folder.subfoldersCount} folder${
                        folder.subfoldersCount === 1 ? '' : 's'
                      } inside`
                    : ' inside'}
                </div>
              </button>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 pl-[3.25rem] text-sm text-text-secondary">
              <span className="whitespace-nowrap">
                {formatDate(folder.deletedAt)}
              </span>
              <span aria-hidden className="text-border-subtle">·</span>
              {folder.daysRemaining <= 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/40">
                  Purge pending
                </span>
              ) : folder.purgingSoon ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-950/40 px-2 py-0.5 text-xs font-medium text-red-300 ring-1 ring-inset ring-red-500/40">
                  {folder.daysRemaining} day{folder.daysRemaining === 1 ? '' : 's'} left
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-secondary ring-1 ring-inset ring-border-subtle">
                  {folder.daysRemaining} days left
                </span>
              )}
              <div className="ml-auto flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={() => setDialog('restore')}
                >
                  Restore
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  onClick={() => setDialog('permanent-delete')}
                >
                  Delete forever
                </Button>
              </div>
            </div>
          </div>
        </td>
      </tr>

      <Dialog
        open={dialog === 'restore'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this folder?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-text-primary">
                {folder.name}
              </span>{' '}
              will be moved back to your drive, along with{' '}
              {folder.filesCount} file{folder.filesCount === 1 ? '' : 's'} and{' '}
              {folder.subfoldersCount} subfolder
              {folder.subfoldersCount === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-text-secondary">
              If the folder this one came from is also in the trash, it will be
              restored too. The bytes in R2 are not touched.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onConfirmRestore}
              disabled={pending}
            >
              {pending ? 'Restoring…' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={dialog === 'permanent-delete'}
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete forever?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-text-primary">
                {folder.name}
              </span>{' '}
              and all {folder.filesCount} file
              {folder.filesCount === 1 ? '' : 's'} inside will be permanently
              removed from your drive AND from R2. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-text-secondary">
              Each file&apos;s R2 object is deleted first, then the database
              rows. If an R2 object is already missing, the row is still
              removed and you will see a summary warning.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={close}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={onConfirmPermanentDelete}
              disabled={pending}
            >
              {pending ? 'Deleting…' : 'Delete forever'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
