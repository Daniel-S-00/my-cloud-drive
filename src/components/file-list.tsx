import { and, desc, eq, isNull } from 'drizzle-orm';
import { FileRow } from '@/components/file-row';
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
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
          <TableHead className="w-44 text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((file) => (
          <FileRow
            key={file.id}
            file={{
              id: file.id,
              name: file.name,
              mimeType: file.mimeType,
              sizeBytes: file.sizeBytes,
              createdAt: file.createdAt
                ? new Date(file.createdAt).toISOString()
                : '',
              uploadStatus: file.uploadStatus,
            }}
          />
        ))}
      </TableBody>
    </Table>
  );
}
