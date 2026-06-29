'use client';

import { Button } from '@/components/ui/button';
import { TrashDialogProvider, useTrashDialogs } from '@/contexts/file-dialog-context';
import { TrashDialogs, TrashFileRow } from '@/components/trash-file-row';

export type TrashFileRowData = {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  deletedAt: string | null;
  daysRemaining: number;
  purgingSoon: boolean;
};

function EmptyTrashTrigger() {
  const { openEmptyDialog } = useTrashDialogs();
  return (
    <Button
      type="button"
      variant="destructive"
      size="sm"
      onClick={openEmptyDialog}
      className="bg-red-600 text-white hover:bg-red-700"
    >
      Empty trash
    </Button>
  );
}

function TrashTable({ rows }: { rows: TrashFileRowData[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <table className="w-full caption-bottom text-sm">
        <thead className="border-b bg-zinc-50">
          <tr>
            <th className="h-10 px-3 text-left align-middle font-medium text-zinc-500">
              Name
            </th>
            <th className="h-10 w-32 px-3 text-left align-middle font-medium text-zinc-500">
              Size
            </th>
            <th className="h-10 w-44 px-3 text-left align-middle font-medium text-zinc-500">
              Deleted
            </th>
            <th className="h-10 w-40 px-3 text-left align-middle font-medium text-zinc-500">
              Auto-purge
            </th>
            <th className="h-10 w-56 px-3 text-right align-middle font-medium text-zinc-500">
              Actions
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <TrashFileRow key={row.id} file={row} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function TrashFileListClient({
  rows,
  hasFiles,
}: {
  rows: TrashFileRowData[];
  hasFiles: boolean;
}) {
  if (!hasFiles) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
        No trashed files. Files you delete from your drive will appear here for
        30 days.
      </div>
    );
  }

  return (
    <TrashDialogProvider>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-end">
          <EmptyTrashTrigger />
        </div>
        <TrashTable rows={rows} />
      </div>
      <TrashDialogs rows={rows} />
    </TrashDialogProvider>
  );
}
