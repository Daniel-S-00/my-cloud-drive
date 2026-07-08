import type { ReactNode } from 'react';
import SplineBackground from './spline-background';

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-base px-4 py-12 text-text-primary">
      <SplineBackground />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-white/10 bg-bg-base/70 shadow-2xl backdrop-blur-xl">
        {children}
      </div>
    </div>
  );
}
