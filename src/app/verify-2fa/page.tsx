import { Suspense } from 'react';
import { cookies } from 'next/headers';
import Verify2FAContent from './verify-2fa-content';

export default async function Verify2FAPage() {
  // Prefer the httpOnly cookie set by the auth config; fall back to
  // the ?token= query param for the OAuth redirect path.
  const cookieStore = await cookies();
  const cookieToken = cookieStore.get('pending-2fa-token')?.value ?? null;

  return (
    <Suspense fallback={null}>
      <Verify2FAContent cookieToken={cookieToken} />
    </Suspense>
  );
}
