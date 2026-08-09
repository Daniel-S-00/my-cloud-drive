'use server';

import { randomUUID } from 'node:crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { generateUniqueFileName } from '@/lib/file-utils';
import { getCurrentUser } from '@/server/auth/session';
import { getStorageQuota } from '@/server/billing/quota';
import { db } from '@/server/db/client';
import { files, folders, users } from '@/server/db/schema';
import { r2, R2_BUCKET } from '@/server/storage/r2';

export type GenerateUploadUrlInput = {
  folderId: string | null;
  fileName: string;
  sizeBytes: number;
};

export type GenerateUploadUrlOutput = {
  presignedUrl: string;
  storageKey: string;
  fileId: string;
  // The actual name stored in the database. This may differ from
  // `input.fileName` when a file with the same name already exists in
  // the target folder — in that case a unique name like
  // "report (1).pdf" is generated automatically.
  fileName: string;
  // True when the input filename was renamed to avoid a collision.
  wasRenamed: boolean;
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

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
  const { folderId, fileName, sizeBytes } = input;

  if (!fileName) {
    throw new Error('fileName is required');
  }
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    throw new Error('Invalid file size');
  }

  const { id: userId, email: userEmail } = await getCurrentUser();

  // Enforce the plan quota before issuing a presigned URL: block the
  // upload if it would push the user over their storage allowance.
  const quota = await getStorageQuota();
  if (quota && quota.usedBytes + sizeBytes > quota.quotaBytes) {
    const exceed =
      quota.usedBytes + sizeBytes - quota.quotaBytes;
    throw new Error(
      `Not enough storage: this upload needs ${formatBytes(sizeBytes)} and you only have ${formatBytes(
        Math.max(0, quota.quotaBytes - quota.usedBytes),
      )} left (would exceed by ${formatBytes(exceed)}). Upgrade your plan or free up space.`,
    );
  }

  if (folderId !== null) {
    const folder = await db
      .select({ id: folders.id, ownerId: folders.ownerId })
      .from(folders)
      .where(
        and(
          eq(folders.id, folderId),
          eq(folders.ownerId, userId),
          isNull(folders.deletedAt),
        ),
      )
      .limit(1);

    if (folder.length === 0) {
      throw new Error('Folder not found or not owned by the current user');
    }
  }

  const extension = extractExtension(fileName);
  const storageKey = `${userId}/${randomUUID()}${extension ? `.${extension}` : ''}`;

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

  // Mirror the Supabase Auth user into our `users` table on first upload
  // so the `files.owner_id` foreign key is satisfied. ON CONFLICT
  // DO NOTHING keeps this safe to call on every upload.
  await db
    .insert(users)
    .values({
      id: userId,
      email: userEmail ?? `${userId}@unknown.local`,
      createdAt: new Date(),
    })
    .onConflictDoNothing({ target: users.id });

  // Resolve a unique, non-colliding name in the target folder. The
  // storage key (above) is intentionally an opaque UUID-based key
  // and is independent of the user-visible name, so renaming here
  // does not affect the R2 object.
  const uniqueName = await generateUniqueFileName(
    db,
    fileName,
    folderId,
    userId,
  );
  const wasRenamed = uniqueName !== fileName;

  let inserted: { id: string } | undefined;
  try {
    const result = await db
      .insert(files)
      .values({
        folderId,
        ownerId: userId,
        name: uniqueName,
        storageKey,
        mimeType: 'application/octet-stream',
        sizeBytes: 0,
        uploadStatus: 'pending',
      })
      .returning({ id: files.id });
    inserted = result[0];
  } catch (err) {
    // The unique-name helper should have eliminated any collision,
    // so this catch is a defensive guard for races or unexpected
    // violations. Translate the partial-unique-index violation into
    // a friendly message.
    if (isUniqueViolationOn(err, 'files_unique_name_per_folder')) {
      throw new Error(
        'A file with this name already exists in this folder. Please rename it and try again.',
      );
    }
    throw err;
  }

  if (!inserted) {
    throw new Error('Failed to create file record');
  }

  return {
    presignedUrl,
    storageKey,
    fileId: inserted.id,
    fileName: uniqueName,
    wasRenamed,
    expiresAt,
  };
}

function isUniqueViolationOn(
  err: unknown,
  constraintName: string,
): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as {
    code?: string;
    constraint?: string;
    cause?: { code?: string; constraint?: string };
  };
  const code = e.code ?? e.cause?.code;
  const constraint = e.constraint ?? e.cause?.constraint;
  // Postgres unique_violation: SQLSTATE 23505.
  return code === '23505' && constraint === constraintName;
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

  const { id: userId } = await getCurrentUser();

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
        eq(files.ownerId, userId),
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

  revalidatePath('/drive');

  return {
    fileId: updated.id,
    uploadStatus: 'complete',
    sizeBytes: updated.sizeBytes,
  };
}

export type CancelUploadOutput = {
  cancelled: boolean;
};

/**
 * Removes the file record for an upload that failed before completion.
 * The row was inserted with uploadStatus='pending' when the presigned
 * URL was generated; if the client never reaches confirmUpload (R2
 * rejected the PUT, network error, abort), this deletes the orphaned
 * record so it doesn't linger as a 0-byte ghost file.
 *
 * A pending row has no R2 object yet, so there is nothing to purge
 * from storage — only the database row is removed. Only the owner can
 * cancel, and only non-complete rows are eligible.
 */
export async function cancelUpload(
  input: ConfirmUploadInput,
): Promise<CancelUploadOutput> {
  const { fileId, storageKey } = input;

  if (!fileId || !storageKey) {
    throw new Error('fileId and storageKey are required');
  }

  const { id: userId } = await getCurrentUser();

  const deleted = await db
    .delete(files)
    .where(
      and(
        eq(files.id, fileId),
        eq(files.ownerId, userId),
        eq(files.storageKey, storageKey),
        isNull(files.deletedAt),
      ),
    )
    .returning({ id: files.id });

  revalidatePath('/drive');

  return { cancelled: deleted.length > 0 };
}
