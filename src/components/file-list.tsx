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
    // The Browse section renders a shared empty-state when both
    // folders and files are empty (see <FileListEmpty />). When the
    // folder list has rows but the file list is empty, we render
    // nothing here so the user sees only the folder table.
    return null;
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
