import { and, desc, eq, isNull } from 'drizzle-orm';
import { FileListClient, type FileListRow } from '@/components/file-list-client';
import { getExistingShareForFile } from '@/app/actions/shares';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, type File } from '@/server/db/schema';
import { generateLongLivedPreviewUrl } from '@/server/storage/r2';

type FileListProps = {
  folderId: string | null;
};

function isImageMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

function isVideoMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('video/');
}

function isAudioMimeType(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('audio/');
}

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

  // The Browse section renders a shared empty-state when both
  // folders and files are empty (see <FileListEmpty />). When the
  // folder list has rows but the file list is empty, we still render
  // the client (with no rows) and key it on folderId so it remounts
  // and replays the scale-up entrance on every navigation.
  if (dbRows.length === 0) {
    return <FileListClient key={folderId ?? 'root'} rows={[]} />;
  }

  // Pre-sign preview URLs SERVER-SIDE for all viewable media (images
  // and videos). This removes the client-side useEffect that signed a
  // fresh URL on every mount — which changed the URL string on every
  // render and defeated browser caching. The cached helper in r2.ts
  // returns a stable URL per storage key within a server lifetime, so
  // the browser serves these from disk cache on revisit.
  const rows: FileListRow[] = await Promise.all(
    dbRows.map(async (row) => {
      let thumbnailUrl: string | null = null;
      const isViewable =
        (isImageMimeType(row.mimeType) || isVideoMimeType(row.mimeType) || isAudioMimeType(row.mimeType)) &&
        row.uploadStatus === 'complete';
      if (isViewable && row.storageKey) {
        try {
          thumbnailUrl = await generateLongLivedPreviewUrl(row.storageKey);
        } catch {
          // Signing failed (e.g. transient R2 error). The row still
          // renders; the client just won't have a thumbnail/preview.
          thumbnailUrl = null;
        }
      }
      return {
        id: row.id,
        name: row.name,
        mimeType: row.mimeType,
        sizeBytes: row.sizeBytes,
        createdAt: row.createdAt
          ? new Date(row.createdAt).toISOString()
          : '',
        uploadStatus: row.uploadStatus,
        thumbnailUrl,
        existingShare: await getExistingShareForFile(row.id),
      };
    }),
  );

  return <FileListClient key={folderId ?? 'root'} rows={rows} />;
}
