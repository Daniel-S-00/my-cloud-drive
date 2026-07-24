import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { SupabaseAdapter } from '@auth/supabase-adapter';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { and, eq, isNotNull, or } from 'drizzle-orm';
import { db } from '@/server/db/client';
import { user2fa, users } from '@/server/db/schema';
import { generatePendingToken } from '@/server/security/pending-tokens';
import { validateProductionEnv } from '@/server/env';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `${name} is not defined. Add it to .env.local before using auth.`,
    );
  }
  return value;
}

function createSupabaseAuthClient(
  url: string,
  key: string,
): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Object config (not function config). The function-config path in
// next-auth@5 beta has a different shape: `auth(handler)` would fall
// through to the API-routes branch and return a Promise of the
// session rather than a middleware function, which is what the proxy
// loader needs. Object config is the documented pattern for the
// `auth(handler)` proxy wrapper.
//
// Env reads are still deferred via getters on the SupabaseAdapter
// options, so a missing var only breaks the actual R2/Supabase call,
// not module load.
//
// In production, validate critical secrets before accepting traffic.
validateProductionEnv();
export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: SupabaseAdapter({
    get url() {
      return requireEnv('SUPABASE_URL');
    },
    get secret() {
      return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    },
  }),
  session: { strategy: 'jwt' },
  trustHost: true,
  pages: {
    signIn: '/login',
  },
  providers: [
    Credentials({
      name: 'Email and password',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email =
          typeof credentials?.email === 'string'
            ? credentials.email.trim().toLowerCase()
            : undefined;
        const password =
          typeof credentials?.password === 'string'
            ? credentials.password
            : undefined;
        if (!email || !password) return null;

        // Construct the Supabase client lazily so a missing env
        // var only breaks the sign-in attempt, not module load.
        const supabaseAuth = createSupabaseAuthClient(
          requireEnv('SUPABASE_URL'),
          requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
        );

        const { data, error } = await supabaseAuth.auth.signInWithPassword({
          email,
          password,
        });
        if (error || !data.user) return null;

        // Block unverified emails from signing in via credentials.
        // OAuth providers (Google/GitHub) bypass this check entirely
        // because they verify the email themselves.
        if (
          !data.user.email_confirmed_at &&
          !data.user.user_metadata?.email_verified
        ) {
          throw new Error(
            'Please verify your email before signing in. Check your inbox or request a new verification link.',
          );
        }

        // Check if the account is scheduled for deletion.
        const [deletedUser] = await db
          .select({ deletedAt: users.deletedAt })
          .from(users)
          .where(eq(users.id, data.user.id))
          .limit(1);

        if (deletedUser?.deletedAt) {
          throw new Error(
            'This account has been deactivated. Please contact support.',
          );
        }

        // Check if 2FA is enabled. If so, generate a pending token
        // instead of creating a session — the user must complete the
        // 2FA challenge on /verify-2fa.
        const [twoFactor] = await db
          .select({ enabled: user2fa.enabled })
          .from(user2fa)
          .where(
            and(
              eq(user2fa.userId, data.user.id),
              eq(user2fa.enabled, true),
            ),
          )
          .limit(1);

        if (twoFactor) {
          const pendingToken = await generatePendingToken(data.user.id);
          throw new Error(
            JSON.stringify({
              type: '2fa_required',
              pendingToken,
            }),
          );
        }

        return {
          id: data.user.id,
          email: data.user.email ?? null,
          name:
            (data.user.user_metadata?.name as string | undefined) ??
            data.user.email ??
            null,
          image:
            (data.user.user_metadata?.avatar_url as string | undefined) ??
            null,
        };
      },
    }),
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
    GitHub({
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (user?.email) {
        const email = user.email.toLowerCase();

        // Block deleted accounts (both email and originalEmail).
        if (account?.provider !== 'credentials') {
          const [match] = await db
            .select({ deletedAt: users.deletedAt, id: users.id })
            .from(users)
            .where(
              or(
                eq(users.email, email),
                eq(users.originalEmail, email),
              ),
            )
            .limit(1);

          if (match?.deletedAt) {
            return '/login?error=account-deleted';
          }

          // Check 2FA for the user this OAuth account links to.
          if (match) {
            const [twoFactor] = await db
              .select({ enabled: user2fa.enabled })
              .from(user2fa)
              .where(
                and(
                  eq(user2fa.userId, match.id),
                  eq(user2fa.enabled, true),
                ),
              )
              .limit(1);

            if (twoFactor) {
              const pendingToken = await generatePendingToken(match.id);
              return `/verify-2fa?token=${pendingToken}`;
            }
          }
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.id) {
        token.sub = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub && session.user) {
        session.user.id = token.sub;
      }
      return session;
    },
  },
});
