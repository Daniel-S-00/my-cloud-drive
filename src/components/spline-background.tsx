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
  backgroundRenderSize,
  hasHardwareWebgl,
  isWebglCapable,
  pickBackgroundTier,
  subscribeWebglCapability,
  type BackgroundTier,
} from '@/lib/webgl-capability';
import { useSceneBudget } from '@/hooks/use-scene-budget';

const Spline = dynamic(() => import('@splinetool/react-spline'), {
  ssr: false,
});

/**
 * Same policy as the hero scene: start on the first idle moment rather than
 * racing hydration for the main thread. Parsing the file and compiling its
 * shaders is the most expensive thing these pages do, and it is decoration
 * behind a card — nothing is lost by letting the page paint first. The
 * fallback covers Safari, which has no requestIdleCallback.
 */
const IDLE_TIMEOUT_MS = 1200;
const IDLE_FALLBACK_MS = 200;

function deferUntilIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(callback, {
      timeout: IDLE_TIMEOUT_MS,
    });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, IDLE_FALLBACK_MS);
  return () => window.clearTimeout(handle);
}

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
  // Read once: the hints describe the machine, which does not change under
  // us, and asking again per render would be a new object every time.
  const [tier] = useState<BackgroundTier>(() => pickBackgroundTier());
  const [started, setStarted] = useState(false);
  // Assumed until the idle check runs: the last gate is the only one that
  // needs a GPU to answer, so it is worth asking for one only when the
  // scene is about to be built anyway.
  const [hardware, setHardware] = useState(true);
  const verdict = useSceneBudget(started);

  const dropped = !hardware || verdict === 'drop';
  const sizeTier: BackgroundTier = verdict === 'lean' ? 'lite' : tier;

  const onLoad = useCallback((spline: Application) => {
    setApp(spline);
  }, []);

  useEffect(() => {
    if (!capable || started || dropped) return;

    let cancelled = false;
    const cancel = deferUntilIdle(() => {
      if (cancelled) return;
      // A context the browser would have to draw in software is worse than
      // no scene at all, and the browser says so for free.
      if (!hasHardwareWebgl()) {
        setHardware(false);
        return;
      }
      setStarted(true);
    });

    return () => {
      cancelled = true;
      cancel();
    };
  }, [capable, started, dropped]);

  useEffect(() => {
    if (!app) return;

    // Render at a capped resolution and let CSS upscale. setSize() opts
    // the runtime out of its automatic full-size resize, but it installs
    // a ResizeObserver ~300ms after load that re-reads the container and
    // would undo the cap, so keep re-applying briefly until it settles.
    const applyResolution = () => {
      const { width, height } = backgroundRenderSize(
        { width: window.innerWidth, height: window.innerHeight },
        sizeTier,
      );
      app.setSize(width, height);
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
  }, [app, sizeTier]);

  // `dropped` is the scene giving up on itself, either because the browser
  // has no hardware path or because the probe watched it miss most of the
  // frames. Unmounting is what frees it: the wrapper disposes the runtime,
  // which hands the WebGL context back.
  if (!capable || dropped) {
    return <StaticBackdrop />;
  }

  return (
    // The scene answers the pointer with hover states, and every one of
    // those is a ray cast against the whole scene. On the lean tier — a weak
    // machine to begin with, or one the probe caught struggling — that trade
    // does not pay, so the canvas stops taking pointer events and the
    // renderer never has to hunt for what is under the cursor.
    <div
      className={
        sizeTier === 'lite'
          ? 'pointer-events-none absolute inset-0 overflow-hidden'
          : 'absolute inset-0 overflow-hidden'
      }
    >
      <SplineErrorBoundary fallback={<StaticBackdrop />}>
        {started ? (
          <Spline
            scene="/scene.splinecode"
            className="h-full w-full"
            onLoad={onLoad}
          />
        ) : null}
      </SplineErrorBoundary>
    </div>
  );
}
