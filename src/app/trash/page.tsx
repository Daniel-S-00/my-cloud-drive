import { redirect } from 'next/navigation';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { getTrashBreadcrumbs } from '@/app/actions/folders';
import { LogoutButton } from '@/components/logout-button';
import { TrashBreadcrumbs } from '@/components/trash-breadcrumbs';
import type { TrashFolderRowData } from '@/components/trash-folder-row';
import { TrashFolderNavigator } from '@/components/trash-folder-navigator';
import type { TrashFileRowData } from '@/components/trash-file-row';
import {
  daysRemaining,
  getDescendantFileIds,
  getDescendantFolderIds,
  PURGE_WARNING_DAYS,
  TRASH_RETENTION_DAYS,
} from '@/lib/trash-retention';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders, type File, type Folder } from '@/server/db/schema';

type SearchParams = Promise<{
  folder?: string | string[];
}>;

function pickSingle(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export const dynamic = 'force-dynamic';

async function mapFolderRows(
  folderRecords: Folder[],
  now: number,
): Promise<TrashFolderRowData[]> {
  return Promise.all(
    folderRecords.map(async (f) => {
      const [descendantFolderIds, descendantFileIds] = await Promise.all([
        getDescendantFolderIds(db, f.id),
        getDescendantFileIds(db, f.id),
      ]);
      const remaining = daysRemaining(f.deletedAt, now);
      return {
        id: f.id,
        name: f.name,
        filesCount: descendantFileIds.length,
        subfoldersCount: Math.max(0, descendantFolderIds.length - 1),
        deletedAt: f.deletedAt ? new Date(f.deletedAt).toISOString() : null,
        daysRemaining: remaining,
        purgingSoon: remaining < PURGE_WARNING_DAYS,
      };
    }),
  );
}

function mapFileRows(fileRecords: File[], now: number): TrashFileRowData[] {
  return fileRecords.map((row) => {
    const remaining = daysRemaining(row.deletedAt, now);
    return {
      id: row.id,
      name: row.name,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      deletedAt: row.deletedAt ? new Date(row.deletedAt).toISOString() : null,
      daysRemaining: remaining,
      purgingSoon: remaining < PURGE_WARNING_DAYS,
    };
  });
}

export default async function TrashPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const { id: userId } = await getCurrentUser();
  const params = await searchParams;
  const folderId = pickSingle(params.folder);

  // `force-dynamic` ensures this page is rendered per request, so reading
  // the wall clock here is safe even though React's purity rule flags
  // `Date.now()` inside a render. We compute it once and reuse it for
  // every row.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();

  // ── Inside a trashed folder ──────────────────────────────────────
  if (folderId !== null) {
    // Verify the folder is owned by the current user AND is soft-deleted,
    // and build the breadcrumb path in a single call. If the folder is
    // not trashed, not owned, or doesn't exist, the action throws and we
    // redirect to the root trash view.
    let trashPath: { id: string; name: string }[] | null = null;
    try {
      const result = await getTrashBreadcrumbs({ folderId });
      trashPath = result.path;
    } catch {
      // Folder not trashed / not owned / not found / invalid UUID.
    }
    if (trashPath === null) {
      redirect('/trash');
    }

    const currentFolderName = trashPath[trashPath.length - 1]?.name ?? 'Folder';

    // Query the trashed children of this folder: direct child subfolders
    // and files that live directly inside it. Both must have
    // deleted_at IS NOT NULL (deleteFolder cascades the soft-delete into
    // the whole subtree, so every descendant of a trashed folder is also
    // trashed).
    const [childFolders, childFiles] = await Promise.all([
      db
        .select()
        .from(folders)
        .where(
          and(
            eq(folders.ownerId, userId),
            eq(folders.parentId, folderId),
            isNotNull(folders.deletedAt),
          ),
        )
        .orderBy(desc(folders.deletedAt)),
      db
        .select()
        .from(files)
        .where(
          and(
            eq(files.ownerId, userId),
            eq(files.folderId, folderId),
            isNotNull(files.deletedAt),
          ),
        )
        .orderBy(desc(files.deletedAt)),
    ]);

    const folderRows = await mapFolderRows(childFolders, now);
    const fileRows = mapFileRows(childFiles, now);

    return (
      <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-8 bg-bg-base px-4 py-8 text-text-primary sm:px-6 sm:py-12">
        <header className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
              Trash
            </h1>
            <TrashBreadcrumbs path={trashPath} />
          </div>
          <LogoutButton />
        </header>

        <TrashFolderNavigator
          folderRows={folderRows}
          fileRows={fileRows}
          currentFolderId={folderId}
          currentFolderName={currentFolderName}
        />
      </div>
    );
  }

  // ── Root trash view ──────────────────────────────────────────────
  // Fetch every soft-deleted folder for the user. We filter the
  // "top-level" trashed folders (those whose parent is NOT itself
  // trashed) in memory so we don't show both a trashed folder and its
  // trashed descendants as separate items.
  const allTrashedFolders: Folder[] = await db
    .select()
    .from(folders)
    .where(and(eq(folders.ownerId, userId), isNotNull(folders.deletedAt)))
    .orderBy(desc(folders.deletedAt));

  const trashedFolderIdSet = new Set(allTrashedFolders.map((f) => f.id));
  const topLevelTrashedFolders = allTrashedFolders.filter(
    (f) => f.parentId === null || !trashedFolderIdSet.has(f.parentId),
  );

  const folderRows = await mapFolderRows(topLevelTrashedFolders, now);

  // Fetch every soft-deleted file, then keep only the "orphan" files —
  // files whose parent folder is NOT in the trash. Files that live
  // inside a trashed folder are already represented by that folder's
  // row above, so showing them separately would be redundant.
  const allTrashedFiles: File[] = await db
    .select()
    .from(files)
    .where(and(eq(files.ownerId, userId), isNotNull(files.deletedAt)))
    .orderBy(desc(files.deletedAt));

  const fileRows = mapFileRows(
    allTrashedFiles.filter(
      (row) => row.folderId === null || !trashedFolderIdSet.has(row.folderId),
    ),
    now,
  );

  const totalItems = folderRows.length + fileRows.length;

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-8 bg-bg-base px-4 py-8 text-text-primary sm:px-6 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary">
            Trash
          </h1>
          <p className="text-sm text-text-secondary">
            {totalItems === 0
              ? 'Trash is empty. Folders and files you delete from your drive will appear here for 30 days.'
              : `${folderRows.length} folder${folderRows.length === 1 ? '' : 's'} and ${fileRows.length} file${fileRows.length === 1 ? '' : 's'} in trash. Items are permanently deleted after ${TRASH_RETENTION_DAYS} days.`}
          </p>
        </div>
        <LogoutButton />
      </header>

      <TrashFolderNavigator
        folderRows={folderRows}
        fileRows={fileRows}
        currentFolderId={null}
        currentFolderName={null}
      />
    </div>
  );
}
