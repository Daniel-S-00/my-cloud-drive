# My Cloud Drive

A Google Drive-style personal cloud storage platform built on Next.js 16,
Drizzle ORM + Supabase Postgres, and Cloudflare R2. Files stream directly
from the browser to R2 via S3 presigned URLs — bytes never traverse the
Next.js server, which only signs URLs and persists metadata.

## Stack

- **Next.js 16** (App Router, React 19, Server Components + Server Actions)
- **TypeScript** with `strict` + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **Tailwind CSS v4** + hand-written primitives in `src/components/ui/`
- **Drizzle ORM** + **Postgres (Supabase)** for the relational store
- **Cloudflare R2** (S3 v3) for object storage: presigned PUT uploads
  (single-part and multipart) and presigned GET previews/downloads
- **Auth.js v5** (`next-auth@beta`) with the **Supabase adapter**; **JWT**
  session strategy; **Credentials**, **Google**, and **GitHub** providers;
  TOTP **two-factor authentication** with backup codes
- **Stripe** for subscription billing (webhook-synced plan state)
- **Resend** + **React Email** for transactional email
- **Sentry** for error reporting, **Vercel Analytics** for page views
- **Vitest** (unit/integration, coverage-gated) + **Playwright** (E2E)

## Architecture

The app follows a strict one-way layering:

```
components / contexts / hooks        (client entry points)
        │  server actions only
src/app/actions/*                    (typed Input/Output per action)
        ▼
src/server/*                         (leaf layer — never imports client code)
  ├── auth/        Auth.js config + session helpers
  ├── billing/     Stripe plans, quota, webhook persistence
  ├── db/          Drizzle client, schema, migrations
  ├── email/       Resend sender + React Email templates
  ├── security/    2FA encryption, TOTP, pending tokens
  └── storage/     R2 (S3-compatible) adapter
```

Rules that keep it honest:

- `src/server/*` is a leaf layer: zero imports from client code.
- Every external service has exactly **one adapter module** in `src/server/*`.
- Client components never import `@/server/*`; they reach server state only
  through server actions. Server Components may read `server/*` directly.
