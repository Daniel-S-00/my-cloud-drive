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

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') ?? '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const result = await signIn('credentials', {
        email: email.trim().toLowerCase(),
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError('Invalid email or password.');
        return;
      }
      router.push(callbackUrl);
      router.refresh();
    } catch {
      setError('Sign-in failed. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  const onOAuth = (provider: 'google' | 'github') => {
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
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                disabled={isPending}
              />
            </div>
            {error && (
              <p className="text-sm text-red-400" role="alert">
                {error}
              </p>
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
              Continue with Google
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => onOAuth('github')}
              disabled={isPending}
            >
              Continue with GitHub
            </Button>
          </div>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-text-secondary">
            Don&apos;t have an account?{' '}
            <Link
              href="/signup"
              className="font-medium text-accent-glow underline-offset-2 hover:underline"
            >
              Sign up
            </Link>
          </p>
        </CardFooter>
    </AuthShell>
  );
}
