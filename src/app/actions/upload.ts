'use server';

import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { MOCK_USER_ID } from '@/server/auth/mock-user';
import { db } from '@/server/db/client';
import { folders, files, users } from '@/server/db/schema';
import { r2, R2_BUCKET } from '@/server/storage/r2';

export type GenerateUploadUrlInput = {
  folderId: string | null;
  fileName: string;
};

export type GenerateUploadUrlOutput = {
  presignedUrl: string;
  storageKey: string;
  fileId: string;
  expiresAt: string;
};

export type ConfirmUploadInput = {
  fileId: string;
  storageKey: string;
  sizeBytes: number;
  mimeType?: string;
};

export type ConfirmUploadOutput = {
  fileId: string;
  uploadStatus: 'complete';
  sizeBytes: number;
};

const PRESIGN_EXPIRES_SECONDS = 15 * 60;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GiB

function extractExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return '';
  }
  const ext = fileName.slice(lastDot + 1).toLowerCase();
  return /^[a-z0-9]{1,16}$/.test(ext) ? ext : '';
}

export async function generateUploadUrl(
  input: GenerateUploadUrlInput,
): Promise<GenerateUploadUrlOutput> {
  const { folderId, fileName } = input;

  if (!fileName) {
    throw new Error('fileName is required');
  }

  if (folderId !== null) {
    const folder = await db
      .select({ id: folders.id, ownerId: folders.ownerId })
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.ownerId, MOCK_USER_ID),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);

    if (folder.length === 0) {
      throw new Error('Folder not found or not owned by the current user');
    }
  }

  const extension = extractExtension(fileName);
  const storageKey = `${MOCK_USER_ID}/${randomUUID()}${extension ? `.${extension}` : ''}`;

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
  });

  const presignedUrl = await getSignedUrl(r2, command, {
    expiresIn: PRESIGN_EXPIRES_SECONDS,
  });

  const expiresAt = new Date(
    Date.now() + PRESIGN_EXPIRES_SECONDS * 1000,
  ).toISOString();

  await db
    .insert(users)
    .values({
      id: MOCK_USER_ID,
      email: 'mock@example.com',
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: users.id });

  const [inserted] = await db
    .insert(files)
    .values({
      folderId,
      ownerId: MOCK_USER_ID,
      name: fileName,
      storageKey,
      mimeType: 'application/octet-stream',
      sizeBytes: 0,
      uploadStatus: 'pending',
    })
    .returning({ id: files.id });

  if (!inserted) {
    throw new Error('Failed to create file record');
  }

  return {
    presignedUrl,
    storageKey,
    fileId: inserted.id,
    expiresAt,
  };
}

export async function confirmUpload(
  input: ConfirmUploadInput,
): Promise<ConfirmUploadOutput> {
  const { fileId, storageKey, sizeBytes, mimeType } = input;

  if (!fileId || !storageKey) {
    throw new Error('fileId and storageKey are required');
  }
  if (sizeBytes < 0 || sizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new Error(
      `sizeBytes must be between 0 and ${MAX_FILE_SIZE_BYTES} (10 GiB)`,
    );
  }

  const [updated] = await db
    .update(files)
    .set({
      uploadStatus: 'complete',
      sizeBytes,
      ...(mimeType ? { mimeType } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, MOCK_USER_ID),
        eq(files.storageKey, storageKey),
        isNull(files.deletedAt),
      ),
    )
    .returning({
      id: files.id,
      sizeBytes: files.sizeBytes,
    });

  if (!updated) {
    throw new Error(
      'File not found, not owned by the current user, or storage key mismatch',
    );
  }

  revalidatePath('/');

  return {
    fileId: updated.id,
    uploadStatus: 'complete',
    sizeBytes: updated.sizeBytes,
  };
}
