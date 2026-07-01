/**
 * Trash retention policy constants and helpers.
 *
 * This module is intentionally free of any "use server" directive so it
 * can be imported from both server actions and Server Components. The
 * "use server" rule forbids exporting non-async values (constants,
 * sync functions) from a server-action file, so this file is the
 * canonical home for the retention policy.
 *
 * `getAncestorFolderIds` is a server-only helper (it takes a Drizzle
 * `db` instance and runs a recursive CTE) and MUST be called from a
 * server action or Server Component. It is exported from here so the
 * action layer and the trash page can share a single source of truth
 * for the ancestor-walk CTE.
 */

import { sql } from 'drizzle-orm';
import type { Database } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';

export const TRASH_RETENTION_DAYS = 30;
export const PURGE_WARNING_DAYS = 7;

export function trashCutoff(now: Date = new Date()): Date {
  return new Date(
    now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000,
  );
}

export function daysRemaining(deletedAt: Date | string | null, now: number = Date.now()): number {
  if (!deletedAt) return TRASH_RETENTION_DAYS;
  const ms =
    typeof deletedAt === 'string' ? new Date(deletedAt).getTime() : deletedAt.getTime();
  return Math.max(0, TRASH_RETENTION_DAYS - Math.floor((now - ms) / (24 * 60 * 60 * 1000)));
}

/**
 * Returns the chain of ancestor folder ids for the given folder, from
 * the immediate parent up to the root. The result is ordered
 * parent → grandparent → ... → root so callers can restore them in
 * that order if needed.
 *
 * Excludes the input folder itself. Includes both live and
 * soft-deleted ancestors — callers that only care about trashed
 * ancestors should filter the result with `isTrashed()` (compare
 * each id against a `SELECT id FROM folders WHERE deleted_at IS NOT
 * NULL` query, or use the convenience helper below).
 */
export async function getAncestorFolderIds(
  db: Database,
  folderId: string,
): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE chain(id, parent_id) AS (
      SELECT id, parent_id FROM ${folders}
        WHERE id = ${folderId}::uuid
      UNION ALL
      SELECT f.id, f.parent_id FROM ${folders} f
        JOIN chain c ON f.id = c.parent_id
    )
    SELECT id::text AS id FROM chain
    WHERE id != ${folderId}::uuid
    ORDER BY id
  `);
  return rows.map((r: { id: string }) => r.id);
}

/**
 * Returns the ids of every folder in the subtree rooted at `folderId`,
 * INCLUDING `folderId` itself. Results are ordered deepest-first
 * (leaves before roots) so callers that hard-delete folders can do so
 * without violating the self-referential `parent_id` ON DELETE
 * RESTRICT constraint — children are always deleted before their
 * parents.
 *
 * Does NOT filter by `owner_id`; callers must verify ownership of the
 * root folder before relying on the result (same convention as
 * `getAncestorFolderIds`).
 */
export async function getDescendantFolderIds(
  db: Database,
  folderId: string,
): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE descendants(id, depth) AS (
      SELECT id, 0 FROM ${folders}
        WHERE id = ${folderId}::uuid
      UNION ALL
      SELECT f.id, d.depth + 1 FROM ${folders} f
        JOIN descendants d ON f.parent_id = d.id
    )
    SELECT id::text AS id FROM descendants
    ORDER BY depth DESC, id ASC
  `);
  return rows.map((r: { id: string }) => r.id);
}

/**
 * Returns the ids of every file whose `folder_id` is `folderId` or any
 * descendant folder of `folderId` (at any depth).
 *
 * Does NOT filter by `owner_id`; callers must verify ownership of the
 * root folder before relying on the result.
 */
export async function getDescendantFileIds(
  db: Database,
  folderId: string,
): Promise<string[]> {
  const rows = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE descendants(id) AS (
      SELECT id FROM ${folders}
        WHERE id = ${folderId}::uuid
      UNION ALL
      SELECT f.id FROM ${folders} f
        JOIN descendants d ON f.parent_id = d.id
    )
    SELECT fi.id::text AS id
    FROM ${files} fi
    WHERE fi.folder_id IN (SELECT id FROM descendants)
  `);
  return rows.map((r: { id: string }) => r.id);
}
