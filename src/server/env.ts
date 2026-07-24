import 'server-only';

const REQUIRED_PRODUCTION_ENV = [
  'AUTH_SECRET',
  'SUPABASE_SERVICE_ROLE_KEY',
  'CRON_SECRET',
  'TWO_FA_ENCRYPTION_KEY',
  'NEXT_PUBLIC_APP_URL',
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
