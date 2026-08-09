'use server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, inArray, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { generateUniqueFileName } from '@/lib/file-utils';
import { getAncestorFolderIds } from '@/lib/trash-retention';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';
import { deleteFromR2, r2, R2_BUCKET } from '@/server/storage/r2';

const PRESIGN_EXPIRES_SECONDS = 15 * 60;

export type GenerateDownloadUrlInput = {
  fileId: string;
};

export type GenerateDownloadUrlOutput = {
  presignedUrl: string;
  fileName: string;
  expiresAt: string;
};

export type GeneratePreviewUrlInput = {
  fileId: string;
};

export type GeneratePreviewUrlOutput = {
  presignedUrl: string;
  fileName: string;
  mimeType: string;
  expiresAt: string;
};

export type DeleteFileInput = {
  fileId: string;
};

export type DeleteFileOutput = {
  fileId: string;
  deletedAt: string;
};

export type RestoreFileInput = {
  fileId: string;
};

export type RestoreFileOutput = {
  fileId: string;
  restoredAt: string;
};

export type RestoreFileWithParentsOutput = {
  fileId: string;
  restoredAt: string;
  restoredFolderIds: string[];
};

export type PermanentDeleteFileInput = {
  fileId: string;
};

export type PermanentDeleteFileOutput = {
  fileId: string;
  purgedFromR2: boolean;
};

export type EmptyTrashOutput = {
  deletedCount: number;
  deletedFolderCount: number;
  r2DeletedCount: number;
};

export type MoveFileInput = {
  fileId: string;
  // The destination folder. `null` moves the file to the root of
  // the drive (My Drive).
  targetFolderId: string | null;
};

export type MoveFileOutput = {
  fileId: string;
  newFolderId: string | null;
  // The name stored on the file after the move. Equal to the file's
  // previous name unless a collision in the destination folder
  // triggered an auto-rename.
  newName: string;
  // True when the file was renamed because of a name conflict in
  // the destination folder.
  wasRenamed: boolean;
};

async function loadOwnedFileOrThrow(fileId: string) {
  const { id: userId } = await getCurrentUser();

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const [row] = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      storageKey: files.storageKey,
      name: files.name,
      mimeType: files.mimeType,
      uploadStatus: files.uploadStatus,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
      ),
    )
    .limit(1);

  if (!row) {
    throw new Error(
      'File not found, not owned by the current user, or already deleted',
    );
  }

  return row;
}

function signExpiresAt(): string {
  return new Date(Date.now() + PRESIGN_EXPIRES_SECONDS * 1000).toISOString();
}

export async function generateDownloadUrl(
  input: GenerateDownloadUrlInput,
): Promise<GenerateDownloadUrlOutput> {
  const row = await loadOwnedFileOrThrow(input.fileId);

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: row.storageKey,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(
      row.name,
    )}"`,
  });

  const presignedUrl = await getSignedUrl(r2, command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });

  return {
    presignedUrl,
    fileName: row.name,
    expiresAt: signExpiresAt(),
  };
}

export async function generatePreviewUrl(
  input: GeneratePreviewUrlInput,
): Promise<GeneratePreviewUrlOutput> {
  const row = await loadOwnedFileOrThrow(input.fileId);

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: row.storageKey,
    ResponseContentDisposition: 'inline',
  });

  const presignedUrl = await getSignedUrl(r2, command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });

  return {
    presignedUrl,
    fileName: row.name,
    mimeType: row.mimeType,
    expiresAt: signExpiresAt(),
  };
}

export async function deleteFile(
  input: DeleteFileInput,
): Promise<DeleteFileOutput> {
  const { id: userId } = await getCurrentUser();

  if (!input.fileId) {
    throw new Error('fileId is required');
  }

  const [updated] = await db
    .update(files)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(files.id, input.fileId),
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id, deletedAt: files.deletedAt });

  if (!updated || !updated.deletedAt) {
    throw new Error(
      'File not found, not owned by the current user, or already deleted',
    );
  }

  revalidatePath('/drive');
  revalidatePath('/trash');

  return {
    fileId: updated.id,
    deletedAt: updated.deletedAt.toISOString(),
  };
}

