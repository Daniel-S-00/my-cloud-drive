'use server';

import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { generateUniqueFolderName } from '@/lib/file-utils';
import {
  getAncestorFolderIds,
  getDescendantFileIds,
  getDescendantFolderIds,
} from '@/lib/trash-retention';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';
import { deleteFromR2 } from '@/server/storage/r2';

const MAX_NAME_LENGTH = 255;

export type CreateFolderInput = {
  name: string;
  parentFolderId: string | null;
};

export type CreateFolderOutput = {
  folder: {
    id: string;
    name: string;
    parentId: string | null;
    createdAt: string;
  };
};

export type DeleteFolderInput = {
  folderId: string;
};

export type DeleteFolderOutput = {
  folderId: string;
  deletedAt: string;
  filesDeleted: number;
  subfoldersDeleted: number;
};

export type RestoreFolderInput = {
  folderId: string;
};

export type RestoreFolderOutput = {
  folderId: string;
  restoredFolderCount: number;
  restoredFileCount: number;
};

export type PermanentDeleteFolderInput = {
  folderId: string;
};

export type PermanentDeleteFolderOutput = {
  folderId: string;
  deletedFileCount: number;
  deletedFolderCount: number;
  r2DeletedCount: number;
};

export type MoveFolderInput = {
  folderId: string;
  // The destination parent. `null` moves the folder to the root of
  // the drive (My Drive).
  targetParentId: string | null;
};

export type MoveFolderOutput = {
  folderId: string;
  newParentId: string | null;
  // The folder's name after the move. Equal to its previous name
  // unless a collision in the destination triggered an auto-rename.
  newName: string;
  // True when the folder was renamed because of a name conflict in
  // the destination.
  wasRenamed: boolean;
};

export type FolderBreadcrumb = {
  id: string;
  name: string;
};

export type GetFolderBreadcrumbsOutput = {
  path: FolderBreadcrumb[];
};

async function loadOwnedFolderOrThrow(folderId: string) {
  const { id: userId } = await getCurrentUser();
  if (!folderId) {
    throw new Error('folderId is required');
  }
  const [row] = await db
    .select({
      id: folders.id,
      parentId: folders.parentId,
      ownerId: folders.ownerId,
      name: folders.name,
      deletedAt: folders.deletedAt,
    })
    .from(folders)
    .where(and(eq(folders.id, folderId), eq(folders.ownerId, userId)))
    .limit(1);
  if (!row) {
    throw new Error('Folder not found or not owned by the current user');
  }
  return row;
}

async function loadOwnedTrashedFolderOrThrow(folderId: string) {
  const { id: userId } = await getCurrentUser();
  if (!folderId) {
    throw new Error('folderId is required');
  }
  const [row] = await db
    .select({
      id: folders.id,
      parentId: folders.parentId,
      ownerId: folders.ownerId,
      name: folders.name,
      deletedAt: folders.deletedAt,
    })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.ownerId, userId),
        isNotNull(folders.deletedAt),
      ),
    )
    .limit(1);
  if (!row || !row.deletedAt) {
    throw new Error(
      'Folder not found, not owned by the current user, or not in trash',
    );
  }
  return row;
}

