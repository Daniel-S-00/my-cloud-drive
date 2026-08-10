import { createClient } from '@supabase/supabase-js';
import * as Sentry from '@sentry/nextjs';
import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { eq, lte } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { files, folders, shares, users } from '@/server/db/schema';
import { r2, R2_BUCKET } from '@/server/storage/r2';

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

  const now = new Date();

  const deplorable = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(lte(users.deletionScheduledFor, now))
    .limit(5);

  const results: string[] = [];

  for (const user of deplorable) {
    try {
      // 1. Delete all R2 objects under the user's prefix.
      let continuationToken: string | undefined;
      do {
        const list = await r2.send(
          new ListObjectsV2Command({
            Bucket: R2_BUCKET,
            Prefix: `${user.id}/`,
            ContinuationToken: continuationToken,
            MaxKeys: 1000,
          }),
        );

        const objects = list.Contents?.map((o) => ({ Key: o.Key! })) ?? [];
        if (objects.length > 0) {
          await r2.send(
            new DeleteObjectsCommand({
              Bucket: R2_BUCKET,
              Delete: { Objects: objects },
            }),
          );
        }

        continuationToken = list.NextContinuationToken;
      } while (continuationToken);

      // 2. Delete from application tables (files, folders, shares).
      await db.delete(files).where(eq(files.ownerId, user.id));
      await db.delete(folders).where(eq(folders.ownerId, user.id));
      await db.delete(shares).where(eq(shares.createdBy, user.id));

      // 3. Delete from next_auth schema.
      const supabaseUrl = process.env.SUPABASE_URL;
      const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
      if (supabaseUrl && serviceRole) {
        const admin = createClient(supabaseUrl, serviceRole, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        await admin.auth.admin.deleteUser(user.id);
      }

      // 4. Delete the user record.
      await db.delete(users).where(eq(users.id, user.id));

      results.push(`Deleted user ${user.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to delete user ${user.id}:`, msg);
      Sentry.captureException(err instanceof Error ? err : new Error(msg));
      results.push(`FAILED user ${user.id}: ${msg}`);
    }
  }

  return NextResponse.json({ deleted: results.length, results });
}
