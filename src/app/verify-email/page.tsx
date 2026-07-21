'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { resendVerificationEmail } from '@/app/actions/auth';
import AuthShell from '@/components/auth-shell';
import { Button } from '@/components/ui/button';
import {
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') ?? '';

  const [info, setInfo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onResend = async () => {
    if (!email) {
      setError('No email provided. Please sign up again.');
      return;
    }
    setError(null);
    setInfo(null);
    setIsPending(true);
    try {
      const result = await resendVerificationEmail(email);
      if (result.ok) {
        setInfo(result.message);
      } else {
        setError(result.message);
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  if (!email) {
    return (
      <AuthShell>
        <CardHeader>
          <CardTitle>Missing email</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            No email was provided. Please sign up again.
          </p>
        </CardContent>
        <CardFooter>
          <Button
            variant="secondary"
            className="w-full"
            onClick={() => router.push('/signup')}
          >
            Go to sign up
          </Button>
        </CardFooter>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <CardHeader>
        <CardTitle>Check your inbox</CardTitle>
        <CardDescription>
          We sent a verification link to <strong>{email}</strong>.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p className="text-sm text-text-secondary">
          Click the link in the email to verify your account. If you
          don&apos;t see it, check your spam folder.
        </p>
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
        <Button
          variant="secondary"
          onClick={onResend}
          disabled={isPending}
          className="w-full"
        >
          {isPending ? 'Sending...' : 'Resend verification email'}
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
