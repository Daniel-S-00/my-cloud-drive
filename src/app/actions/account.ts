'use server';

import { createClient } from '@supabase/supabase-js';
import { and, eq, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { signOut } from '@/server/auth/config';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders, shares, users } from '@/server/db/schema';

const GRACE_PERIOD_DAYS = 30;

export type AccountDeletionResult = {
  ok: boolean;
  message: string;
};

export async function deleteAccount(): Promise<AccountDeletionResult> {
  const user = await getCurrentUser();

  const now = new Date();
  const scheduled = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  // Free the email for re-registration by appending a suffix.
  const [currentUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const originalEmail = currentUser?.email ?? user.email;
  const deletedEmail = `${originalEmail}.deleted-${now.getTime()}`;

  // Mark user as deleted.
  await db
    .update(users)
    .set({
      deletedAt: now,
      deletionScheduledFor: scheduled,
      originalEmail,
      email: deletedEmail,
    })
    .where(eq(users.id, user.id));

  // Soft-delete all files (where not already deleted).
  await db
    .update(files)
    .set({ deletedAt: now })
    .where(
      and(
        eq(files.ownerId, user.id),
        isNull(files.deletedAt),
      ),
    );

  // Soft-delete all folders.
  await db
    .update(folders)
    .set({ deletedAt: now })
    .where(
      and(
        eq(folders.ownerId, user.id),
        isNull(folders.deletedAt),
      ),
    );

  // Soft-delete all shares.
  await db
    .update(shares)
    .set({ deletedAt: now })
    .where(
      and(
        eq(shares.createdBy, user.id),
        isNull(shares.deletedAt),
      ),
    );

  // Delete auth sessions so the user is immediately logged out everywhere.
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRole) {
      const admin = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.auth.admin.signOut(user.id);
    }
  } catch {
    // Best-effort — the NextAuth JWT will still expire naturally.
  }

  await signOut({ redirect: false });

  revalidatePath('/');

  return {
    ok: true,
    message:
      'Your account has been deactivated and will be permanently deleted in 30 days.',
  };
}
