import { headers } from 'next/headers';

/**
 * Derives the app origin from the actual request host
 * (x-forwarded-host / host), instead of NEXT_PUBLIC_APP_URL. This keeps
 * preview deployments correct: a request from
 * https://*-daniel-ss-projects-86a15ba6.vercel.app produces a URL on
 * that preview, not on production.
 *
 * Falls back to NEXT_PUBLIC_APP_URL when headers are unavailable (e.g.
 * serverless cold starts without forwarded headers). Returns null when
 * neither is available, so callers can fall back to a relative path.
 */
export async function getRequestOrigin(): Promise<string | null> {
  const headersList = await headers();
  const host =
    headersList.get('x-forwarded-host') ?? headersList.get('host');
  const proto = headersList.get('x-forwarded-proto') ?? 'https';
  if (host) {
    return `${proto}://${host.replace(/\/$/, '')}`;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '');
  return appUrl ? appUrl : null;
}
