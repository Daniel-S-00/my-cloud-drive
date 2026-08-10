import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/server/auth/config';

// Webhook/cron endpoints do their own auth (Stripe signature, CRON_SECRET
// bearer) and are called by external systems without a browser session —
// they must pass through the proxy untouched.
const PUBLIC_PREFIXES = [
  '/login',
  '/signup',
  '/api/auth',
  '/api/stripe',
  '/api/cron',
  '/auth',
  '/verify-email',
  '/recover-account',
  '/verify-2fa',
  '/forgot-password',
  '/reset-password',
  '/s',
];
const PUBLIC_EXACT = new Set<string>(['/', '/login', '/signup']);
const DRIVE_PATH = '/drive';

// Next.js 16 proxy loader accepts a default export.
export default async function proxy(req: NextRequest) {
  const isPublic =
    PUBLIC_EXACT.has(req.nextUrl.pathname) ||
    PUBLIC_PREFIXES.some(
      (p) =>
        req.nextUrl.pathname === p ||
        req.nextUrl.pathname.startsWith(`${p}/`),
    );

  // Public, but session-aware: authenticated users should land on
  // their drive, never on the marketing page or the auth screens.
  const sessionAwarePublic =
    req.nextUrl.pathname === '/' ||
    req.nextUrl.pathname === '/login' ||
    req.nextUrl.pathname === '/signup' ||
    req.nextUrl.pathname === '/recover-account' ||
    req.nextUrl.pathname === '/forgot-password' ||
    req.nextUrl.pathname === '/reset-password' ||
    req.nextUrl.pathname === '/verify-email';
  if (sessionAwarePublic) {
    const session = await auth();
    if (session) {
      return NextResponse.redirect(new URL(DRIVE_PATH, req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  // /verify-2fa is part of the login flow — a pending-2fa-token cookie
  // marks an in-progress challenge where no session exists yet. Only
  // bounce fully-authenticated users who land here with no pending
  // challenge (e.g. they typed the URL).
  if (req.nextUrl.pathname === '/verify-2fa') {
    const pending = req.cookies.get('pending-2fa-token')?.value;
    if (!pending) {
      const session = await auth();
      if (session) {
        return NextResponse.redirect(new URL(DRIVE_PATH, req.nextUrl.origin));
      }
    }
    return NextResponse.next();
  }

  // Let public routes and API routes pass through without auth check.
  if (isPublic) {
    return NextResponse.next();
  }

  const session = await auth();
  const isLoggedIn = Boolean(session);

  if (!isLoggedIn) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set(
      'callbackUrl',
      `${req.nextUrl.pathname}${req.nextUrl.search}`,
    );
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|splinecode)$).*)',
  ],
};
