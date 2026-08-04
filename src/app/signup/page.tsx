'use client';

import { createClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { signIn } from 'next-auth/react';
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Surfaced during development; in production these are set at build
  // time so this branch is unreachable.
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required.',
  );
}

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsPending(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
      });
      if (signUpError) {
        const msg = signUpError.message.toLowerCase();
        if (msg.includes('already')) {
          setError('An account with this email already exists.');
        } else if (msg.includes('password')) {
          setError('Password is too weak. Use at least 8 characters.');
        } else {
          setError(signUpError.message);
        }
        return;
      }
      if (data.session) {
        // Sign in via NextAuth so the App's JWT cookie is set.
        const result = await signIn('credentials', {
          email: email.trim().toLowerCase(),
          password,
          redirect: false,
        });
        if (!result || result.error) {
          // Fall back to login page if auto-login fails.
          router.push('/login');
          return;
        }
        router.push('/drive');
        router.refresh();
      } else {
        // Email confirmation is required — redirect to the
        // verify-email page so the user knows to check their inbox.
        router.push(
          `/verify-email?email=${encodeURIComponent(
            data.user?.email ?? email,
          )}`,
        );
      }
    } catch {
      setError('Sign-up failed. Please try again.');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <AuthShell>
      <CardHeader>
          <CardTitle>Create an account</CardTitle>
          <CardDescription>Get started with My Cloud Drive.</CardDescription>
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
                autoComplete="new-password"
                minLength={8}
                disabled={isPending}
              />
              <p className="text-xs text-text-secondary">
                At least 8 characters.
              </p>
            </div>
            {error && (
              <div className="text-sm text-red-400" role="alert">
                <p>{error}</p>
                {error.toLowerCase().includes('already') && (
                  <div className="mt-1 flex gap-2">
                    <Link
                      href="/login"
                      className="font-medium underline underline-offset-2"
                    >
                      Sign in
                    </Link>
                    <Link
                      href={`/verify-email?email=${encodeURIComponent(
                        email.trim().toLowerCase(),
                      )}`}
                      className="font-medium underline underline-offset-2"
                    >
                      Resend verification
                    </Link>
                  </div>
                )}
              </div>
            )}
            <Button type="submit" variant="primary" disabled={isPending}>
              {isPending ? 'Creating account...' : 'Create account'}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="text-sm text-text-secondary">
            Already have an account?{' '}
            <Link
              href="/login"
              className="font-medium text-accent-glow underline-offset-2 hover:underline"
            >
              Sign in
            </Link>
          </p>
        </CardFooter>
    </AuthShell>
  );
}
