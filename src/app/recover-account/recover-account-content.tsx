'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import {
  recoverAccount,
  requestRecoveryEmail,
} from '@/app/actions/account';
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

export default function RecoverAccountContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [isRestoring, setIsRestoring] = useState(() => !!token);

  const onRestore = async () => {
    if (!token) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await recoverAccount(token);
      if (result.ok) {
        router.push(result.redirectUrl ?? '/login?recovered=true');
      } else {
        setError(result.message);
        setIsRestoring(false);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  const onRequestEmail = async () => {
    setError(null);
    setInfo(null);
    setIsPending(true);
    try {
      const result = await requestRecoveryEmail(email);
      setInfo(result.message);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  // MODE A: Token present → show restore confirmation.
  if (token && isRestoring) {
    return (
      <AuthShell>
        <CardHeader>
          <CardTitle>Restore your account?</CardTitle>
          <CardDescription>
            Your account and all data will be restored. You can sign in
            normally after.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <Button
            variant="primary"
            onClick={onRestore}
            disabled={isPending}
            className="w-full"
          >
            {isPending ? 'Restoring...' : 'Restore Account'}
          </Button>
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

  // MODE B: No token (or token invalid) → email form.
  return (
    <AuthShell>
      <CardHeader>
        <CardTitle>Recover your account</CardTitle>
        <CardDescription>
          Enter the email address associated with your deleted account.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isPending}
          />
        </div>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        {info && (
          <p className="text-sm text-accent-glow" role="status">
            {info}
          </p>
        )}
        <Button
          variant="primary"
          onClick={onRequestEmail}
          disabled={!email || isPending}
          className="w-full"
        >
          {isPending ? 'Sending...' : 'Send Recovery Link'}
        </Button>
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
