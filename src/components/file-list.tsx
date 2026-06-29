import { and, desc, eq, isNull } from 'drizzle-orm';
import { FileListClient, type FileListRow } from '@/components/file-list-client';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, type File } from '@/server/db/schema';

type FileListProps = {
  folderId: string | null;
};

export async function FileList({ folderId }: FileListProps) {
  const { id: userId } = await getCurrentUser();

  const folderCondition =
    folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId);

  const dbRows: File[] = await db
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

  if (dbRows.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center text-sm text-zinc-500">
        {folderId === null
          ? 'No files in your drive yet. Drop one above to get started.'
          : 'No files in this folder yet.'}
      </div>
    );
  }

  const rows: FileListRow[] = dbRows.map((row) => ({
    id: row.id,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    createdAt: row.createdAt
      ? new Date(row.createdAt).toISOString()
      : '',
    uploadStatus: row.uploadStatus,
  }));

  return <FileListClient rows={rows} />;
}
