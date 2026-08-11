'use server';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { folders } from '@/server/db/schema';

const MAX_NAME_LENGTH = 255;

export type EnsureUploadFolderInput = {
  name: string;
  parentFolderId: string | null;
};

export type EnsureUploadFolderOutput = {
  folderId: string;
  /** True when an existing folder was reused (merge upload). */
  existed: boolean;
};

async function loadOwnedFolderOrThrow(folderId: string) {
  const { id: userId } = await getCurrentUser();
  const [row] = await db
    .select({
      id: folders.id,
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

/**
 * Find-or-create a folder by name under the given parent. Used by folder
 * uploads so that dropping a folder whose name already exists in the
 * target merges into the existing folder (Google-Drive-style) instead of
 * erroring. Matching is case-insensitive to align with the
 * `folders_unique_name_per_parent` index.
 */
export async function ensureUploadFolder(
  input: EnsureUploadFolderInput,
): Promise<EnsureUploadFolderOutput> {
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

  const [existing] = await db
    .select({ id: folders.id })
    .from(folders)
    .where(
      and(
        eq(folders.ownerId, userId),
        isNull(folders.deletedAt),
        parentFolderId === null
          ? isNull(folders.parentId)
          : eq(folders.parentId, parentFolderId),
        sql`lower(${folders.name}) = lower(${trimmed})`,
      ),
    )
    .limit(1);

  if (existing) {
    return { folderId: existing.id, existed: true };
  }

  const [inserted] = await db
    .insert(folders)
    .values({
      ownerId: userId,
      parentId: parentFolderId,
      name: trimmed,
    })
    .returning({ id: folders.id });

  if (!inserted) {
    throw new Error('Failed to create folder');
  }

  revalidatePath('/drive');
  if (parentFolderId) {
    revalidatePath(`/drive?folder=${parentFolderId}`);
  }

  return { folderId: inserted.id, existed: false };
}
