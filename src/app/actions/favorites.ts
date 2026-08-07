'use server';

import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';

export type ToggleFileFavoriteInput = {
  fileId: string;
};

export type ToggleFileFavoriteOutput = {
  fileId: string;
  favorited: boolean;
};

export async function toggleFileFavorite(
  input: ToggleFileFavoriteInput,
): Promise<ToggleFileFavoriteOutput> {
  const { fileId } = input;

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const { id: userId } = await getCurrentUser();

  const [file] = await db
    .select({ id: files.id, folderId: files.folderId, favoriteAt: files.favoriteAt })
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

  const favorited = file.favoriteAt === null;
  await db
    .update(files)
    .set({
      favoriteAt: favorited ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(files.id, fileId));

  revalidatePath('/drive');
  revalidatePath('/favorites');
  if (file.folderId) {
    revalidatePath(`/drive?folder=${file.folderId}`);
  }

  return { fileId: file.id, favorited };
}

export type ToggleFolderFavoriteInput = {
  folderId: string;
};

export type ToggleFolderFavoriteOutput = {
  folderId: string;
  favorited: boolean;
};

export async function toggleFolderFavorite(
  input: ToggleFolderFavoriteInput,
): Promise<ToggleFolderFavoriteOutput> {
  const { folderId } = input;

  if (!folderId) {
    throw new Error('folderId is required');
  }

  const { id: userId } = await getCurrentUser();

  const [folder] = await db
    .select({ id: folders.id, parentId: folders.parentId, favoriteAt: folders.favoriteAt })
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
    throw new Error('Folder not found, not owned by the current user, or in trash');
  }

  const favorited = folder.favoriteAt === null;
  await db
    .update(folders)
    .set({
      favoriteAt: favorited ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(folders.id, folderId));

  revalidatePath('/drive');
  revalidatePath('/favorites');
  if (folder.parentId) {
    revalidatePath(`/drive?folder=${folder.parentId}`);
  }

  return { folderId: folder.id, favorited };
}
