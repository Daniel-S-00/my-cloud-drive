'use server';

import {
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files } from '@/server/db/schema';
import { r2, R2_BUCKET } from '@/server/storage/r2';

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

export type PermanentDeleteFileInput = {
  fileId: string;
};

export type PermanentDeleteFileOutput = {
  fileId: string;
  purgedFromR2: boolean;
};

export type EmptyTrashOutput = {
  deletedCount: number;
  r2DeletedCount: number;
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

  revalidatePath('/');
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

async function deleteFromR2(storageKey: string): Promise<boolean> {
  try {
    await r2.send(
      new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: storageKey }),
    );
    return true;
  } catch (err) {
    // R2 returns 404 for objects that don't exist; treat that as success
    // (idempotent) but surface anything else.
    const name = err instanceof Error ? err.name : '';
    const code = (err as { $metadata?: { httpStatusCode?: number } })
      ?.$metadata?.httpStatusCode;
    if (name === 'NoSuchKey' || name === 'NotFound' || code === 404) {
      return false;
    }
    throw err;
  }
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
  revalidatePath('/');

  return {
    fileId: updated.id,
    restoredAt: now.toISOString(),
  };
}

export async function permanentDeleteFile(
  input: PermanentDeleteFileInput,
): Promise<PermanentDeleteFileOutput> {
  const row = await loadOwnedFileAnyStatusOrThrow(input.fileId);

  const purged = await deleteFromR2(row.storageKey);

  await db.delete(files).where(eq(files.id, row.id));

  revalidatePath('/trash');
  revalidatePath('/');

  return {
    fileId: row.id,
    purgedFromR2: purged,
  };
}

export async function emptyTrash(): Promise<EmptyTrashOutput> {
  const { id: userId } = await getCurrentUser();

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

  const result = await db
    .delete(files)
    .where(and(eq(files.ownerId, userId), isNotNull(files.deletedAt)))
    .returning({ id: files.id });

  revalidatePath('/trash');
  revalidatePath('/');

  return {
    deletedCount: result.length,
    r2DeletedCount,
  };
}
