'use client';

import { useTransition } from 'react';
import { toast } from 'sonner';
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
import { useTrashDialogs } from '@/contexts/file-dialog-context';
import {
  emptyTrash,
  permanentDeleteFile,
  restoreFileWithParents,
} from '@/app/actions/files';

export type TrashFileRowData = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  deletedAt: string | null;
  daysRemaining: number;
  purgingSoon: boolean;
};

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

import { formatDateTime as formatDate } from '@/lib/format-date';

function ActionButton({
  onClick,
  disabled,
  variant,
  children,
}: {
  onClick: () => void;
  disabled?: boolean;
  variant: 'outline' | 'default' | 'ghost' | 'secondary' | 'destructive';
  children: React.ReactNode;
}) {
  // For destructive, fall back to default; we'll add a `destructive`
  // style to button.tsx shortly. For now reuse ghost.
  const mapped = variant === 'destructive' ? 'ghost' : variant;
  return (
    <Button
      type="button"
      variant={mapped}
      size="sm"
      onClick={onClick}
      disabled={disabled}
      className={
        variant === 'destructive'
          ? 'text-red-600 hover:bg-red-50 hover:text-red-700'
          : undefined
      }
    >
      {children}
    </Button>
  );
}

export function TrashFileRow({ file }: { file: TrashFileRowData }) {
  const {
    openRestoreDialog,
    openPermanentDeleteDialog,
  } = useTrashDialogs();

  return (
    <tr className="border-b transition-colors hover:bg-zinc-50">
      <td className="p-3 align-middle">
        <div className="flex flex-col">
          <span className="truncate font-medium text-zinc-900">
            {file.name}
          </span>
          <span className="text-xs text-zinc-500">
            {file.mimeType || 'unknown'}
          </span>
        </div>
      </td>
      <td className="w-32 p-3 align-middle text-zinc-600">
        {formatBytes(file.sizeBytes)}
      </td>
      <td className="w-44 p-3 align-middle text-zinc-600">
        {formatDate(file.deletedAt)}
      </td>
      <td className="w-40 p-3 align-middle">
        {file.daysRemaining <= 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            Purge pending
          </span>
        ) : file.purgingSoon ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
            {file.daysRemaining} day{file.daysRemaining === 1 ? '' : 's'} left
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-700">
            {file.daysRemaining} days left
          </span>
        )}
      </td>
      <td className="w-56 p-3 text-right align-middle">
        <div className="flex items-center justify-end gap-2">
          <ActionButton
            variant="outline"
            onClick={() => openRestoreDialog(file.id)}
          >
            Restore
          </ActionButton>
          <ActionButton
            variant="destructive"
            onClick={() => openPermanentDeleteDialog(file.id)}
          >
            Delete forever
          </ActionButton>
        </div>
      </td>
    </tr>
  );
}

export function TrashDialogs({
  rows,
  folderCount,
}: {
  rows: TrashFileRowData[];
  folderCount: number;
}) {
  const { state, closeDialog } = useTrashDialogs();
  const [pending, startTransition] = useTransition();

  const active = state.fileId
    ? (rows.find((r) => r.id === state.fileId) ?? null)
    : null;

  const onConfirmRestore = () => {
    if (!active) return;
    const targetName = active.name;
    startTransition(async () => {
      try {
        const result = await restoreFileWithParents({ fileId: active.id });
        const folderCount = result.restoredFolderIds.length;
        if (folderCount > 0) {
          toast.success('File restored', {
            description: `"${targetName}" was restored. ${folderCount} parent folder${
              folderCount === 1 ? '' : 's'
            } ${folderCount === 1 ? 'was' : 'were'} also restored.`,
          });
        } else {
          toast.success('File restored', { description: targetName });
        }
        closeDialog();
      } catch (err) {
        toast.error('Restore failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  const onConfirmPermanentDelete = () => {
    if (!active) return;
    const targetName = active.name;
    startTransition(async () => {
      try {
        const result = await permanentDeleteFile({ fileId: active.id });
        toast.success('File permanently deleted', {
          description: targetName,
        });
        if (!result.purgedFromR2) {
          toast.warning('R2 object was already missing', {
            description:
              'The database row was removed, but the storage object was not found. The file is fully gone.',
          });
        }
        closeDialog();
      } catch (err) {
        toast.error('Delete failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  const onConfirmEmpty = () => {
    startTransition(async () => {
      try {
        const result = await emptyTrash();
        const totalItems = result.deletedCount + result.deletedFolderCount;
        toast.success('Trash emptied', {
          description: `${result.deletedFolderCount} folder${
            result.deletedFolderCount === 1 ? '' : 's'
          } and ${result.deletedCount} file${
            result.deletedCount === 1 ? '' : 's'
          } permanently removed (${totalItems} item${
            totalItems === 1 ? '' : 's'
          }).`,
        });
        if (result.r2DeletedCount < result.deletedCount) {
          toast.warning('Some R2 objects were already missing', {
            description: `${result.deletedCount - result.r2DeletedCount} file(s) were only removed from the database.`,
          });
        }
        closeDialog();
      } catch (err) {
        toast.error('Empty trash failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <>
      <Dialog
        open={state.kind === 'restore' && active !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {active && state.kind === 'restore' ? (
            <>
              <DialogHeader>
                <DialogTitle>Restore this file?</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-zinc-900">
                    {active.name}
                  </span>{' '}
                  will be moved back to your drive.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <p className="text-sm text-zinc-600">
                  If the folder this file came from is also in the trash,
                  it will be restored too (and any of{' '}
                  <em>its</em> parent folders that are in the trash). The
                  bytes in R2 are not touched.
                </p>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="default"
                  onClick={onConfirmRestore}
                  disabled={pending}
                >
                  {pending ? 'Restoring…' : 'Restore'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={state.kind === 'permanent-delete' && active !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          {active && state.kind === 'permanent-delete' ? (
            <>
              <DialogHeader>
                <DialogTitle>Delete forever?</DialogTitle>
                <DialogDescription>
                  <span className="font-medium text-zinc-900">
                    {active.name}
                  </span>{' '}
                  will be permanently removed from your drive AND from R2.
                  This cannot be undone.
                </DialogDescription>
              </DialogHeader>
              <DialogBody>
                <p className="text-sm text-zinc-600">
                  If the R2 object is already missing, the database row is
                  still removed and you will see a warning toast.
                </p>
              </DialogBody>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={closeDialog}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={onConfirmPermanentDelete}
                  disabled={pending}
                  className="bg-red-600 text-white hover:bg-red-700"
                >
                  {pending ? 'Deleting…' : 'Delete forever'}
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={state.kind === 'empty'}
        onOpenChange={(open) => {
          if (!open) closeDialog();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Empty the trash?</DialogTitle>
            <DialogDescription>
              {folderCount} folder{folderCount === 1 ? '' : 's'} and{' '}
              {rows.length} file{rows.length === 1 ? '' : 's'} will be
              permanently removed from your drive AND from R2. This cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="text-sm text-zinc-600">
              Each file&apos;s R2 object is deleted first, then its database
              row. Trashed folders and their contents are then removed. If an
              R2 object is already missing, the row is still removed and you
              will see a summary warning toast.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={closeDialog}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={onConfirmEmpty}
              disabled={pending}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {pending ? 'Emptying…' : 'Empty trash'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
