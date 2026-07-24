'use server';

import { encode } from '@auth/core/jwt';
import { eq, and } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { user2fa, users } from '@/server/db/schema';
import { encrypt, decrypt } from '@/server/security/encryption';
import {
  generateSecret,
  generateQrCodeUrl,
  verifyToken,
  generateBackupCodes,
  hashBackupCode,
  verifyBackupCode,
} from '@/server/security/totp';

export type Setup2FAResult = {
  ok: boolean;
  message: string;
  qrCodeImage?: string;
  secret?: string;
};

export type Confirm2FAResult = {
  ok: boolean;
  message: string;
  backupCodes?: string[];
};

export type Verify2FALoginResult = {
  ok: boolean;
  message: string;
  redirectUrl?: string;
};

export type Get2FAStatusResult = {
  enabled: boolean;
  backupCodeCount: number;
};

// ── Setup ───────────────────────────────────────────────────────────────

export async function setup2FA(): Promise<Setup2FAResult> {
  try {
    const user = await getCurrentUser();

    // Validate encryption key before anything else.
    const encKey = process.env.TWO_FA_ENCRYPTION_KEY;
    if (!encKey || encKey.length !== 64) {
      // eslint-disable-next-line no-console
      console.error(
        '[setup2FA] TWO_FA_ENCRYPTION_KEY is missing or not a 64-char hex string.',
      );
      return {
        ok: false,
        message:
          'Server misconfiguration: encryption key not set. Please contact support.',
      };
    }

    const [existing] = await db
      .select({ enabled: user2fa.enabled })
      .from(user2fa)
      .where(eq(user2fa.userId, user.id))
      .limit(1);

    if (existing?.enabled) {
      return {
        ok: false,
        message: 'Two-factor authentication is already enabled.',
      };
    }

    const secret = generateSecret();

    // Generate the QR code BEFORE any DB write so it doesn't depend
    // on encryption succeeding.
    const qrUrl = generateQrCodeUrl(secret, user.email ?? 'user');
    const qrcode = await import('qrcode');
    const qrCodeImage = await qrcode.toDataURL(qrUrl);

    // Now persist the encrypted secret.
    if (existing) {
      await db
        .update(user2fa)
        .set({
          secret: encrypt(secret),
          enabled: false,
          updatedAt: new Date(),
        })
        .where(eq(user2fa.userId, user.id));
    } else {
      await db.insert(user2fa).values({
        userId: user.id,
        secret: encrypt(secret),
        enabled: false,
      });
    }

    return {
      ok: true,
      message: 'Scan the QR code with your authenticator app.',
      qrCodeImage,
      secret,
    };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[setup2FA] Unexpected error:', err);
    return {
      ok: false,
      message:
        'Failed to set up two-factor authentication. Please try again.',
    };
  }
}

// ── Confirm ─────────────────────────────────────────────────────────────

export async function confirm2FA(token: string): Promise<Confirm2FAResult> {
  const user = await getCurrentUser();

  const [row] = await db
    .select({ secret: user2fa.secret, enabled: user2fa.enabled })
    .from(user2fa)
    .where(eq(user2fa.userId, user.id))
    .limit(1);

  if (!row) {
    return { ok: false, message: '2FA setup not started. Please try again.' };
  }
  if (row.enabled) {
    return { ok: false, message: 'Two-factor authentication is already enabled.' };
  }

  const secret = decrypt(row.secret);

  if (!verifyToken(secret, token)) {
    return { ok: false, message: 'Invalid code. Please try again.' };
  }

  const codes = generateBackupCodes(10);
  const hashedCodes = codes.map(hashBackupCode);

  await db
    .update(user2fa)
    .set({
      enabled: true,
      backupCodes: JSON.stringify(hashedCodes),
      updatedAt: new Date(),
    })
    .where(eq(user2fa.userId, user.id));

  revalidatePath('/settings');

  return {
    ok: true,
    message: 'Two-factor authentication is now enabled.',
    backupCodes: codes,
  };
}

// ── Login verification ──────────────────────────────────────────────────