export async function createFolder(
  input: CreateFolderInput,
): Promise<CreateFolderOutput> {
  const { name, parentFolderId } = input;
  const { id: userId } = await getCurrentUser();

  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('Folder name cannot be empty');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new Error(
      `Folder name cannot exceed ${MAX_NAME_LENGTH} characters`,
    );
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new Error('Folder name cannot contain /, \\, or null characters');
  }

  if (parentFolderId !== null) {
    const parent = await loadOwnedFolderOrThrow(parentFolderId);
    if (parent.deletedAt !== null) {
      throw new Error('Parent folder has been deleted');
    }
  }

  try {
    const [inserted] = await db
      .insert(folders)
      .values({
        ownerId: userId,
        parentId: parentFolderId,
        name: trimmed,
      })
      .returning({
        id: folders.id,
        name: folders.name,
        parentId: folders.parentId,
        createdAt: folders.createdAt,
      });

    if (!inserted || !inserted.createdAt) {
      throw new Error('Failed to create folder');
    }

    revalidatePath('/drive');
    if (parentFolderId) {
      revalidatePath(`/drive?folder=${parentFolderId}`);
    }

    return {
      folder: {
        id: inserted.id,
        name: inserted.name,
        parentId: inserted.parentId,
        createdAt: inserted.createdAt.toISOString(),
      },
    };
  } catch (err) {
    if (
      err instanceof Error &&
      /folders_unique_name_per_parent/i.test(err.message)
    ) {
      throw new Error(
        'A folder with this name already exists in this location',
      );
    }
    throw err;
  }
}

