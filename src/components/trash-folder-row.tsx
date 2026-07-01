'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import {
  permanentDeleteFolder,
  restoreFolder,
} from '@/app/actions/folders';
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
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden
    >
      <path
        d="M3 7.5A2.5 2.5 0 0 1 5.5 5h3.379a2 2 0 0 1 1.414.586l1.121 1.121A2 2 0 0 0 12.828 7.5H18.5A2.5 2.5 0 0 1 21 10v7.5A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5v-10Z"
        strokeLinejoin="round"
      />
    </svg>
  );
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
      <TableRow className="border-b transition-colors hover:bg-zinc-50">
        <TableCell className="max-w-0">
          <button
            type="button"
            onClick={navigateInto}
            className="flex w-full items-center gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-950"
          >
            <span
              aria-hidden
              className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded border border-zinc-200 bg-amber-50 text-amber-700"
            >
              <FolderIcon className="h-5 w-5" />
            </span>
            <div className="flex flex-col">
              <span className="truncate font-medium text-zinc-900 hover:underline">
                {folder.name}
              </span>
              <span className="text-xs text-zinc-500">
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
        <TableCell className="w-44 text-zinc-600">
          {formatDate(folder.deletedAt)}
        </TableCell>
        <TableCell className="w-40">
          {folder.daysRemaining <= 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              Purge pending
            </span>
          ) : folder.purgingSoon ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
              {folder.daysRemaining} day{folder.daysRemaining === 1 ? '' : 's'} left
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
              {folder.daysRemaining} days left
            </span>
          )}
        </TableCell>
        <TableCell className="w-56 text-right">
          <div className="flex items-center justify-end gap-2">
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={() => setDialog('restore')}
              className="bg-green-600 text-white hover:bg-green-700"
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
              <span className="font-medium text-zinc-900">
                {folder.name}
              </span>{' '}
              will be moved back to your drive, along with{' '}
              {folder.filesCount} file{folder.filesCount === 1 ? '' : 's'} and{' '}
              {folder.subfoldersCount} subfolder
              {folder.subfoldersCount === 1 ? '' : 's'}.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-zinc-600">
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
              onClick={onConfirmRestore}
              disabled={pending}
              className="bg-green-600 text-white hover:bg-green-700"
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
              <span className="font-medium text-zinc-900">
                {folder.name}
              </span>{' '}
              and all {folder.filesCount} file
              {folder.filesCount === 1 ? '' : 's'} inside will be permanently
              removed from your drive AND from R2. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-zinc-600">
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
