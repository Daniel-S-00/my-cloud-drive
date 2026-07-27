import { Suspense } from 'react';
import ForgotPasswordContent from './forgot-password-content';

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordContent />
    </Suspense>
  );
}