export async function deleteFolder(
  input: DeleteFolderInput,
): Promise<DeleteFolderOutput> {
  const root = await loadOwnedFolderOrThrow(input.folderId);
  const { id: userId } = await getCurrentUser();

  // Recursive CTE: collect every descendant folder id for the user.
  // Postgres recursive CTE syntax:
  //   WITH RECURSIVE descendants(id) AS (
  //     SELECT id FROM folders WHERE id = $1 AND owner_id = $2
  //     UNION ALL
  //     SELECT f.id FROM folders f
  //     JOIN descendants d ON f.parent_id = d.id
  //     WHERE f.owner_id = $2
  //   )
  const descendantsRows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM ${folders}
        WHERE id = ${root.id}::uuid AND owner_id = ${userId}::uuid
      UNION ALL
      SELECT f.id FROM ${folders} f
        JOIN descendants d ON f.parent_id = d.id
        WHERE f.owner_id = ${userId}::uuid
    )
    SELECT id::text AS id FROM descendants
  `);
  const allFolderIds: string[] = descendantsRows.map((r: { id: string }) => r.id);

  if (allFolderIds.length === 0) {
    throw new Error('Folder not found');
  }

  // Soft-delete all files in the subtree.
  const now = new Date();
  const arrayLiteral = sql.raw(
    `ARRAY[${allFolderIds.map((id: string) => `'${id}'::uuid`).join(',')}]`,
  );
  const filesResult = await db
    .update(files)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(files.ownerId, userId),
        sql`${files.folderId}::uuid = ANY(${arrayLiteral})`,
        isNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id });

  // Soft-delete all folders in the subtree (including the root).
  const foldersResult = await db
    .update(folders)
    .set({ deletedAt: now, updatedAt: now })
    .where(
      and(
        eq(folders.ownerId, userId),
        sql`${folders.id}::uuid = ANY(${arrayLiteral})`,
        isNull(folders.deletedAt),
      ),
    )
    .returning({ id: folders.id });

  revalidatePath('/drive');
  revalidatePath('/trash');
  revalidatePath(`/drive?folder=${root.id}`);

  return {
    folderId: root.id,
    deletedAt: now.toISOString(),
    filesDeleted: filesResult.length,
    subfoldersDeleted: Math.max(0, foldersResult.length - 1),
  };
}

export async function getFolderBreadcrumbs(
  input: { folderId: string | null },
): Promise<GetFolderBreadcrumbsOutput> {
  const { id: userId } = await getCurrentUser();
  const path: FolderBreadcrumb[] = [{ id: 'root', name: 'My Drive' }];

  if (input.folderId === null || input.folderId.trim() === '') {
    return { path };
  }

  // Walk up from the current folder to the root using a recursive CTE
  // so we make a single round-trip instead of N.
  const rows = await db.execute<{ id: string; name: string; parent_id: string | null }>(sql`
    WITH RECURSIVE ancestors(id, name, parent_id) AS (
      SELECT id, name, parent_id FROM ${folders}
        WHERE id = ${input.folderId}::uuid
          AND owner_id = ${userId}::uuid
          AND deleted_at IS NULL
      UNION ALL
      SELECT f.id, f.name, f.parent_id FROM ${folders} f
        JOIN ancestors a ON f.id = a.parent_id
        WHERE f.owner_id = ${userId}::uuid
    )
    SELECT id::text AS id, name, parent_id::text AS parent_id
      FROM ancestors
  `);
  const chain: { id: string; name: string; parent_id: string | null }[] = rows;
  for (let i = chain.length - 1; i >= 0; i--) {
    path.push({ id: chain[i].id, name: chain[i].name });
  }
  return { path };
}

export type GetTrashBreadcrumbsInput = {
  folderId: string;
};

export type GetTrashBreadcrumbsOutput = {
  path: FolderBreadcrumb[];
};

/**
 * Build the breadcrumb path for a trashed folder, from the synthetic
 * "Trash" root down to the current folder. Walks the ancestor chain
 * upward via a recursive CTE and keeps only soft-deleted ancestors —
 * live ancestors are not part of the trash hierarchy, so the path
 * stops at the first non-trashed parent.
 *
 * Throws if the folder is not owned by the current user or is not
 * soft-deleted, which prevents accessing live folders via a trash URL.
 */
export async function getTrashBreadcrumbs(
  input: GetTrashBreadcrumbsInput,
): Promise<GetTrashBreadcrumbsOutput> {
  const { id: userId } = await getCurrentUser();

  if (!input.folderId) {
    throw new Error('folderId is required');
  }

  // Walk up from the current folder through every ancestor (regardless
  // of deleted_at), then filter to only soft-deleted rows. Because
  // deleteFolder cascades the soft-delete into the whole subtree, every
  // ancestor of a trashed folder up to the top-level trashed folder is
  // also trashed — so the path naturally stops at the first live
  // ancestor. depth DESC orders the result top-to-bottom (root-most
  // first, current folder last).
  const rows = await db.execute<{ id: string; name: string }>(sql`
    WITH RECURSIVE ancestors(id, name, parent_id, deleted_at, depth) AS (
      SELECT id, name, parent_id, deleted_at, 0
        FROM ${folders}
        WHERE id = ${input.folderId}::uuid AND owner_id = ${userId}::uuid
      UNION ALL
      SELECT f.id, f.name, f.parent_id, f.deleted_at, a.depth + 1
        FROM ${folders} f
        JOIN ancestors a ON f.id = a.parent_id
        WHERE f.owner_id = ${userId}::uuid
    )
    SELECT id::text AS id, name
      FROM ancestors
      WHERE deleted_at IS NOT NULL
      ORDER BY depth DESC
  `);
  const chain: { id: string; name: string }[] = rows;

  // If the current folder is not trashed (or not owned), it won't
  // appear in the filtered result. This prevents accessing live
  // folders via the trash URL.
  const includesCurrent = chain.some((r) => r.id === input.folderId);
  if (!includesCurrent) {
    throw new Error(
      'Folder not found, not owned by the current user, or not in trash',
    );
  }

  const path: FolderBreadcrumb[] = [
    { id: 'trash-root', name: 'Trash' },
    ...chain.map((r) => ({ id: r.id, name: r.name })),
  ];

  return { path };
}

/**
 * Restore a soft-deleted folder and every descendant folder + file in
 * its subtree in a single bulk operation. Also walks the ancestor
 * chain upward and restores any soft-deleted ancestor folders (same
 * behavior as `restoreFileWithParents`), so restoring a folder never
 * leaves it orphaned inside a still-trashed parent.
 *
 * Live descendants/ancestors (`deleted_at IS NULL`) are not touched.
 */
export async function restoreFolder(
  input: RestoreFolderInput,
): Promise<RestoreFolderOutput> {
  const root = await loadOwnedTrashedFolderOrThrow(input.folderId);
  const { id: userId } = await getCurrentUser();
  const now = new Date();

  // Full subtree of folders (includes root), ordered deepest-first
  // (harmless for UPDATE — order does not matter here).
  const descendantFolderIds = await getDescendantFolderIds(db, root.id);
  const descendantFileIds = await getDescendantFileIds(db, root.id);

  // Restore every trashed folder in the subtree.
  const restoredFolders = descendantFolderIds.length
    ? await db
        .update(folders)
        .set({ deletedAt: null, updatedAt: now })
        .where(
          and(
            eq(folders.ownerId, userId),
            inArray(folders.id, descendantFolderIds),
            isNotNull(folders.deletedAt),
          ),
        )
        .returning({ id: folders.id })
    : [];

  // Restore every trashed file in the subtree.
  const restoredFiles = descendantFileIds.length
    ? await db
        .update(files)
        .set({ deletedAt: null, updatedAt: now })
        .where(
          and(
            eq(files.ownerId, userId),
            inArray(files.id, descendantFileIds),
            isNotNull(files.deletedAt),
          ),
        )
        .returning({ id: files.id })
    : [];

  // Restore the ancestor chain upward (only trashed ancestors). This
  // mirrors `restoreFileWithParents`: live ancestors are not touched,
  // and the walk stops at the first live ancestor.
  let restoredAncestorCount = 0;
  if (root.parentId !== null) {
    const ancestorIds = await getAncestorFolderIds(db, root.id);
    if (ancestorIds.length > 0) {
      const trashedAncestors = await db
        .select({ id: folders.id })
        .from(folders)
        .where(
          and(
            eq(folders.ownerId, userId),
            inArray(folders.id, ancestorIds),
            isNotNull(folders.deletedAt),
          ),
        );
      if (trashedAncestors.length > 0) {
        const ancestorRestore = await db
          .update(folders)
          .set({ deletedAt: null, updatedAt: now })
          .where(
            and(
              eq(folders.ownerId, userId),
              inArray(
                folders.id,
                trashedAncestors.map((f) => f.id),
              ),
              isNotNull(folders.deletedAt),
            ),
          )
          .returning({ id: folders.id });
        restoredAncestorCount = ancestorRestore.length;
      }
    }
  }

  revalidatePath('/trash');
  revalidatePath('/drive');
  revalidatePath(`/drive?folder=${root.id}`);

  return {
    folderId: root.id,
    restoredFolderCount: restoredFolders.length + restoredAncestorCount,
    restoredFileCount: restoredFiles.length,
  };
}

/**
 * Permanently delete a soft-deleted folder and its entire subtree.
 * Descendant file bytes are purged from R2 (idempotently — already-
 * missing objects are ignored), then every descendant file and folder
 * row is hard-deleted from the database. Folders are deleted
 * deepest-first so the self-referential `parent_id` ON DELETE
 * RESTRICT constraint never fires.
 */
export async function permanentDeleteFolder(
  input: PermanentDeleteFolderInput,
): Promise<PermanentDeleteFolderOutput> {
  const root = await loadOwnedTrashedFolderOrThrow(input.folderId);
  const { id: userId } = await getCurrentUser();

  const descendantFolderIds = await getDescendantFolderIds(db, root.id);
  const descendantFileIds = await getDescendantFileIds(db, root.id);

  // Fetch the storage keys for every file in the subtree so we can
  // purge them from R2.
  let r2DeletedCount = 0;
  let deletedFileCount = 0;
  if (descendantFileIds.length > 0) {
    const fileRows = await db
      .select({ id: files.id, storageKey: files.storageKey })
      .from(files)
      .where(
        and(eq(files.ownerId, userId), inArray(files.id, descendantFileIds)),
      );

    for (const row of fileRows) {
      const purged = await deleteFromR2(row.storageKey);
      if (purged) r2DeletedCount += 1;
    }

    const deletedFiles = await db
      .delete(files)
      .where(
        and(eq(files.ownerId, userId), inArray(files.id, descendantFileIds)),
      )
      .returning({ id: files.id });
    deletedFileCount = deletedFiles.length;
  }

  // Hard-delete folders deepest-first (children before parents) to
  // satisfy the self-referential parent_id ON DELETE RESTRICT.
  let deletedFolderCount = 0;
  for (const id of descendantFolderIds) {
    await db.delete(folders).where(eq(folders.id, id));
    deletedFolderCount += 1;
  }

  revalidatePath('/trash');
  revalidatePath('/drive');

  return {
    folderId: root.id,
    deletedFileCount,
    deletedFolderCount,
    r2DeletedCount,
  };
}

/**
 * Move a folder under a new parent (or to the root of the drive
 * when `targetParentId` is `null`). The folder's contents are
 * untouched — only `parent_id` (and possibly `name`) changes.
 *
 * Cycle prevention: a folder cannot be moved into itself or into
 * any of its own descendants. The check uses the recursive
 * `getDescendantFolderIds` helper to collect the full subtree of
 * the folder being moved, then rejects any drop whose target is in
 * that subtree. Trashed folders are ignored by the descendant walk.
 *
 * Name conflicts in the destination are auto-resolved via
 * `generateUniqueFolderName`.
 */
export async function moveFolder(
  input: MoveFolderInput,
): Promise<MoveFolderOutput> {
  const { folderId, targetParentId } = input;

  if (!folderId) {
    throw new Error('folderId is required');
  }

  const { id: userId } = await getCurrentUser();

  // Load the folder being moved (live, owned by the caller).
  const [folder] = await db
    .select({
      id: folders.id,
      ownerId: folders.ownerId,
      parentId: folders.parentId,
      name: folders.name,
      deletedAt: folders.deletedAt,
    })
    .from(folders)
    .where(
      and(
        eq(folders.id, folderId),
        eq(folders.ownerId, userId),
        isNull(folders.deletedAt),
      ),
    )
    .limit(1);

  if (!folder) {
    throw new Error(
      'Folder not found, not owned by the current user, or in trash',
    );
  }

  // Dropping into the same parent is a no-op.
  if (targetParentId === folder.parentId) {
    return {
      folderId: folder.id,
      newParentId: folder.parentId,
      newName: folder.name,
      wasRenamed: false,
    };
  }

  // Cycle prevention: the destination must not be the folder
  // itself or any of its descendants. The helper returns the full
  // subtree INCLUDING the root, so membership of `folderId` in the
  // result covers the self-drop case.
  if (targetParentId !== null) {
    const descendantIds = await getDescendantFolderIds(db, folder.id);
    if (descendantIds.includes(targetParentId)) {
      throw new Error(
        'Cannot move a folder into itself or into one of its descendants',
      );
    }

    // Verify the destination folder exists, is owned by the caller,
    // and is not soft-deleted.
    const [target] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, targetParentId),
          eq(folders.ownerId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);
    if (!target) {
      throw new Error('Destination folder not found');
    }
  }

  // Resolve a non-colliding name in the destination.
  const newName = await generateUniqueFolderName(
    db,
    folder.name,
    targetParentId,
    userId,
  );
  const wasRenamed = newName !== folder.name;

  await db
    .update(folders)
    .set({
      parentId: targetParentId,
      name: newName,
      updatedAt: new Date(),
    })
    .where(eq(folders.id, folderId));

  // Revalidate the source parent, the destination parent, and `/`.
  revalidatePath('/drive');
  if (folder.parentId) {
    revalidatePath(`/drive?folder=${folder.parentId}`);
  }
  if (targetParentId) {
    revalidatePath(`/drive?folder=${targetParentId}`);
  }

  return {
    folderId: folder.id,
    newParentId: targetParentId,
    newName,
    wasRenamed,
  };
}
