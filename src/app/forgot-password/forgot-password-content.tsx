'use client';

import { KeyRound } from 'lucide-react';
import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { requestPasswordReset } from '@/app/actions/reset-password';
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

export default function ForgotPasswordContent() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setIsPending(true);
    try {
      // Neutral success message regardless of email existence — the
      // server action only returns ok:false for config errors or
      // rate-limit, never for "user not found" (anti-enumeration).
      const result = await requestPasswordReset(email);
      if (result.ok) {
        setInfo(
          'If an account exists for this email, a reset link has been sent. Check your inbox and spam folder.',
        );
      } else {
        setError(result.error ?? 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AuthShell>
      <CardHeader>
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-accent-glow" />
          <CardTitle>Forgot password?</CardTitle>
        </div>
        <CardDescription>
          Enter your account email and we&apos;ll send you a link to reset it.
        </CardDescription>
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
              autoFocus
              disabled={isPending}
            />
          </div>
          {info && (
            <p className="text-sm text-accent-glow" role="status">
              {info}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-400" role="alert">
              {error}
            </p>
          )}
          <Button type="submit" variant="primary" disabled={isPending}>
            {isPending ? 'Sending...' : 'Send reset link'}
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