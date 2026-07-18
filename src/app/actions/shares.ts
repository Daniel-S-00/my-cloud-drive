'use server';

import { GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { customAlphabet } from 'nanoid';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, shares } from '@/server/db/schema';
import { r2, R2_BUCKET } from '@/server/storage/r2';

// URL-safe alphabet (no look-alike chars), 12 chars.
const generateToken = customAlphabet(
  '0123456789abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ',
  12,
);

const TOKEN_MAX_DAYS = 365;

function buildShareUrl(token: string): string {
  const override = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  if (override) {
    return `${override}/s/${token}`;
  }
  return `/s/${token}`;
}

// ── Types ───────────────────────────────────────────────────────────────

export type CreateShareInput = {
  fileId: string;
  expiresInDays?: number;
};

export type CreateShareOutput = {
  id: string;
  token: string;
  shareUrl: string;
  expiresAt: string | null;
};

export type RevokeShareInput = {
  shareId: string;
};

export type RevokeShareOutput = {
  id: string;
  revokedAt: string;
};

export type ShareFileMetadata = {
  fileId: string;
  name: string;
  mimeType: string;
  sizeBytes: number | null;
};

export type GetShareByTokenOutput = {
  id: string;
  token: string;
  fileId: string;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
  file: ShareFileMetadata;
};

export type GetUserSharesOutput = {
  id: string;
  token: string;
  shareUrl: string;
  fileId: string;
  fileName: string;
  createdAt: string;
  expiresAt: string | null;
  viewCount: number;
};

export type GetExistingShareOutput = {
  id: string;
  shareUrl: string;
  expiresAt: string | null;
};

export type GetSharedFilePreviewUrlInput = {
  token: string;
};

export type GetSharedFilePreviewUrlOutput = {
  presignedUrl: string;
  fileName: string;
  mimeType: string;
  expiresAt: string;
};

export type GetSharedFileDownloadUrlInput = {
  token: string;
};

export type GetSharedFileDownloadUrlOutput = {
  presignedUrl: string;
  fileName: string;
  expiresAt: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────

async function loadOwnedLiveFileOrThrow(fileId: string) {
  const { id: userId } = await getCurrentUser();

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const [row] = await db
    .select({
      id: files.id,
      ownerId: files.ownerId,
      name: files.name,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
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
      'File not found or not owned by the current user',
    );
  }

  return row;
}

async function generateUniqueToken(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const token = generateToken();
    const [existing] = await db
      .select({ id: shares.id })
      .from(shares)
      .where(eq(shares.token, token))
      .limit(1);
    if (!existing) return token;
  }
  throw new Error(
    'Failed to generate a unique share token. Please try again.',
  );
}

async function loadStorageKeyForFile(fileId: string): Promise<string> {
  const [row] = await db
    .select({ storageKey: files.storageKey })
    .from(files)
    .where(eq(files.id, fileId))
    .limit(1);

  if (!row) {
    throw new Error('File not found');
  }

  return row.storageKey;
}

// ── Owner-only actions ──────────────────────────────────────────────────

export async function createShare(
  input: CreateShareInput,
): Promise<CreateShareOutput> {
  const { id: userId } = await getCurrentUser();

  if (!input.fileId) {
    throw new Error('fileId is required');
  }

  await loadOwnedLiveFileOrThrow(input.fileId);

  let expiresAt: Date | null = null;
  if (input.expiresInDays !== undefined && input.expiresInDays !== null) {
    if (!Number.isFinite(input.expiresInDays) || input.expiresInDays <= 0) {
      throw new Error('expiresInDays must be a positive number');
    }
    if (input.expiresInDays > TOKEN_MAX_DAYS) {
      throw new Error(`expiresInDays must not exceed ${TOKEN_MAX_DAYS}`);
    }
    expiresAt = new Date(
      Date.now() + Math.floor(input.expiresInDays) * 24 * 60 * 60 * 1000,
    );
  }

  const token = await generateUniqueToken();

  const [created] = await db
    .insert(shares)
    .values({
      fileId: input.fileId,
      token,
      createdBy: userId,
      expiresAt,
      viewCount: 0,
    })
    .returning({ id: shares.id, token: shares.token });

  if (!created) {
    throw new Error('Failed to create share');
  }

  revalidatePath('/');

  return {
    id: created.id,
    token: created.token,
    shareUrl: buildShareUrl(created.token),
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
  };
}

export async function revokeShare(
  input: RevokeShareInput,
): Promise<RevokeShareOutput> {
  const { id: userId } = await getCurrentUser();

  if (!input.shareId) {
    throw new Error('shareId is required');
  }

  const [deleted] = await db
    .delete(shares)
    .where(and(eq(shares.id, input.shareId), eq(shares.createdBy, userId)))
    .returning({ id: shares.id });

  if (!deleted) {
    throw new Error('Share not found or not owned by the current user');
  }

  revalidatePath('/');

  return {
    id: deleted.id,
    revokedAt: new Date().toISOString(),
  };
}

