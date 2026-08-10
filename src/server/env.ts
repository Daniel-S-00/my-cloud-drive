import 'server-only';

// NEXT_PUBLIC_APP_URL is deliberately NOT required here: it is only a
// fallback for building absolute links when no request host header is
// available (getRequestOrigin / buildShareUrl / buildRecoveryUrl all
// degrade to relative URLs or null when it is absent). Requiring it at
// boot made Vercel builds fail whenever the env is missing, unset, or
// scoped to a subset of environments.

const REQUIRED_PRODUCTION_ENV = [
  'AUTH_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'TWO_FA_ENCRYPTION_KEY',
  'RESEND_API_KEY',
] as const;

let validated = false;

export function validateProductionEnv(): void {
  if (validated) return;
  validated = true;

  if (process.env.NODE_ENV !== 'production') return;

  const missing: string[] = [];
  for (const name of REQUIRED_PRODUCTION_ENV) {
    if (!process.env[name]) {
      missing.push(name);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables in production: ${missing.join(', ')}`,
    );
  }
}
