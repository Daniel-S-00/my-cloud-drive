'use server';

import { createClient } from '@supabase/supabase-js';
import { and, eq, isNotNull, isNull, lte, not, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { revalidatePath } from 'next/cache';
import { signOut } from '@/server/auth/config';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { files, folders, shares, users } from '@/server/db/schema';
import { sendEmail } from '@/server/email/sender';

const GRACE_PERIOD_DAYS = 30;

// ── Types ───────────────────────────────────────────────────────────────

export type AccountDeletionResult = {
  ok: boolean;
  message: string;
};

export type RecoveryRequestResult = {
  ok: boolean;
  message: string;
};

export type RecoveryResult = {
  ok: boolean;
  message: string;
  redirectUrl?: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────

async function buildRecoveryUrl(token: string): Promise<string> {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:3000');
  return `${base}/recover-account?token=${token}`;
}

/** Send the recovery email. In dev this logs to the console. */
async function sendRecoveryEmail(email: string, recoveryUrl: string) {
  await sendEmail({
    to: email,
    subject: 'Recover your My Cloud Drive account',
    html: `<p>Hi,</p>
<p>You recently requested to delete your My Cloud Drive account. If you changed your mind, click the button below within 30 days to restore it.</p>
<p style="text-align:center"><a href="${recoveryUrl}" style="background:#6366f1;color:white;padding:12px 24px;border-radius:6px;text-decoration:none;display:inline-block">Recover Account</a></p>
<p>If you didn't request this, you can ignore this email.</p>
<p>After 30 days, your data will be permanently deleted.</p>`,
  });
}

// ── Recovery actions ────────────────────────────────────────────────────

async function generateRecoveryLink(userId: string) {
  const token = nanoid(32);

  const [updated] = await db
    .update(users)
    .set({
      recoveryToken: token,
      recoveryTokenExpiresAt: sql`${users.deletionScheduledFor}`,
    })
    .where(eq(users.id, userId))
    .returning({ originalEmail: users.originalEmail });

  if (!updated?.originalEmail) return;

  const url = await buildRecoveryUrl(token);
  await sendRecoveryEmail(updated.originalEmail, url);
}

export async function recoverAccount(
  token: string,
): Promise<RecoveryResult> {
  if (!token) {
    return { ok: false, message: 'Invalid or expired recovery link.' };
  }

  const [match] = await db
    .select({
      id: users.id,
      originalEmail: users.originalEmail,
      recoveryTokenExpiresAt: users.recoveryTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.recoveryToken, token))
    .limit(1);

  if (!match) {
    return { ok: false, message: 'Invalid or expired recovery link.' };
  }

  if (
    !match.recoveryTokenExpiresAt ||
    match.recoveryTokenExpiresAt.getTime() <= Date.now()
  ) {
    return { ok: false, message: 'Invalid or expired recovery link.' };
  }

  if (!match.originalEmail) {
    return { ok: false, message: 'Invalid or expired recovery link.' };
  }

  // Check if the original email is already taken by another active
  // user in the public mirror table.
  const [mirrorConflict] = await db
    .select({ id: users.id })
    .from(users)
    .where(
      and(
        eq(users.email, match.originalEmail),
        isNull(users.deletedAt),
        not(eq(users.id, match.id)),
      ),
    )
    .limit(1);

  if (mirrorConflict) {
    return {
      ok: false,
      message:
        'Your original email is already in use by another account. Please contact support.',
    };
  }

  // Best-effort: try to restore the email in auth.users via
  // Supabase Admin. If the auth user doesn't exist (e.g. test
  // accounts created directly in the DB), skip this step
  // silently — the mirror table restore below is sufficient.
  try {
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (supabaseUrl && serviceRole) {
      const admin = createClient(supabaseUrl, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: authUser, error: lookupErr } =
        await admin.auth.admin.getUserById(match.id);

      if (!lookupErr && authUser) {
        await admin.auth.admin.updateUserById(match.id, {
          email: match.originalEmail,
        });
      }
    }
  } catch {
    // Auth user restore is best-effort. The mirror table is the
    // canonical source for application data.
  }

  // Restore the user row.
  await db
    .update(users)
    .set({
      email: match.originalEmail,
      deletedAt: null,
      deletionScheduledFor: null,
      originalEmail: null,
      recoveryToken: null,
      recoveryTokenExpiresAt: null,
    })
    .where(eq(users.id, match.id));

  // Reactivate files, folders, and shares.
  await db
    .update(files)
    .set({ deletedAt: null })
    .where(
      and(eq(files.ownerId, match.id), isNotNull(files.deletedAt)),
    );

  await db
    .update(folders)
    .set({ deletedAt: null })
    .where(
      and(
        eq(folders.ownerId, match.id),
        isNotNull(folders.deletedAt),
      ),
    );

  await db
    .update(shares)
    .set({ deletedAt: null })
    .where(
      and(
        eq(shares.createdBy, match.id),
        isNotNull(shares.deletedAt),
      ),
    );

  revalidatePath('/');

  return {
    ok: true,
    message: 'Your account has been restored.',
    redirectUrl: '/login?recovered=true',
  };
}

export async function requestRecoveryEmail(
  email: string,
): Promise<RecoveryRequestResult> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return {
      ok: true,
      message:
        'If an account in deletion grace period exists for this email, a recovery link has been sent.',
    };
  }

  const [target] = await db
    .select({
      id: users.id,
      deletionScheduledFor: users.deletionScheduledFor,
    })
    .from(users)
    .where(
      and(
        eq(users.originalEmail, normalized),
        isNotNull(users.deletedAt),
        // Only if still in grace period
        lte(sql`now()`, users.deletionScheduledFor),
      ),
    )
    .limit(1);

  if (target) {
    await generateRecoveryLink(target.id);
  }

  // Always return the same message regardless of whether an account
  // exists, to prevent email enumeration attacks.
  return {
    ok: true,
    message:
      'If an account in deletion grace period exists for this email, a recovery link has been sent.',
  };
}

// ── Deletion ────────────────────────────────────────────────────────────

export async function deleteAccount(): Promise<AccountDeletionResult> {
  const user = await getCurrentUser();

  // Prevent double deletion.
  const [existing] = await db
    .select({ deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  if (existing?.deletedAt) {
    return {
      ok: false,
      message:
        'Your account is already scheduled for deletion. Check your email for the recovery link.',
    };
  }

  const now = new Date();
  const scheduled = new Date(
    now.getTime() + GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000,
  );

  const [currentUser] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const originalEmail = currentUser?.email ?? user.email;
  const deletedEmail = `${originalEmail}.deleted-${now.getTime()}`;

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
      and(eq(files.ownerId, user.id), isNull(files.deletedAt)),
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

  // Delete auth sessions.
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
    // Best-effort.
  }

  // Send the recovery email (logs to console in dev).
  try {
    await generateRecoveryLink(user.id);
  } catch {
    // Best-effort — deletion succeeded even if email fails.
  }

  await signOut({ redirect: false });

  revalidatePath('/');

  return {
    ok: true,
    message:
      'Your account has been deactivated and will be permanently deleted in 30 days. A recovery link has been sent to your email.',
  };
}