- Server actions are the write path and expose typed `Input`/`Output` shapes;
  complex actions are documented as contracts in `specs/001/contracts/`.

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy `.env.example` to `.env.local` and fill in the values. See
   [Environment variables](#environment-variables) and the
   [OAuth provider setup](#oauth-provider-setup) section.

3. Apply the database migrations:

   ```bash
   npx drizzle-kit migrate
   ```

4. Run the dev server:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>. Logged-out visitors see the landing page;
   sign up or log in from `/login` to reach your drive.

   For local development, keep the Supabase **Confirm email** toggle off
   (Authentication → Providers → Email), otherwise the confirmation link
   must be clicked before the first login works.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string (Supabase pooler is fine) |
| `SUPABASE_URL` | Supabase project URL (server-side) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service-role key — used by the Auth.js adapter and admin flows |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase URL inlined for the browser |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key inlined for the browser |
| `AUTH_SECRET` | JWT signing secret (`openssl rand -base64 32`) |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth credentials |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth credentials |
| `R2_ACCOUNT_ID` | Cloudflare R2 account id |
| `R2_ACCESS_KEY_ID` | R2 access key id |
| `R2_SECRET_ACCESS_KEY` | R2 secret access key |
| `R2_BUCKET` | R2 bucket name |
| `R2_ENDPOINT_URL` | R2 S3 endpoint (e.g. `https://<account>.r2.cloudflarestorage.com`) |
| `R2_JURISDICTION` | R2 bucket jurisdiction (e.g. `eu`) |
| `CRON_SECRET` | Bearer token guarding the `/api/cron/*` routes |
| `TWO_FA_ENCRYPTION_KEY` | 32-byte key encrypting 2FA secrets at rest |
| `NEXT_PUBLIC_APP_URL` | Public origin, used to build share/recovery links |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `EMAIL_FROM` | Optional sender override |
| `STRIPE_SECRET_KEY` | Stripe secret key (test mode: `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Webhook signing secret |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key |
| `STRIPE_PLUS_PRICE_ID` / `STRIPE_PRO_PRICE_ID` / `STRIPE_MAX_PRICE_ID` | Subscription plan price IDs |
| `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD` | Test user credentials for the Playwright suite |

## OAuth provider setup

Auth.js v5 signs in directly; the Supabase adapter uses the provider rows to
write users into `auth.users` on first sign-in. OAuth providers must be
configured in **both** the Supabase Auth dashboard **and** the provider's
developer console.

### Google

1. [Google Cloud Console](https://console.cloud.google.com/) → create/select a project.
2. **APIs & Services → OAuth consent screen** — configure the consent screen
   (scopes: `openid`, `email`, `profile`).
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000` (+ production origin).
   - Authorized redirect URIs: `http://localhost:3000/api/auth/callback/google` (+ production equivalent).
4. Copy the **Client ID** and **Client secret** into `.env.local`.
5. **Supabase dashboard → Authentication → Providers → Google** — enable and
   paste the same client ID and secret.

### GitHub

1. **GitHub → Settings → Developer settings → OAuth apps → New OAuth App**:
   - Homepage URL: `http://localhost:3000`.
   - Authorization callback URL: `http://localhost:3000/api/auth/callback/github`.
2. Copy the **Client ID** and generate a **client secret** into `.env.local`.
3. **Supabase dashboard → Authentication → Providers → GitHub** — enable and
   paste the same client ID and secret.

## Scripts

```bash
npm run dev              # next dev
npm run build            # next build
npm run start            # next start
npm run lint             # eslint
npm test                 # vitest (unit/integration)
npm run test:coverage    # vitest with coverage gates
npm run emails:render    # render React Email templates to emails/out/
npx tsc --noEmit         # typecheck
npx drizzle-kit generate # generate a new migration
npx drizzle-kit migrate  # apply pending migrations
npx playwright test      # E2E (see below)
```

### Tests

- **Vitest** runs with coverage gates (90% statements/branches/lines).
- **Playwright E2E** requires a running dev server and a test user whose
  credentials are set in `E2E_TEST_EMAIL` / `E2E_TEST_PASSWORD`, with 2FA
  disabled. Login-based specs run serially by design
  (`workers: 1, fullyParallel: false` in `playwright.config.ts`).

## Cron jobs

Three maintenance jobs run via Vercel Cron (`vercel.json`), each guarded by
the `CRON_SECRET` bearer token:

- `cleanup-stale-uploads` — purge upload rows whose R2 PUT never completed
- `cleanup-trash` — permanently delete files past the 30-day trash retention
- `cleanup-deleted-accounts` — finalize account-deletion requests

When self-hosting, point any cron daemon at the same `/api/cron/*` routes.

## Project structure

```
src/
├── app/
│   ├── (app)/                  # authenticated shell: drive, shares, trash, settings
│   ├── actions/                # server actions (typed Input/Output per action)
│   ├── api/
│   │   ├── auth/[...nextauth]/ # Auth.js route handler
│   │   ├── cron/               # maintenance endpoints (CRON_SECRET-guarded)
│   │   └── stripe/webhook/     # Stripe webhook
│   ├── s/[token]/              # public share preview page
│   ├── login/ signup/ forgot-password/ recover-account/ reset-password/ verify-2fa/ verify-email/
│   ├── layout.tsx              # root layout (fonts, toaster, Analytics)
│   ├── icon.png                # app icon (App Router convention)
│   └── page.tsx                # landing page
├── components/
│   ├── ui/                     # primitives (button, dialog, progress, ...)
│   ├── landing/                # marketing sections
│   └── *-row / *-list / *-grid # drive, folder, and trash views
├── contexts/                   # client state: drag, selection, file dialogs
├── hooks/                      # use-upload, use-view-mode
├── lib/                        # pure helpers (file utils, trash retention)
├── proxy.ts                    # Next.js proxy: session-aware routing
└── server/                     # leaf layer (see Architecture above)
```

## Deploying

The app is a standard Next.js 16 application. On **Vercel**, set the full
environment variable list in the project dashboard; the cron jobs in
`vercel.json` are picked up automatically. Self-hosting on Node 20 LTS also
works — serve behind a TLS-terminating proxy and point a cron daemon at the
`/api/cron/*` routes. `AUTH_SECRET` MUST be a long random string in
production.

## Notes

- The `users` table mirrors Supabase's `auth.users`. `generateUploadUrl`
  performs an `INSERT ... ON CONFLICT DO NOTHING` on every upload to keep
  the mirror in sync without race conditions.
- All file bytes flow browser → R2. The Next.js server only signs URLs and
  persists metadata. Files are currently stored plaintext; client-side
  end-to-end encryption is tracked in issue #15.
