'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState, type FormEvent } from 'react';
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
import { PasswordInput } from '@/components/ui/password-input';
import { JUST_LOGGED_IN_KEY } from '@/components/trash-login-toast';

const OAUTH_ERRORS: Record<string, string> = {
  OAuthSignin: 'Could not start sign-in. Please try again.',
  OAuthCallback: 'Authentication was cancelled or failed.',
  OAuthCreateAccount: 'Could not create your account. Please try again.',
  OAuthAccountNotLinked:
    'An account with this email already exists. Sign in with email instead.',
  Callback: 'Authentication failed. Please try again.',
  SessionRequired: 'You must be signed in to view this page.',
  'verification-failed': 'Verification failed. Please try again.',
  'verification-expired':
    'Your verification link has expired. Request a new one.',
  default: 'Authentication failed. Please try again.',
};

const RESET_SUCCESS =
  'Your password has been updated. Please sign in with your new password.';

export default function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/drive';

  const recovered = searchParams.get('recovered');
  const resetDone = searchParams.get('reset') === 'success';
  const oauthError = searchParams.get('error');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    oauthError === 'account-deleted'
      ? 'This account is scheduled for deletion. Recover it to sign in again.'
      : oauthError
        ? OAUTH_ERRORS[oauthError] ?? OAUTH_ERRORS.default
        : null,
  );
  const [info] = useState<string | null>(
    recovered === 'true'
      ? 'Your account has been restored. You can now sign in.'
      : resetDone
        ? RESET_SUCCESS
        : null,
  );
  const [needsVerification, setNeedsVerification] = useState(false);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNeedsVerification(false);
    setIsPending(true);
    try {
        const result = await signIn('credentials', {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });
        if (!result || result.error) {
        const code = result?.code;

        // 2FA: the token is stored in an httpOnly cookie by the
        // Credentials provider, so the client just navigates to the
        // verify page with no sensitive data in the URL.
        if (code === '2fa_required') {
          sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
          router.push('/verify-2fa');
          return;
        }

        if (code === 'email_not_verified') {
          setNeedsVerification(true);
          setError('Please verify your email before signing in.');
        } else if (code === 'account_deactivated') {
          setError(
            'This account is scheduled for deletion. Recover it before the grace period ends.',
          );
        } else {
          setError('Invalid email or password.');
        }
        return;
      }
      sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Sign-in failed. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  const onOAuth = (provider: 'google' | 'github') => {
    sessionStorage.setItem(JUST_LOGGED_IN_KEY, '1');
    void signIn(provider, { callbackUrl });
  };

  return (
    <AuthShell>
      <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back to My Cloud Drive.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isPending}
              />
            </div>
            <div className="-mt-2 flex justify-end">
              <Link
                href="/forgot-password"
                className="text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            {info && (
              <p className="text-sm text-accent-glow" role="status">
                {info}
              </p>
            )}
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
                {needsVerification && (
                  <>
                    {' '}
                    <Link
                      href={`/verify-email?email=${encodeURIComponent(email.trim().toLowerCase())}`}
                      className="font-medium underline underline-offset-2"
                    >
                      Resend verification email
                    </Link>
                  </>
                )}
              </p>
            )}
            {error?.includes('deletion') && (
              <Link
                href="/recover-account"
                className="text-sm text-accent-glow hover:underline"
              >
                Recover your account
              </Link>
            )}
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? 'Signing in...' : 'Sign in'}
            </Button>
          </form>

          <div className="my-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-border-subtle" />
            <span className="text-xs uppercase text-text-secondary">or</span>
            <div className="h-px flex-1 bg-border-subtle" />
          </div>

          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOAuth('google')}
              disabled={isPending}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 48 48" aria-hidden>
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
              </svg>
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOAuth('github')}
              disabled={isPending}
            >
              <svg className="mr-2 h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
              </svg>
              Continue with GitHub
            </Button>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <p className="text-sm text-text-secondary">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-medium text-accent-glow underline-offset-2 hover:underline"
            >
              Sign up
            </Link>
          </p>
          <Link
            href="/recover-account"
            className="text-xs text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
          >
            Need to recover a deleted account?
          </Link>
        </CardFooter>
    </AuthShell>
  );
}
