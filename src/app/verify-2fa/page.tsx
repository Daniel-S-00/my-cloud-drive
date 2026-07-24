import { Suspense } from 'react';
import Verify2FAContent from './verify-2fa-content';

export default function Verify2FAPage() {
  return (
    <Suspense fallback={null}>
      <Verify2FAContent />
    </Suspense>
  );
}
