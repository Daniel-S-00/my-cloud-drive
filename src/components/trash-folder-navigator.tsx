'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { restoreFolder } from '@/app/actions/folders';
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
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  TrashFolderRow,
  type TrashFolderRowData,
} from '@/components/trash-folder-row';
import { TrashDialogs, TrashFileRow } from '@/components/trash-file-row';
import type { TrashFileRowData } from '@/components/trash-file-row';
import {
  TrashDialogProvider,
  useTrashDialogs,
} from '@/contexts/file-dialog-context';

function EmptyTrashTrigger() {
  const { openEmptyDialog } = useTrashDialogs();
  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={openEmptyDialog}
    >
      Empty trash
    </Button>
  );
}

function RestoreThisFolderButton({
  folderId,
  folderName,
}: {
  folderId: string;
  folderName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  const onConfirm = () => {
    startTransition(async () => {
      try {
        const result = await restoreFolder({ folderId });
        toast.success('Folder restored', {
          description: `"${folderName}" was restored along with ${result.restoredFileCount} file${
            result.restoredFileCount === 1 ? '' : 's'
          } and ${result.restoredFolderCount} folder${
            result.restoredFolderCount === 1 ? '' : 's'
          }.`,
        });
        setOpen(false);
        // The current folder is no longer in trash, so navigate back
        // to the root trash view.
        router.push('/trash');
      } catch (err) {
        toast.error('Restore failed', {
          description: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        onClick={() => setOpen(true)}
      >
        Restore this folder
      </Button>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) setOpen(false);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore this folder?</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-text-primary">
                {folderName}
              </span>{' '}
              and all its contents will be moved back to your drive.
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
              onClick={() => setOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={onConfirm}
              disabled={pending}
            >
              {pending ? 'Restoring…' : 'Restore'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function FolderSection({ rows }: { rows: TrashFolderRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-4 text-center text-sm text-text-secondary">
        No trashed folders.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col" className="w-44">
            Deleted
          </TableHead>
          <TableHead scope="col" className="w-40">
            Auto-purge
          </TableHead>
          <TableHead scope="col" className="w-56 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TrashFolderRow key={row.id} folder={row} />
        ))}
      </TableBody>
    </Table>
  );
}

function FileSection({ rows }: { rows: TrashFileRowData[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-4 text-center text-sm text-text-secondary">
        No trashed files.
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead scope="col">Name</TableHead>
          <TableHead scope="col" className="w-32">
            Size
          </TableHead>
          <TableHead scope="col" className="w-44">
            Deleted
          </TableHead>
          <TableHead scope="col" className="w-40">
            Auto-purge
          </TableHead>
          <TableHead scope="col" className="w-56 text-right">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TrashFileRow key={row.id} file={row} />
        ))}
      </TableBody>
    </Table>
  );
}

export function TrashFolderNavigator({
  folderRows,
  fileRows,
  currentFolderId,
  currentFolderName,
}: {
  folderRows: TrashFolderRowData[];
  fileRows: TrashFileRowData[];
  currentFolderId: string | null;
  currentFolderName: string | null;
}) {
  const hasFolders = folderRows.length > 0;
  const hasFiles = fileRows.length > 0;
  const hasAny = hasFolders || hasFiles;
  const isInsideFolder = currentFolderId !== null;

  // Root trash with no items at all — show the full empty state
  // without the action buttons (there is nothing to empty).
  if (!hasAny && !isInsideFolder) {
    return (
      <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-6 text-center text-sm text-text-secondary">
        Trash is empty. Folders and files you delete from your drive will appear
        here for 30 days.
      </div>
    );
  }

  return (
    <TrashDialogProvider>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-2">
          {isInsideFolder && currentFolderName ? (
            <RestoreThisFolderButton
              folderId={currentFolderId as string}
              folderName={currentFolderName}
            />
          ) : (
            <span />
          )}
          <EmptyTrashTrigger />
        </div>

        {!hasAny && isInsideFolder ? (
          <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-6 text-center text-sm text-text-secondary">
            This folder is empty.
          </div>
        ) : (
          <>
            <section
              aria-label="Folders in trash"
              className="flex flex-col gap-2"
            >
              <h2 className="text-sm font-medium text-text-secondary">
                Folders in trash ({folderRows.length})
              </h2>
              <FolderSection rows={folderRows} />
            </section>

            <section
              aria-label="Files in trash"
              className="flex flex-col gap-2"
            >
              <h2 className="text-sm font-medium text-text-secondary">
                Files in trash ({fileRows.length})
              </h2>
              <FileSection rows={fileRows} />
            </section>
          </>
        )}
      </div>
      <TrashDialogs rows={fileRows} folderCount={folderRows.length} />
    </TrashDialogProvider>
  );
}
