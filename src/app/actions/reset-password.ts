'use server';

import { createClient } from '@supabase/supabase-js';

// ── Types ───────────────────────────────────────────────────────────────

export type RequestPasswordResetResult = {
  ok: boolean;
  error?: string;
};

export type CompletePasswordResetInput = {
  password: string;
  // PKCE flow: the ?code= from the reset link.
  code?: string;
  // Implicit flow: the #access_token= / #refresh_token= from the hash.
  accessToken?: string;
  refreshToken?: string;
};

export type CompletePasswordResetResult = {
  ok: boolean;
  error?: string;
};

// ── Helpers ─────────────────────────────────────────────────────────────

// Mirrors buildRecoveryUrl() in actions/account.ts and buildShareUrl()
// in actions/shares.ts: NEXT_PUBLIC_APP_URL in production, localhost in
// dev, never a hardcoded domain.
function buildResetUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '') ??
    (process.env.NODE_ENV === 'production'
      ? ''
      : 'http://localhost:3000');
  return base ? `${base}/reset-password` : '/reset-password';
}

function createAnonClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('MISSING_SUPABASE_ENV');
  }
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function createAdminClient() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ── Actions ─────────────────────────────────────────────────────────────

export async function requestPasswordReset(
  email: string,
): Promise<RequestPasswordResetResult> {
  // Validate env first so a misconfiguration surfaces as a clean
  // error rather than a thrown stack trace reaching the client.
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { ok: false, error: 'Service unavailable. Please try again later.' };
  }

  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    // Treat empty input as success to avoid revealing that the field
    // is server-validated vs. not. The UI also gates the submit button.
    return { ok: true };
  }

  try {
    const supabase = createAnonClient();
    const redirectTo = buildResetUrl();
    const { error } = await supabase.auth.resetPasswordForEmail(
      normalized,
      { redirectTo },
    );

    if (error) {
      const msg = error.message.toLowerCase();
      // Rate-limit errors are the only case worth surfacing — they
      // don't reveal whether the email exists, they just tell the
      // user to slow down.
      if (msg.includes('rate')) {
        return {
          ok: false,
          error: 'Please wait a moment before requesting another link.',
        };
      }
      // Any other error: do NOT echo it (could enumerate users).
      // Log to the server terminal, return neutral ok to the client.
      console.error('[reset-password] resetPasswordForEmail failed:', error.message);
      return { ok: true };
    }

    return { ok: true };
  } catch (err) {
    // Never throw to the client. Log server-side, return neutral ok.
    console.error('[reset-password] requestPasswordReset threw:', err);
    return { ok: true };
  }
}

export async function completePasswordReset({
  password,
  code,
  accessToken,
  refreshToken,
}: CompletePasswordResetInput): Promise<CompletePasswordResetResult> {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return { ok: false, error: 'Service unavailable. Please try again later.' };
  }

  if (!password || password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters.' };
  }

  const hasPkce = Boolean(code);
  const hasImplicit = Boolean(accessToken && refreshToken);
  if (!hasPkce && !hasImplicit) {
    return {
      ok: false,
      error: 'Invalid or expired reset link. Please request a new one.',
    };
  }

  try {
    const supabase = createAnonClient();

    // Establish the session that authorizes the password change.
    let userId: string | null = null;

    if (hasPkce) {
      const { data, error } = await supabase.auth.exchangeCodeForSession(
        code!,
      );
      if (error || !data.user) {
        const msg = (error?.message ?? '').toLowerCase();
        // Log the real reason for diagnosis — never echo it back
        // to the client (could leak token/session state details).
        console.error(
          '[reset-password] exchangeCodeForSession failed:',
          error?.message ?? 'no user returned',
        );
        if (msg.includes('expired')) {
          return {
            ok: false,
            error: 'This reset link has expired. Please request a new one.',
          };
        }
        return {
          ok: false,
          error: 'Invalid or expired reset link. Please request a new one.',
        };
      }
      userId = data.user.id;
    } else {
      const { data, error } = await supabase.auth.setSession({
        access_token: accessToken!,
        refresh_token: refreshToken!,
      });
      if (error || !data.user) {
        // Per Supabase docs, setSession errors here when the
        // refresh_token has been rotated/revoked (e.g. used once, or
        // user logged in elsewhere). Log the real message for ops.
        console.error(
          '[reset-password] setSession failed:',
          error?.message ?? 'no user returned',
        );
        return {
          ok: false,
          error: 'Invalid or expired reset link. Please request a new one.',
        };
      }
      userId = data.user.id;
    }

    // Set the new password.
    const { error: updateError } = await supabase.auth.updateUser({
      password,
    });
    if (updateError) {
      const msg = updateError.message.toLowerCase();
      if (msg.includes('password')) {
        return {
          ok: false,
          error: 'Password is too weak. Use at least 8 characters.',
        };
      }
      console.error(
        '[reset-password] updateUser failed:',
        updateError.message,
      );
      return {
        ok: false,
        error: 'Could not update your password. Please try again.',
      };
    }

    // Best-effort: revoke ALL of this user's sessions (other devices
    // AND the one we just used). We don't need the session anymore —
    // the user signs in fresh at /login. If revocation fails, the
    // password was still changed, so we still return ok.
    if (userId) {
      try {
        const admin = createAdminClient();
        if (admin) {
          await admin.auth.admin.signOut(userId, 'global');
        }
      } catch (err) {
        console.error('[reset-password] session revocation failed:', err);
      }
    }

    return { ok: true };
  } catch (err) {
    console.error('[reset-password] completePasswordReset threw:', err);
    return {
      ok: false,
      error: 'Something went wrong. Please try again.',
    };
  }
}