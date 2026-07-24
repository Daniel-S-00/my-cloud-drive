import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { auth } from '@/server/auth/config';

const PUBLIC_PREFIXES = ['/login', '/signup', '/api/auth', '/auth', '/verify-email', '/recover-account', '/verify-2fa', '/s'];
const PUBLIC_EXACT = new Set<string>(['/login', '/signup']);
const ROOT_PATH = '/';

// Next.js 16 proxy loader accepts a default export.
export default async function proxy(req: NextRequest) {
  const isPublic =
    PUBLIC_EXACT.has(req.nextUrl.pathname) ||
    PUBLIC_PREFIXES.some(
      (p) =>
        req.nextUrl.pathname === p ||
        req.nextUrl.pathname.startsWith(`${p}/`),
    );

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

  if (isLoggedIn && (req.nextUrl.pathname === '/login' || req.nextUrl.pathname === '/signup')) {
    return NextResponse.redirect(new URL(ROOT_PATH, req.nextUrl.origin));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|splinecode)$).*)',
  ],
};
