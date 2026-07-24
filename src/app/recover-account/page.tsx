import { Suspense } from 'react';
import RecoverAccountContent from './recover-account-content';

export default function RecoverAccountPage() {
  return (
    <Suspense fallback={null}>
      <RecoverAccountContent />
    </Suspense>
  );
}
