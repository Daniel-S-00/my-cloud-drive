import { and, desc, eq, isNull } from 'drizzle-orm';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, type File } from '@/server/db/schema';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDate(value: Date | string | null): string {
  if (!value) return '—';
  const d = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString();
}

type FileListProps = {
  folderId: string | null;
};

export async function FileList({ folderId }: FileListProps) {
  const { id: userId } = await getCurrentUser();

  const folderCondition =
    folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId);

  const rows: File[] = await db
    .select()
    .from(files)
    .where(
      and(
        folderCondition,
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
      ),
    )
    .orderBy(desc(files.createdAt));

  if (rows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
        {folderId === null
          ? 'No files in your drive yet. Drop one above to get started.'
          : 'No files in this folder yet.'}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead className="w-32">Size</TableHead>
          <TableHead className="w-40">Uploaded</TableHead>
          <TableHead className="w-32">Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((file) => {
          const inFlight =
            file.uploadStatus === 'pending' || file.uploadStatus === 'uploading';
          return (
            <TableRow key={file.id}>
              <TableCell className="truncate font-medium text-zinc-900">
                {file.name}
              </TableCell>
              <TableCell className="text-zinc-600">
                {formatBytes(file.sizeBytes)}
              </TableCell>
              <TableCell className="text-zinc-600">
                {formatDate(file.createdAt)}
              </TableCell>
              <TableCell>
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
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
