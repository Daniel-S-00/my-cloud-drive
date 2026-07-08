'use client';

import { Component } from 'react';
import dynamic from 'next/dynamic';

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
});

class SplineErrorBoundary extends Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return <>{this.props.children}</>;
  }
}

export default function SplineBackground() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <SplineErrorBoundary>
        <Spline scene="/scene.splinecode" className="h-full w-full" />
      </SplineErrorBoundary>
    </div>
  );
}