async function loadOwnedTrashedFileOrThrow(fileId: string) {
  const { id: userId } = await getCurrentUser();

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const [row] = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      folderId: files.folderId,
      storageKey: files.storageKey,
      name: files.name,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, userId),
        isNotNull(files.deletedAt),
      ),
    )
    .limit(1);

  if (!row || !row.deletedAt) {
    throw new Error(
      'File not found, not owned by the current user, or not in trash',
    );
  }

  return row;
}

async function loadOwnedFileAnyStatusOrThrow(fileId: string) {
  const { id: userId } = await getCurrentUser();

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const [row] = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      storageKey: files.storageKey,
      name: files.name,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(and(eq(files.id, fileId), eq(files.ownerId, userId)))
    .limit(1);

  if (!row) {
    throw new Error('File not found or not owned by the current user');
  }

  return row;
}

export async function restoreFile(
  input: RestoreFileInput,
): Promise<RestoreFileOutput> {
  const row = await loadOwnedTrashedFileOrThrow(input.fileId);

  const now = new Date();
  const [updated] = await db
    .update(files)
    .set({ deletedAt: null, updatedAt: now })
    .where(
      and(
        eq(files.id, row.id),
        eq(files.ownerId, row.ownerId),
        isNotNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id });

  if (!updated) {
    throw new Error('Failed to restore file');
  }

  revalidatePath('/trash');
  revalidatePath('/drive');

  return {
    fileId: updated.id,
    restoredAt: now.toISOString(),
  };
}

/**
 * Restore a soft-deleted file and any soft-deleted ancestor folders
 * in the same call. When `deleteFolder` cascades a soft-delete into
 * every file in the subtree, restoring just the file leaves it
 * orphaned (its `folder_id` points at a trashed folder). This action
 * walks the parent chain and unsets `deleted_at` on the file's
 * immediate parent AND every trashed ancestor so the file becomes
 * visible again.
 *
 * Live ancestors (those with `deleted_at IS NULL`) are NOT touched —
 * the walk stops at the first live ancestor.
 *
 * Test scenario:
 *   User is at /trash?folder=A (A is soft-deleted).
 *   User clicks "Restore" on file B, where B.folder_id = A.
 *   Expected: both B and A have deleted_at = NULL after the call.
 *   Before this fix, only B was restored — A was silently skipped
 *   because getAncestorFolderIds() excludes the input folder itself,
 *   so the immediate parent was never included in the restore set.
 */
export async function restoreFileWithParents(
  input: RestoreFileInput,
): Promise<RestoreFileWithParentsOutput> {
  const row = await loadOwnedTrashedFileOrThrow(input.fileId);
  const { id: userId } = await getCurrentUser();
  const now = new Date();

  let restoredFolderIds: string[] = [];
  if (row.folderId !== null) {
    // Build the candidate set of folders to restore: the file's
    // immediate parent first, then every ancestor of that parent.
    // getAncestorFolderIds() excludes the input folder itself, so we
    // must add row.folderId explicitly — otherwise a file restored
    // from directly inside a trashed folder would leave that folder
    // trashed and the file would remain invisible in the UI.
    const candidateFolderIds: string[] = [row.folderId];
    const ancestorIds = await getAncestorFolderIds(db, row.folderId);
    for (const id of ancestorIds) {
      candidateFolderIds.push(id);
    }

    // Only restore the candidates that are actually soft-deleted.
    // Live ancestors are not touched.
    const trashedFolders = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.ownerId, userId),
          inArray(folders.id, candidateFolderIds),
          isNotNull(folders.deletedAt),
        ),
      );

    if (trashedFolders.length > 0) {
      const ids = trashedFolders.map((f) => f.id);
      await db
        .update(folders)
        .set({ deletedAt: null, updatedAt: now })
        .where(
          and(
            eq(folders.ownerId, userId),
            inArray(folders.id, ids),
            isNotNull(folders.deletedAt),
          ),
        );
      restoredFolderIds = ids;
    }
  }

  const [updated] = await db
    .update(files)
    .set({ deletedAt: null, updatedAt: now })
    .where(
      and(
        eq(files.id, row.id),
        eq(files.ownerId, row.ownerId),
        isNotNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id });

  if (!updated) {
    throw new Error('Failed to restore file');
  }

  revalidatePath('/trash');
  revalidatePath('/drive');

  return {
    fileId: updated.id,
    restoredAt: now.toISOString(),
    restoredFolderIds,
  };
}

