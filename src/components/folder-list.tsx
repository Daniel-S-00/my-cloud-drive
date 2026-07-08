import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  FolderDialogs,
  type FolderRowData,
} from '@/components/folder-row';
import { FolderDialogProvider } from '@/contexts/file-dialog-context';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { folders, type Folder } from '@/server/db/schema';
import { FolderListClient } from '@/components/folder-list-client';

type FolderListProps = {
  folderId: string | null;
};

type FolderWithCounts = {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  filesCount: number;
  subfoldersCount: number;
};

async function loadFoldersWithCounts(
  userId: string,
  folderId: string | null,
): Promise<FolderWithCounts[]> {
  const folderCondition =
    folderId === null
      ? isNull(folders.parentId)
      : eq(folders.parentId, folderId);

  const folderRows: Folder[] = await db
    .select()
    .from(folders)
    .where(
      and(
        eq(folders.ownerId, userId),
        folderCondition,
        isNull(folders.deletedAt),
      ),
    )
    .orderBy(asc(sql`lower(${folders.name})`), asc(folders.createdAt));

  if (folderRows.length === 0) return [];

  // One follow-up query that returns per-folder counts in a single
  // round-trip using LEFT JOIN + GROUP BY.
  const folderIds = folderRows.map((f) => f.id);
  const countRows = await db.execute<{
    folder_id: string;
    files_count: string;
    subfolders_count: string;
  }>(sql`
    SELECT
      f.id::text AS folder_id,
      COALESCE(fc.cnt, 0)::int AS files_count,
      COALESCE(sc.cnt, 0)::int AS subfolders_count
    FROM unnest(${sql.raw(
      `ARRAY[${folderIds.map((id) => `'${id}'::uuid`).join(',')}]`,
    )}::uuid[]) AS f(id)
    LEFT JOIN (
      SELECT folder_id::text AS folder_id, COUNT(*)::int AS cnt
        FROM files
        WHERE owner_id = ${userId}::uuid
          AND deleted_at IS NULL
          AND folder_id = ANY(${sql.raw(
            `ARRAY[${folderIds.map((id) => `'${id}'::uuid`).join(',')}]`,
          )}::uuid[])
        GROUP BY folder_id
    ) fc ON fc.folder_id = f.id::text
    LEFT JOIN (
      SELECT parent_id::text AS parent_id, COUNT(*)::int AS cnt
        FROM folders
        WHERE owner_id = ${userId}::uuid
          AND deleted_at IS NULL
          AND parent_id = ANY(${sql.raw(
            `ARRAY[${folderIds.map((id) => `'${id}'::uuid`).join(',')}]`,
          )}::uuid[])
        GROUP BY parent_id
    ) sc ON sc.parent_id = f.id::text
  `);
  const counts = new Map(
    countRows.map((r: {
      folder_id: string;
      files_count: string;
      subfolders_count: string;
    }) => [
      r.folder_id,
      {
        filesCount: Number(r.files_count) || 0,
        subfoldersCount: Number(r.subfolders_count) || 0,
      },
    ]),
  );

  return folderRows.map((f) => ({
    id: f.id,
    name: f.name,
    parentId: f.parentId,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
    ...(counts.get(f.id) ?? { filesCount: 0, subfoldersCount: 0 }),
  }));
}

export async function FolderList({ folderId }: FolderListProps) {
  const { id: userId } = await getCurrentUser();
  const items = await loadFoldersWithCounts(userId, folderId);

  return (
    <FolderDialogProvider>
      <FolderListBody items={items} hasFolders={items.length > 0} />
      <FolderDialogs parentFolderName={items[0]?.name ?? ''} />
    </FolderDialogProvider>
  );
}

function FolderListBody({
  items,
  hasFolders,
}: {
  items: FolderWithCounts[];
  hasFolders: boolean;
}) {
  if (!hasFolders) return null;

  const folderRows: FolderRowData[] = items.map((f) => ({
    id: f.id,
    name: f.name,
    createdAt: f.createdAt.toISOString(),
    updatedAt: f.updatedAt.toISOString(),
    filesCount: f.filesCount,
    subfoldersCount: f.subfoldersCount,
  }));

  return <FolderListClient folders={folderRows} />;
}
