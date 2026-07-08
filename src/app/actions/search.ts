'use server';

import { and, eq, ilike, inArray, isNull, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';

export type SearchResult = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  mimeType?: string;
  sizeBytes?: number;
  parentFolderId: string | null;
  parentFolderName: string | null;
};

const MAX_RESULTS = 20;
const MIN_QUERY_LENGTH = 2;

export async function searchItems(query: string): Promise<SearchResult[]> {
  const { id: userId } = await getCurrentUser();

  const trimmed = query.trim();
  if (trimmed.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const pattern = `%${trimmed}%`;
  const exactPattern = trimmed;
  const startsPattern = `${trimmed}%`;

  const sortExpr = sql`CASE
    WHEN LOWER(name) = LOWER(${exactPattern}) THEN 0
    WHEN LOWER(name) LIKE LOWER(${startsPattern}) THEN 1
    ELSE 2
  END ASC, name ASC`;

  const fileResults = await db
    .select({
      id: files.id,
      name: files.name,
      mimeType: files.mimeType,
      sizeBytes: files.sizeBytes,
      parentFolderId: files.folderId,
    })
    .from(files)
    .where(
      and(
        eq(files.ownerId, userId),
        isNull(files.deletedAt),
        ilike(files.name, pattern),
      ),
    )
    .orderBy(sortExpr)
    .limit(MAX_RESULTS);

  const folderResults = await db
    .select({
      id: folders.id,
      name: folders.name,
      parentFolderId: folders.parentId,
    })
    .from(folders)
    .where(
      and(
        eq(folders.ownerId, userId),
        isNull(folders.deletedAt),
        ilike(folders.name, pattern),
      ),
    )
    .orderBy(sortExpr)
    .limit(MAX_RESULTS);

  const combined: SearchResult[] = [
    ...fileResults.map((f) => ({
      id: f.id,
      name: f.name,
      type: 'file' as const,
      mimeType: f.mimeType,
      sizeBytes: f.sizeBytes,
      parentFolderId: f.parentFolderId,
      parentFolderName: null,
    })),
    ...folderResults.map((f) => ({
      id: f.id,
      name: f.name,
      type: 'folder' as const,
      parentFolderId: f.parentFolderId,
      parentFolderName: null,
    })),
  ];

  // Sort combined by relevance
  combined.sort((a, b) => {
    const aName = a.name.toLowerCase();
    const bName = b.name.toLowerCase();
    const q = trimmed.toLowerCase();

    const aExact = aName === q ? 0 : aName.startsWith(q) ? 1 : 2;
    const bExact = bName === q ? 0 : bName.startsWith(q) ? 1 : 2;

    if (aExact !== bExact) return aExact - bExact;
    return aName.localeCompare(bName);
  });

  const top = combined.slice(0, MAX_RESULTS);

  // Resolve parent folder names in one batch
  const parentIds = [
    ...new Set(
      top
        .map((r) => r.parentFolderId)
        .filter((id): id is string => id !== null),
    ),
  ];

  if (parentIds.length > 0) {
    const parentRows = await db
      .select({ id: folders.id, name: folders.name })
      .from(folders)
      .where(
        and(
          eq(folders.ownerId, userId),
          inArray(folders.id, parentIds),
        ),
      );

    const nameMap = new Map(parentRows.map((r) => [r.id, r.name]));

    for (const result of top) {
      if (result.parentFolderId) {
        result.parentFolderName = nameMap.get(result.parentFolderId) ?? null;
      }
    }
  }

  return top;
}
