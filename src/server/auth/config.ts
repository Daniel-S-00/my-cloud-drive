import 'server-only';
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import GitHub from 'next-auth/providers/github';
import Google from 'next-auth/providers/google';
import { SupabaseAdapter } from '@auth/supabase-adapter';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(
      `${name} is not defined. Add it to .env.local before using auth.`,
    );
  }
  return value;
}

function getSupabaseAuthConfig() {
  return {
    url: requireEnv('SUPABASE_URL'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
  };
}

function createSupabaseAuthClient(
  url: string,
  key: string,
): SupabaseClient {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const { handlers, auth, signIn, signOut } = NextAuth(
  async () => {
    const { url, anonKey } = getSupabaseAuthConfig();

    return {
      adapter: SupabaseAdapter({
        get url() {
          return requireEnv('SUPABASE_URL');
        },
        get secret() {
          return requireEnv('SUPABASE_SERVICE_ROLE_KEY');
        },
      }),
      session: { strategy: 'jwt' as const },
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
            const supabaseAuth = createSupabaseAuthClient(url, anonKey);

            const { data, error } =
              await supabaseAuth.auth.signInWithPassword({
                email,
                password,
              });
            if (error || !data.user) return null;

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
    };
  },
);
