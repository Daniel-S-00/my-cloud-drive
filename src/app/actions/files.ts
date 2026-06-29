'use server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, isNull } from 'drizzle-orm';
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

  return {
    fileId: updated.id,
    deletedAt: updated.deletedAt.toISOString(),
  };
}
