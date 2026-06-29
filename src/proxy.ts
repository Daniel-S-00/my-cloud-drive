import { NextResponse } from 'next/server';
import { auth } from '@/server/auth/config';

const PUBLIC_PREFIXES = ['/login', '/signup', '/api/auth'];
const PUBLIC_EXACT = new Set<string>(['/login', '/signup']);
const ROOT_PATH = '/';

// Export DIRECTO del wrapper de auth - esto es lo que Next.js 16 espera
export default auth((req) => {
  const isLoggedIn = Boolean(req.auth);
  const { pathname, search } = req.nextUrl;

  const isPublic =
    PUBLIC_EXACT.has(pathname) ||
    PUBLIC_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    );

  if (!isLoggedIn && !isPublic) {
    const url = new URL('/login', req.nextUrl.origin);
    url.searchParams.set('callbackUrl', `${pathname}${search}`);
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL(ROOT_PATH, req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico)$).*)',
  ],
};