export async function getUserShares(): Promise<GetUserSharesOutput[]> {
  const { id: userId } = await getCurrentUser();

  const rows = await db
    .select({
      id: shares.id,
      token: shares.token,
      fileId: shares.fileId,
      fileName: files.name,
      createdAt: shares.createdAt,
      expiresAt: shares.expiresAt,
      viewCount: shares.viewCount,
    })
    .from(shares)
    .innerJoin(files, eq(shares.fileId, files.id))
    .where(
      and(eq(shares.createdBy, userId), isNull(files.deletedAt)),
    )
    .orderBy(desc(shares.createdAt));

  return rows.map((r) => ({
    id: r.id,
    token: r.token,
    shareUrl: buildShareUrl(r.token),
    fileId: r.fileId,
    fileName: r.fileName,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    viewCount: r.viewCount,
  }));
}

export async function getExistingShareForFile(
  fileId: string,
): Promise<GetExistingShareOutput | null> {
  const { id: userId } = await getCurrentUser();

  if (!fileId) {
    throw new Error('fileId is required');
  }

  const [row] = await db
    .select({
      id: shares.id,
      token: shares.token,
      expiresAt: shares.expiresAt,
    })
    .from(shares)
    .innerJoin(files, eq(shares.fileId, files.id))
    .where(
      and(
        eq(shares.fileId, fileId),
        eq(shares.createdBy, userId),
        isNull(files.deletedAt),
      ),
    )
    .limit(1);

  if (!row) return null;

  return {
    id: row.id,
    shareUrl: buildShareUrl(row.token),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
  };
}

// ── Public actions (no auth, gated by share token) ──────────────────────

export async function getShareByToken(
  token: string,
): Promise<GetShareByTokenOutput> {
  if (!token) {
    throw new Error('token is required');
  }

  const [row] = await db
    .select({
      id: shares.id,
      token: shares.token,
      fileId: shares.fileId,
      createdAt: shares.createdAt,
      expiresAt: shares.expiresAt,
      viewCount: shares.viewCount,
      fileId2: files.id,
      fileName: files.name,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      fileDeletedAt: files.deletedAt,
    })
    .from(shares)
    .innerJoin(files, eq(shares.fileId, files.id))
    .where(
      and(eq(shares.token, token), isNull(files.deletedAt)),
    )
    .limit(1);

  if (!row) {
    throw new Error('Share not found');
  }

  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
    throw new Error('Share has expired');
  }

  return {
    id: row.id,
    token: row.token,
    fileId: row.fileId,
    createdAt: row.createdAt.toISOString(),
    expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
    viewCount: row.viewCount,
    file: {
      fileId: row.fileId2,
      name: row.fileName,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
    },
  };
}

export async function incrementViewCount(
  shareId: string,
): Promise<{ id: string; viewCount: number }> {
  if (!shareId) {
    throw new Error('shareId is required');
  }

  const [updated] = await db
    .update(shares)
    .set({ viewCount: sql`${shares.viewCount} + 1` })
    .where(eq(shares.id, shareId))
    .returning({ id: shares.id, viewCount: shares.viewCount });

  if (!updated) {
    throw new Error('Share not found');
  }

  return { id: updated.id, viewCount: updated.viewCount };
}

/**
 * Return a long-lived (7-day) presigned preview URL. The URL is signed so
 * file access stops when the URL expires or the share is revoked — unlike
 * a public CDN URL which bypasses the share check entirely.
 */
export async function getSharedPreviewUrl(
  input: GetSharedFilePreviewUrlInput,
): Promise<GetSharedFilePreviewUrlOutput> {
  const share = await getShareByToken(input.token);
  const storageKey = await loadStorageKeyForFile(share.fileId);

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ResponseContentDisposition: 'inline',
  });

  const presignedUrl = await getSignedUrl(r2, command, {
    expiresIn: 7 * 24 * 60 * 60, // 7 days
  });

  return {
    presignedUrl,
    fileName: share.file.name,
    mimeType: share.file.mimeType,
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Return a short-lived presigned download URL that forces the browser to
 * save the file (Content-Disposition: attachment). This is separate from
 * the preview URL because R2's public CDN ignores Content-Disposition —
 * only presigned URLs can control the download behavior.
 */
export async function getSharedDownloadUrl(
  input: GetSharedFileDownloadUrlInput,
): Promise<GetSharedFileDownloadUrlOutput> {
  const share = await getShareByToken(input.token);
  const storageKey = await loadStorageKeyForFile(share.fileId);

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET,
    Key: storageKey,
    ResponseContentDisposition: `attachment; filename="${encodeURIComponent(share.file.name)}"`,
  });

  const presignedUrl = await getSignedUrl(r2, command, {
    expiresIn: 4 * 60 * 60, // 4 hours
  });

  return {
    presignedUrl,
    fileName: share.file.name,
    expiresAt: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
  };
}