export async function verify2FALogin(
  pendingToken: string,
  code: string,
): Promise<Verify2FALoginResult> {
  const {
    validatePendingToken,
    incrementPendingTokenAttempts,
    consumePendingToken,
  } = await import('@/server/security/pending-tokens');

  const pending = await validatePendingToken(pendingToken);
  if (!pending) {
    return {
      ok: false,
      message: 'Verification expired. Please sign in again.',
    };
  }

  const [row] = await db
    .select({ secret: user2fa.secret, backupCodes: user2fa.backupCodes })
    .from(user2fa)
    .where(
      and(
        eq(user2fa.userId, pending.userId),
        eq(user2fa.enabled, true),
      ),
    )
    .limit(1);

  if (!row) {
    await consumePendingToken(pendingToken);
    return { ok: false, message: '2FA is not enabled for this account.' };
  }

  const secret = decrypt(row.secret);
  let valid = verifyToken(secret, code);

  if (!valid && row.backupCodes) {
    const hashedCodes: string[] = JSON.parse(row.backupCodes);
    const idx = verifyBackupCode(code, hashedCodes);

    if (idx !== -1) {
      valid = true;
      // Remove the used backup code.
      hashedCodes.splice(idx, 1);
      await db
        .update(user2fa)
        .set({ backupCodes: JSON.stringify(hashedCodes) })
        .where(eq(user2fa.userId, pending.userId));
    }
  }

  if (!valid) {
    await incrementPendingTokenAttempts(pendingToken);
    return { ok: false, message: 'Invalid code. Please try again.' };
  }

  await consumePendingToken(pendingToken);

  // Create the session. There is no existing session at this point
  // because the first auth step (Credentials authorize / OAuth
  // signIn) intentionally skips session creation when 2FA is
  // enabled. We must encode the JWT here so the browser has
  // evidence of authentication on its next navigation.
  const authSecret = process.env.AUTH_SECRET;
  if (!authSecret) {
    return {
      ok: false,
      message: 'Server configuration error. Please contact support.',
    };
  }

  // Look up the user to get full profile info for the session.
  const [dbUser] = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, pending.userId))
    .limit(1);

  if (!dbUser) {
    return {
      ok: false,
      message: 'User not found. Please contact support.',
    };
  }

  // Determine secure cookie name prefix — matches what Auth.js does
  // internally for JWT sessions.
  const secure = !!process.env.AUTH_URL?.startsWith('https://');
  const cookieName = secure
    ? '__Secure-authjs.session-token'
    : 'authjs.session-token';

  const token = await encode({
    token: { sub: dbUser.id, email: dbUser.email, name: null },
    secret: authSecret,
    salt: cookieName,
    maxAge: 30 * 24 * 60 * 60, // 30 days
  });

  // eslint-disable-next-line no-console
  console.log(
    '[verify2FALogin] writing session cookie for user',
    dbUser.id,
    'name=',
    cookieName,
  );

  const cookieStore = await cookies();
  cookieStore.set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: 'lax',
    path: '/',
    maxAge: 30 * 24 * 60 * 60,
  });

  // eslint-disable-next-line no-console
  console.log('[verify2FALogin] session cookie written');

  return {
    ok: true,
    message: 'Verification successful.',
    redirectUrl: '/',
  };
}

// ── Disable ─────────────────────────────────────────────────────────────

export async function disable2FA(code: string): Promise<{ ok: boolean; message: string }> {
  const user = await getCurrentUser();

  const [row] = await db
    .select({ secret: user2fa.secret, backupCodes: user2fa.backupCodes })
    .from(user2fa)
    .where(
      and(
        eq(user2fa.userId, user.id),
        eq(user2fa.enabled, true),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, message: 'Two-factor authentication is not enabled.' };
  }

  const secret = decrypt(row.secret);
  let valid = verifyToken(secret, code);

  if (!valid && row.backupCodes) {
    const hashedCodes: string[] = JSON.parse(row.backupCodes);
    valid = verifyBackupCode(code, hashedCodes) !== -1;
  }

  if (!valid) {
    return { ok: false, message: 'Invalid code. Please try again.' };
  }

  await db
    .delete(user2fa)
    .where(eq(user2fa.userId, user.id));

  revalidatePath('/settings');

  return { ok: true, message: 'Two-factor authentication has been disabled.' };
}

// ── Status ──────────────────────────────────────────────────────────────

export async function get2FAStatus(): Promise<Get2FAStatusResult> {
  const user = await getCurrentUser();

  const [row] = await db
    .select({ enabled: user2fa.enabled, backupCodes: user2fa.backupCodes })
    .from(user2fa)
    .where(eq(user2fa.userId, user.id))
    .limit(1);

  if (!row || !row.enabled) {
    return { enabled: false, backupCodeCount: 0 };
  }

  const codes: string[] = row.backupCodes ? JSON.parse(row.backupCodes) : [];
  return { enabled: true, backupCodeCount: codes.length };
}

// ── Regenerate backup codes ─────────────────────────────────────────────

export async function regenerateBackupCodes(
  code: string,
): Promise<Confirm2FAResult> {
  const user = await getCurrentUser();

  const [row] = await db
    .select({ secret: user2fa.secret, enabled: user2fa.enabled })
    .from(user2fa)
    .where(
      and(
        eq(user2fa.userId, user.id),
        eq(user2fa.enabled, true),
      ),
    )
    .limit(1);

  if (!row) {
    return { ok: false, message: 'Two-factor authentication is not enabled.' };
  }

  const secret = decrypt(row.secret);
  if (!verifyToken(secret, code)) {
    return { ok: false, message: 'Invalid code. Please try again.' };
  }

  const codes = generateBackupCodes(10);
  const hashedCodes = codes.map(hashBackupCode);

  await db
    .update(user2fa)
    .set({
      backupCodes: JSON.stringify(hashedCodes),
      updatedAt: new Date(),
    })
    .where(eq(user2fa.userId, user.id));

  return {
    ok: true,
    message: 'New backup codes generated.',
    backupCodes: codes,
  };
}
