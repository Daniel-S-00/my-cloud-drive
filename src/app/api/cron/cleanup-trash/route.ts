import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { files, folders } from '@/server/db/schema';
import { deleteFromR2 } from '@/server/storage/r2';
import { trashCutoff } from '@/lib/trash-retention';

// Permanently delete trash older than the retention window
// (TRASH_RETENTION_DAYS = 30). Soft-deleted files still occupy R2 bytes
// (and count against the storage quota) until this purge runs, so this
// cron is what actually reclaims storage — without it, trashed files
// are billed forever unless the user manually empties trash.
//
// Mirrors src/app/actions/files.ts emptyTrash: purge each file's R2
// object, delete the file row, then hard-delete soft-deleted folders
// deepest-first so the self-referential parent_id ON DELETE RESTRICT
// never fires. Rows are processed individually so one failure doesn't
// abort the whole batch.

export async function GET(req: NextRequest) {
  return handleCleanup(req);
}

export async function POST(req: NextRequest) {
  return handleCleanup(req);
}

async function handleCleanup(req: NextRequest) {
  const header = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!header || header !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const cutoff = trashCutoff();
  const results: string[] = [];
  let deletedFiles = 0;
  let deletedFolders = 0;

  // Files soft-deleted before the cutoff: purge R2 object then drop the
  // row (order matters — keep the row if the R2 purge throws so the
  // object is never an untracked leak; a future run retries).
  const expired = await db
    .select({ id: files.id, storageKey: files.storageKey })
    .from(files)
    .where(and(isNotNull(files.deletedAt), lt(files.deletedAt, cutoff)))
    .limit(100);

  for (const row of expired) {
    try {
      await deleteFromR2(row.storageKey);
      await db.delete(files).where(eq(files.id, row.id));
      deletedFiles++;
      results.push(`Purged file ${row.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to purge file ${row.id}:`, msg);
      results.push(`FAILED file ${row.id}: ${msg}`);
    }
  }

  // Folders soft-deleted before the cutoff. All files inside them were
  // purged above; delete deepest-first so ON DELETE RESTRICT on
  // parent_id never fires (same approach as emptyTrash).
  const expiredFolders = await db.execute<{ id: string }>(sql`
    WITH RECURSIVE depths(id, depth) AS (
      SELECT id, 0 FROM ${folders}
        WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}::timestamp
          AND (
            parent_id IS NULL
            OR parent_id NOT IN (
              SELECT id FROM ${folders}
                WHERE deleted_at IS NOT NULL AND deleted_at < ${cutoff}::timestamp
            )
          )
      UNION ALL
      SELECT f.id, d.depth + 1 FROM ${folders} f
        JOIN depths d ON f.parent_id = d.id
        WHERE f.deleted_at IS NOT NULL AND f.deleted_at < ${cutoff}::timestamp
    )
    SELECT id::text AS id FROM depths ORDER BY depth DESC, id ASC
  `);

  for (const row of expiredFolders) {
    try {
      await db.delete(folders).where(eq(folders.id, row.id));
      deletedFolders++;
      results.push(`Purged folder ${row.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to purge folder ${row.id}:`, msg);
      results.push(`FAILED folder ${row.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    deletedFiles,
    deletedFolders,
    results,
  });
}
