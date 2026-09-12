'use client';

import {
  Component,
  useCallback,
  useEffect,
  useSyncExternalStore,
  useState,
  type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import type { Application } from '@splinetool/runtime';
import {
  isWebglCapable,
  subscribeWebglCapability,
} from '@/lib/webgl-capability';

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
});

// The scene is rendered at a fraction of the viewport and upscaled by
// CSS. It's an atmospheric background behind a card, so the slight
// softness is invisible while the fill-rate (and GPU cost) drops.
const RENDER_SCALE = 0.7;

function StaticBackdrop() {
  return (
    <div className="absolute inset-0 overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(67_136_221/0.18),transparent_55%)]" />
      <div className="drafting-grid absolute inset-0" />
      <div className="landing-grain absolute inset-0" />
      <div className="absolute -left-24 top-1/3 h-72 w-72 rounded-full bg-accent-primary/10 blur-[100px]" />
      <div className="absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-accent-glow/10 blur-[120px]" />
    </div>
  );
}

class SplineErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { fallback: ReactNode; children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <>{this.props.fallback}</>;
    }
    return <>{this.props.children}</>;
  }
}

export default function SplineBackground() {
  // useSyncExternalStore keeps the decision hydration-safe: the server
  // snapshot is a constant `false` (static backdrop) because that's
  // what SSR renders; the client snapshot swaps in the real value
  // after hydration. Passing the same function for both would make the
  // client compute "server snapshot = true" and mismatch the HTML.
  const capable = useSyncExternalStore(
    subscribeWebglCapability,
    isWebglCapable,
    () => false,
  );
  const [app, setApp] = useState<Application | null>(null);

  const onLoad = useCallback((spline: Application) => {
    setApp(spline);
  }, []);

  useEffect(() => {
    if (!app) return;

    // Render at a capped resolution and let CSS upscale. setSize() opts
    // the runtime out of its automatic full-size resize, but it installs
    // a ResizeObserver ~300ms after load that re-reads the container and
    // would undo the cap, so keep re-applying briefly until it settles.
    const applyResolution = () => {
      const w = Math.max(320, Math.round(window.innerWidth * RENDER_SCALE));
      const h = Math.max(320, Math.round(window.innerHeight * RENDER_SCALE));
      app.setSize(w, h);
    };

    applyResolution();
    const settleTimer = window.setInterval(applyResolution, 500);
    const settleEnd = window.setTimeout(() => {
      window.clearInterval(settleTimer);
    }, 5000);

    // The scene is a background — nobody is looking when the tab is
    // hidden or the window is blurred. Stop rendering to save the GPU.
    const onVisibility = () => {
      if (document.hidden) {
        app.stop();
      } else {
        app.play();
      }
    };
    const onBlur = () => app.stop();
    const onFocus = () => app.play();

    window.addEventListener('resize', applyResolution);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(settleTimer);
      window.clearTimeout(settleEnd);
      window.removeEventListener('resize', applyResolution);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('blur', onBlur);
      window.removeEventListener('focus', onFocus);
    };
  }, [app]);

  if (!capable) {
    return <StaticBackdrop />;
  }

  return (
    <div className="absolute inset-0 overflow-hidden">
      <SplineErrorBoundary fallback={<StaticBackdrop />}>
        <Spline
          scene="/scene.splinecode"
          className="h-full w-full"
          onLoad={onLoad}
        />
      </SplineErrorBoundary>
    </div>
  );
}
