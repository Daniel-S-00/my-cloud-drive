'use client';

import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSyncExternalStore, useState, type FormEvent } from 'react';
import { completePasswordReset } from '@/app/actions/reset-password';
import AuthShell from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

// PKCE: ?code=...&type=recovery (server exchanges once via the action).
// Implicit: #access_token=...&refresh_token=...&type=recovery (client
// parses the hash; the server never sees the fragment).
type DetectedToken =
  | { flow: 'pkce'; code: string }
  | {
      flow: 'implicit';
      accessToken: string;
      refreshToken: string;
    }
  | null;

// useSyncExternalStore: hydration-safe way to read the URL hash. The
// server snapshot is always '' and the client snapshot is the real
// window.location.hash. This avoids both hydration-mismatch warnings
// and the setState-in-effect lint rule.
function subscribeHash(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function getHashClient(): string {
  return typeof window === 'undefined' ? '' : window.location.hash;
}

function getHashServer(): string {
  return '';
}

function parseHashForRecovery(hash: string): {
  accessToken?: string;
  refreshToken?: string;
  isRecovery: boolean;
} {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return { isRecovery: false };
  const params = new URLSearchParams(raw);
  return {
    accessToken: params.get('access_token') ?? undefined,
    refreshToken: params.get('refresh_token') ?? undefined,
    isRecovery: params.get('type') === 'recovery',
  };
}

function detectToken(code: string | null, hash: string): DetectedToken {
  if (code) return { flow: 'pkce', code };
  const h = parseHashForRecovery(hash);
  if (h.isRecovery && h.accessToken && h.refreshToken) {
    return {
      flow: 'implicit',
      accessToken: h.accessToken,
      refreshToken: h.refreshToken,
    };
  }
  return null;
}

export default function ResetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const hash = useSyncExternalStore(
    subscribeHash,
    getHashClient,
    getHashServer,
  );
  const token = detectToken(code, hash);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  // Set when the server action confirms the link is expired/invalid —
  // triggers a switch from the form view to the "request a new link"
  // panel.
  const [tokenInvalid, setTokenInvalid] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (!token) return;

    setSubmitting(true);
    try {
      const result = await completePasswordReset({
        password,
        code: token.flow === 'pkce' ? token.code : undefined,
        accessToken:
          token.flow === 'implicit' ? token.accessToken : undefined,
        refreshToken:
          token.flow === 'implicit' ? token.refreshToken : undefined,
      });

      if (result.ok) {
        // Clear the URL fragment so a refresh/back-nav doesn't replay
        // an already-used token.
        if (typeof window !== 'undefined' && window.history) {
          window.history.replaceState(null, '', '/reset-password');
        }
        setDone(true);
        // Give the "Password updated" confirmation ~800ms to register
        // visually before redirecting. The meaningful success marker
        // is the ?reset=success banner that follows on /login.
        setTimeout(() => router.push('/login?reset=success'), 800);
        return;
      }

      const msg = result.error ?? 'Could not reset your password.';
      setError(msg);
      // An expired / invalid / already-used token lands the user on
      // the invalid-link panel so they get the "request a new one"
      // affordance instead of being trapped in the form.
      if (
        msg.toLowerCase().includes('expired') ||
        msg.toLowerCase().includes('invalid')
      ) {
        setTokenInvalid(true);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived view ───────────────────────────────────────────────────

  if (done) {
    return (
      <AuthShell>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-accent-glow" />
            <CardTitle>Password updated</CardTitle>
          </div>
          <CardDescription>
            You can now sign in with your new password.
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link
            href="/login"
            className="font-medium text-accent-glow underline-offset-2 hover:underline"
          >
            Go to login
          </Link>
        </CardFooter>
      </AuthShell>
    );
  }

  if (!token || tokenInvalid) {
    return (
      <AuthShell>
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-400" />
            <CardTitle>Reset link invalid</CardTitle>
          </div>
          <CardDescription>
            {tokenInvalid
              ? error ?? 'This reset link is no longer valid.'
              : 'This reset link is missing its token.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            Reset links expire after a short time and can only be used once.
            Request a fresh link and try again.
          </p>
        </CardContent>
        <CardFooter className="flex flex-col items-start gap-2">
          <Link
            href="/forgot-password"
            className="font-medium text-accent-glow underline-offset-2 hover:underline"
          >
            Request a new reset link
          </Link>
          <Link
            href="/login"
            className="text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Back to login
          </Link>
        </CardFooter>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <CardHeader>
        <CardTitle>Set a new password</CardTitle>
        <CardDescription>
          Choose a password you don&apos;t use elsewhere.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              autoFocus
              disabled={submitting}
            />
            <p className="text-xs text-text-secondary">At least 8 characters.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
              disabled={submitting}
            />
          </div>
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          {submitting && (
            <p className="flex items-center gap-2 text-sm text-text-secondary" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Updating your password...
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={
              submitting ||
              password.length < 8 ||
              password !== confirm
            }
          >
            {submitting ? 'Saving...' : 'Update password'}
          </Button>
        </form>
      </CardContent>
      <CardFooter>
        <p className="text-sm text-text-secondary">
          <Link
            href="/login"
            className="font-medium text-accent-glow underline-offset-2 hover:underline"
          >
            Back to login
          </Link>
        </p>
      </CardFooter>
    </AuthShell>
  );
}