export async function permanentDeleteFile(
  input: PermanentDeleteFileInput,
): Promise<PermanentDeleteFileOutput> {
  const row = await loadOwnedFileAnyStatusOrThrow(input.fileId);

  const purged = await deleteFromR2(row.storageKey);

  await db.delete(files).where(eq(files.id, row.id));

  revalidatePath('/trash');
  revalidatePath('/drive');

  return {
    fileId: row.id,
    purgedFromR2: purged,
  };
}

export async function emptyTrash(): Promise<EmptyTrashOutput> {
  const { id: userId } = await getCurrentUser();

  // Collect every soft-deleted file (including files inside trashed
  // folders — deleteFolder cascades the soft-delete into the whole
  // subtree) so we can purge their R2 objects and DB rows.
  const trashed = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(
      and(eq(files.ownerId, userId), isNotNull(files.deletedAt)),
    );

  let r2DeletedCount = 0;
  for (const row of trashed) {
    const purged = await deleteFromR2(row.storageKey);
    if (purged) r2DeletedCount += 1;
  }

  const fileResult = await db
    .delete(files)
    .where(and(eq(files.ownerId, userId), isNotNull(files.deletedAt)))
    .returning({ id: files.id });

  // Hard-delete every soft-deleted folder. All files that referenced
  // these folders were just deleted above, so the only remaining FK
  // is the self-referential `parent_id`. We delete deepest-first
  // (leaves before roots) so ON DELETE RESTRICT never fires.
  const trashedFolderRows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE depths(id, depth) AS (
      SELECT id, 0 FROM ${folders}
        WHERE owner_id = ${userId}::uuid AND deleted_at IS NOT NULL
          AND (
            parent_id IS NULL
            OR parent_id NOT IN (
              SELECT id FROM ${folders}
                WHERE owner_id = ${userId}::uuid
                  AND deleted_at IS NOT NULL
            )
          )
      UNION ALL
      SELECT f.id, d.depth + 1 FROM ${folders} f
        JOIN depths d ON f.parent_id = d.id
        WHERE f.owner_id = ${userId}::uuid AND f.deleted_at IS NOT NULL
    )
    SELECT id::text AS id FROM depths ORDER BY depth DESC, id ASC
  `);

  let deletedFolderCount = 0;
  for (const row of trashedFolderRows) {
    await db.delete(folders).where(eq(folders.id, row.id));
    deletedFolderCount += 1;
  }

  revalidatePath('/trash');
  revalidatePath('/drive');

  return {
    deletedCount: fileResult.length,
    deletedFolderCount,
    r2DeletedCount,
  };
}

/**
 * Move a file to a different folder (or to the root of the drive
 * when `targetFolderId` is `null`). The file's bytes in R2 are NOT
 * touched — only its `folder_id` (and possibly `name`) changes. If a
 * file with the same name already lives in the destination, the
 * moved file is auto-renamed to "name (1).ext" (and "(2)", etc.)
 * to satisfy the `files_unique_name_per_folder` partial index.
 */
export async function moveFile(
  input: MoveFileInput,
): Promise<MoveFileOutput> {
  const { fileId, targetFolderId } = input;

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const { id: userId } = await getCurrentUser();

  // Load the file (live, owned by the caller). We need its current
  // folder + name for the move/rename decision.
  const [file] = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      name: files.name,
      folderId: files.folderId,
      deletedAt: files.deletedAt,
    })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
      ),
    )
    .limit(1);

  if (!file) {
    throw new Error(
      'File not found, not owned by the current user, or in trash',
    );
  }

  // Dropping into the same folder is a no-op (preserves the name).
  if (targetFolderId === file.folderId) {
    return {
      fileId: file.id,
      newFolderId: file.folderId,
      newName: file.name,
      wasRenamed: false,
    };
  }

  // Verify the destination folder exists, is owned by the caller,
  // and is not soft-deleted.
  if (targetFolderId !== null) {
    const [target] = await db
      .select({ id: folders.id })
      .from(folders)
      .where(
        and(
          eq(folders.id, targetFolderId),
          eq(folders.ownerId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);
    if (!target) {
      throw new Error('Destination folder not found');
    }
  }

  // Resolve a non-colliding name in the destination folder.
  const newName = await generateUniqueFileName(
    db,
    file.name,
    targetFolderId,
    userId,
  );
  const wasRenamed = newName !== file.name;

  await db
    .update(files)
    .set({
      folderId: targetFolderId,
      name: newName,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileId));

  // Revalidate the source folder (so the file disappears there) and
  // the destination folder (so the file appears there, possibly
  // under a new name). Always revalidate `/` to refresh any other
  // listing that might be mounted.
  revalidatePath('/drive');
  if (file.folderId) {
    revalidatePath(`/drive?folder=${file.folderId}`);
  }
  if (targetFolderId) {
    revalidatePath(`/drive?folder=${targetFolderId}`);
  }

  return {
    fileId: file.id,
    newFolderId: targetFolderId,
    newName,
    wasRenamed,
  };
}

export type RenameFileInput = {
  fileId: string;
  name: string;
};

export type RenameFileOutput = {
  fileId: string;
  name: string;
};

const FILE_NAME_MAX = 255;

function trimAndValidateFileName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new Error('File name cannot be empty');
  }
  if (trimmed.length > FILE_NAME_MAX) {
    throw new Error(`File name cannot exceed ${FILE_NAME_MAX} characters`);
  }
  if (trimmed.includes('/') || trimmed.includes('\\') || trimmed.includes('\0')) {
    throw new Error('File name cannot contain /, \\, or null characters');
  }
  return trimmed;
}

/**
 * Rename a live file owned by the current user. The new name must not
 * collide (case-insensitively) with another live file in the same
 * folder — duplicates are rejected with a clear message instead of
 * auto-renaming, since the user explicitly chose the name.
 */
export async function renameFile(
  input: RenameFileInput,
): Promise<RenameFileOutput> {
  const { fileId, name } = input;

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const { id: userId } = await getCurrentUser();
  const trimmed = trimAndValidateFileName(name);

  const [file] = await db
    .select({ id: files.id, folderId: files.folderId, name: files.name })
    .from(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
      ),
    )
    .limit(1);

  if (!file) {
    throw new Error('File not found, not owned by the current user, or in trash');
  }

  if (file.name === trimmed) {
    return { fileId: file.id, name: trimmed };
  }

  // Reject a case-insensitive collision in the same folder (matches
  // the files_unique_name_per_folder partial index), excluding self.
  const [duplicate] = await db
    .select({ id: files.id })
    .from(files)
    .where(
      and(
        eq(files.ownerId, userId),
        file.folderId === null
          ? isNull(files.folderId)
          : eq(files.folderId, file.folderId),
        sql`lower(${files.name}) = lower(${trimmed})`,
        isNull(files.deletedAt),
        ne(files.id, file.id),
      ),
    )
    .limit(1);

  if (duplicate) {
    throw new Error('A file with this name already exists in this folder');
  }

  await db
    .update(files)
    .set({ name: trimmed, updatedAt: new Date() })
    .where(eq(files.id, fileId));

  revalidatePath('/drive');
  if (file.folderId) {
    revalidatePath(`/drive?folder=${file.folderId}`);
  }

  return { fileId: file.id, name: trimmed };
}
