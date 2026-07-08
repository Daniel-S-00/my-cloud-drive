import { and, eq, isNull } from 'drizzle-orm';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';

type FileListEmptyProps = {
  folderId: string | null;
};

/**
 * Renders the "no folders, no files" empty-state ONLY when both
 * the folder list and the file list would be empty for the current
 * folder. Otherwise it renders nothing, letting the folder/file
 * tables show their own content.
 *
 * The empty state lives inside the Browse section so the user gets
 * a single onboarding hint instead of two stacked dashed panels.
 */
export async function FileListEmpty({ folderId }: FileListEmptyProps) {
  const { id: userId } = await getCurrentUser();
  const folderCondition =
    folderId === null
      ? isNull(folders.parentId)
      : eq(folders.parentId, folderId);

  const [folderCount] = await db
    .select({ n: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.ownerId, userId),
        folderCondition,
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);

  const fileCondition =
    folderId === null ? isNull(files.folderId) : eq(files.folderId, folderId);
  const [fileCount] = await db
    .select({ n: files.id })
    .from(files)
    .where(
      and(
        eq(files.ownerId, userId),
        fileCondition,
        isNull(files.deletedAt),
        // pending/uploading files are still in-flight and shouldn't
        // count as "content" for the empty-state hint
        eq(files.uploadStatus, 'complete'),
      ),
    )
    .limit(1);

  if (folderCount || fileCount) {
    return null;
  }

  return (
    <div className="rounded-md border border-dashed border-border-subtle bg-bg-surface p-6 text-center text-sm text-text-secondary">
      {folderId === null
        ? 'Your drive is empty. Drop a file above or click "New folder" to organize your files.'
        : 'This folder is empty. Drop a file above or click "New folder" to organize.'}
    </div>
  );
}
