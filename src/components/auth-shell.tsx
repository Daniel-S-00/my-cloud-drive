'use client';

import { useCallback, type ReactNode } from 'react';
import SplineBackground from './spline-background';

export default function AuthShell({ children }: { children: ReactNode }) {
  const resetSplineHover = useCallback(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;

    const phantom = {
      clientX: -10000,
      clientY: -10000,
      bubbles: true,
      cancelable: true,
    };

    canvas.dispatchEvent(
      new PointerEvent('pointermove', {
        ...phantom,
        pointerId: 1,
        pointerType: 'mouse',
      }),
    );
    canvas.dispatchEvent(new MouseEvent('mousemove', phantom));
  }, []);

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-bg-base px-4 py-12 text-text-primary">
      <SplineBackground />
      <div
        onMouseEnter={resetSplineHover}
        onPointerEnter={resetSplineHover}
        className="relative z-10 w-full max-w-sm rounded-xl border border-white/10 bg-bg-base/70 shadow-2xl backdrop-blur-xl"
      >
        {children}
      </div>
    </div>
  );
}
