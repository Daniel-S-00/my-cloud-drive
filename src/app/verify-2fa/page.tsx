'use client';

import { Shield } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { verify2FALogin } from '@/app/actions/two-factor';
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

export default function Verify2FAPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [code, setCode] = useState('');
  const [mode, setMode] = useState<'totp' | 'backup'>('totp');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async () => {
    if (!code) return;
    setError(null);
    setIsPending(true);
    try {
      const result = await verify2FALogin(token, code);
      if (result.ok) {
        router.refresh();
        router.push(result.redirectUrl ?? '/');
      } else {
        setError(result.message);
        if (result.message.includes('expired')) {
          router.push('/login');
        }
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  if (!token) {
    return (
      <AuthShell>
        <CardHeader>
          <CardTitle>Invalid request</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-text-secondary">
            No verification token provided. Please sign in again.
          </p>
        </CardContent>
        <CardFooter>
          <Link
            href="/login"
            className="font-medium text-accent-glow underline-offset-2 hover:underline"
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
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-accent-glow" />
          <CardTitle>Two-Factor Authentication</CardTitle>
        </div>
        <CardDescription>
          {mode === 'totp'
            ? 'Enter the 6-digit code from your authenticator app.'
            : 'Enter one of your backup codes.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Input
            value={code}
            onChange={(e) => {
              const cleaned = e.target.value
                .replace(/[^0-9a-zA-Z]/g, '')
                .slice(0, mode === 'totp' ? 6 : 8);
              setCode(cleaned);
              if (
                mode === 'totp' &&
                cleaned.length === 6
              ) {
                // Auto-submit on 6 digits
              }
            }}
            placeholder={mode === 'totp' ? '000000' : 'ABCD1234'}
            className="font-mono text-center text-lg tracking-[0.3em]"
            maxLength={mode === 'totp' ? 6 : 8}
            autoFocus
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onSubmit();
            }}
          />
        </div>
        {error && (
          <p className="text-sm text-red-400" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          onClick={() => void onSubmit()}
          disabled={!code || isPending}
          className="w-full"
        >
          {isPending ? 'Verifying...' : 'Verify'}
        </Button>

        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border-subtle" />
          <span className="text-xs uppercase text-text-secondary">or</span>
          <div className="h-px flex-1 bg-border-subtle" />
        </div>

        <button
          type="button"
          onClick={() => {
            setMode(mode === 'totp' ? 'backup' : 'totp');
            setCode('');
            setError(null);
          }}
          className="text-sm text-text-secondary underline-offset-2 hover:text-text-primary hover:underline"
        >
          {mode === 'totp'
            ? 'Use a backup code instead'
            : 'Use authenticator app instead'}
        </button>
      </CardContent>
      <CardFooter>
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
