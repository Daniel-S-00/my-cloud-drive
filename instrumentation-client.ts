import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

  // Performance tracing: sample everything locally, low rate in prod to
  // avoid noise/cost on high-traffic pages.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Replay every session in dev is noisy; keep it production-focused.
  replaysSessionSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
  replaysOnErrorSampleRate: process.env.NODE_ENV === "production" ? 1.0 : 0,

  // Only initialize when a DSN is present (dev without Sentry should not crash).
  enabled: Boolean(process.env.NEXT_PUBLIC_SENTRY_DSN),
});

// Instrument router navigations for performance tracing.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
