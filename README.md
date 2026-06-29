# My Cloud Drive

A Google Drive-style personal cloud storage platform built on Next.js 16,
Drizzle ORM + Supabase Postgres, and Cloudflare R2. Uploads flow directly
from the browser to R2 via S3 v3 presigned URLs — bytes never traverse
the Next.js server.

## Stack

- **Next.js 16** (App Router, React 19, Server Components + Server Actions)
- **TypeScript** with `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **Tailwind CSS v4** + hand-written shadcn-style primitives in `src/components/ui/`
- **Drizzle ORM** + **Postgres (Supabase)** for the relational store
- **Cloudflare R2** (S3 v3) for object storage via presigned PUT URLs
- **Auth.js v5** (`next-auth@beta`) with the **Supabase adapter** for user
  storage; **JWT** session strategy; **Credentials**, **Google**, and
  **GitHub** providers

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values. See
   [Environment variables](#environment-variables) for the full list and
   the [OAuth setup](#oauth-provider-setup) section for the provider
   credentials.

3. Apply the database migrations:

   ```bash
   npx drizzle-kit migrate
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>. You will be redirected to `/login` until
   you have signed up.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase pooler is fine) |
| `R2_ACCOUNT_ID` | Cloudflare R2 account id |
| `R2_ACCESS_KEY_ID` | R2 access key id |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET` | R2 bucket name |
| `R2_ENDPOINT` | R2 endpoint (for the AWS SDK) |
| `R2_ENDPOINT_URL` | Same endpoint, used by the R2 presigner |
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_ANON_KEY` | Supabase anon key (server-side) |
| `NEXT_PUBLIC_SUPABASE_URL` | Same as `SUPABASE_URL`, inlined for the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same as `SUPABASE_ANON_KEY`, inlined for the browser |
| `AUTH_SECRET` | JWT signing secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth credentials |

## OAuth provider setup

This project uses Auth.js v5 with the Supabase adapter. OAuth providers
need to be configured in **both** the Supabase Auth dashboard **and** the
provider's own developer console, and the resulting client IDs and
secrets must be set in `.env.local` (this file is gitignored).

### Google

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and
   create (or select) a project.
2. **APIs & Services → OAuth consent screen** — configure the consent
   screen (External type is fine for development; add the scopes
   `openid`, `email`, and `profile`).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**.
   - Application type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000` (and your
     production origin).
   - Authorized redirect URIs:
     `http://localhost:3000/api/auth/callback/google`
     (and the production equivalent).
4. Copy the **Client ID** and **Client secret** into `GOOGLE_CLIENT_ID`
   and `GOOGLE_CLIENT_SECRET` in `.env.local`.
5. **Supabase dashboard → Authentication → Providers → Google** — enable
   the Google provider and paste the same client ID and secret. (Auth.js
   will sign in directly, but the Supabase adapter still uses the Google
   provider row to write the user into `auth.users` on first sign-in.)

### GitHub

1. **GitHub → Settings → Developer settings → OAuth apps → New OAuth App**.
   - Homepage URL: `http://localhost:3000`.
   - Authorization callback URL:
     `http://localhost:3000/api/auth/callback/github`.
2. Copy the **Client ID** and generate a **client secret**; paste them
   into `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.env.local`.
3. **Supabase dashboard → Authentication → Providers → GitHub** — enable
   the GitHub provider and paste the same client ID and secret.

### Email + password

Email + password sign-in goes through the Supabase Auth API directly.
Users are created in `auth.users` by `supabase.auth.signUp(...)` (called
from `src/app/signup/page.tsx`) and verified by
`supabase.auth.signInWithPassword(...)` (called from the Auth.js
Credentials provider's `authorize` callback in
`src/server/auth/config.ts`).

The Supabase project must have **email signups enabled** in
**Authentication → Providers → Email** and (for local development) the
**Confirm email** toggle turned **off**, or you will have to click the
confirmation link in your inbox before the first login works.

## Project structure

```
src/
├── app/                          # Next.js App Router
│   ├── api/auth/[...nextauth]/   # Auth.js route handler
│   ├── login/                    # /login page
│   ├── signup/                   # /signup page
│   ├── actions/upload.ts         # generateUploadUrl + confirmUpload
│   ├── layout.tsx                # Root layout (wraps SessionProvider)
│   └── page.tsx                  # Protected dashboard
├── components/
│   ├── ui/                       # shadcn-style primitives
│   ├── file-upload.tsx           # drag-and-drop client
│   ├── file-list.tsx             # Server Component table
│   ├── logout-button.tsx         # client
│   └── auth-session-provider.tsx # SessionProvider wrapper
├── hooks/
│   └── use-upload.ts             # XHR + progress
├── middleware.ts                 # auth gate
└── server/
    ├── auth/                     # Auth.js config + session helper
    ├── db/                       # Drizzle schema, migrations, client
    └── storage/                  # R2 client
```

## Scripts

```bash
npm run dev          # next dev
npm run build        # next build
npm run start        # next start
npm run lint         # eslint
npx tsc --noEmit     # typecheck
npx drizzle-kit generate   # generate a new migration
npx drizzle-kit migrate    # apply pending migrations
```

## Deploying

The app is a standard Next.js 16 application. Vercel, Cloudflare Pages
(with the Next.js adapter), and self-hosted Node 20 LTS are all
supported. Set the full set of environment variables in your deployment
platform's dashboard. The `AUTH_SECRET` MUST be set to a long random
string in production; the dev fallback in `.env.local` is not safe.

## Notes

- The `users` table is a mirror of Supabase's `auth.users`. The
  `generateUploadUrl` action performs an `INSERT ... ON CONFLICT DO
  NOTHING` on every upload to keep the mirror in sync without race
  conditions.
- For production, swap the Supabase adapter's `secret` (currently the
  anon key) for the Supabase **service-role** key so the adapter can
  write under RLS. The TODO in `src/server/auth/config.ts` marks the
  exact line.
- All bytes flow browser → R2. The Next.js server only signs URLs and
  persists metadata, per Constitution Principle I.
