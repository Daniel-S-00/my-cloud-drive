import { and, eq, inArray, isNull, lt } from 'drizzle-orm';
import * as Sentry from '@sentry/nextjs';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { files } from '@/server/db/schema';
import { deleteFromR2 } from '@/server/storage/r2';

// A pending upload row is created by generateUploadUrl when the client
// asks for a presigned PUT URL. If the browser dies mid-upload, the tab
// closes, or the network drops after the URL is issued but before
// confirmUpload runs, the row stays 'pending' at sizeBytes 0 forever.
// The presigned URL expires after PRESIGN_EXPIRES_SECONDS (15 min), so
// a pending/failed row older than this window can never complete.
//
// Delete those rows and, defensively, any R2 object that may have
// landed anyway (a PUT can succeed even when the client never reaches
// confirmUpload — leaving an orphaned object with no completed row).
const STALE_AGE_MINUTES = 20;
const STALE_TYPES = ['pending', 'failed'] as const;

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

  const cutoff = new Date(Date.now() - STALE_AGE_MINUTES * 60 * 1000);

  const stale = await db
    .select({
      id: files.id,
      storageKey: files.storageKey,
    })
    .from(files)
    .where(
      and(
        inArray(files.uploadStatus, [...STALE_TYPES]),
        isNull(files.deletedAt),
        lt(files.createdAt, cutoff),
      ),
    )
    .limit(50);

  const results: string[] = [];
  let deleted = 0;

  for (const row of stale) {
    try {
      // Purge any orphaned R2 object first (idempotent: returns false
      // on a 404), then remove the row. Order matters — if the object
      // delete throws, we keep the row so the object never becomes an
      // untracked leak; a future run retries both.
      await deleteFromR2(row.storageKey);
      await db.delete(files).where(eq(files.id, row.id));
      deleted++;
      results.push(`Deleted stale upload ${row.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to clean up stale upload ${row.id}:`, msg);
      Sentry.captureException(err instanceof Error ? err : new Error(msg));
      results.push(`FAILED upload ${row.id}: ${msg}`);
    }
  }

  return NextResponse.json({ deleted, results });
}
