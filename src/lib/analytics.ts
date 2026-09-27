type PostHogClient = (typeof import('posthog-js'))['default'];

export type AnalyticsEvent =
  | 'signup_started'
  | 'signup_completed'
  | 'login_started'
  | 'login_completed'
  | 'upload_completed'
  | 'share_created'
  | 'file_downloaded';

export type AnalyticsProperties = Record<
  string,
  string | number | boolean | null | undefined
>;

let clientPromise: Promise<PostHogClient | null> | null = null;
let initialized = false;

function posthogKey(): string | undefined {
  return process.env.NEXT_PUBLIC_POSTHOG_KEY;
}

function loadClient(): Promise<PostHogClient | null> {
  if (typeof window === 'undefined' || !posthogKey()) {
    return Promise.resolve(null);
  }
  clientPromise ??= import('posthog-js')
    .then((mod) => mod.default)
    .catch(() => null);
  return clientPromise;
}

async function ensureClient(): Promise<PostHogClient | null> {
  const key = posthogKey();
  const posthog = await loadClient();
  if (!posthog || !key) return null;
  if (!initialized) {
    posthog.init(key, {
      api_host:
        process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com',
      autocapture: false,
      capture_pageview: false,
      person_profiles: 'identified_only',
    });
    initialized = true;
  }
  return posthog;
}

export async function captureEvent(
  event: AnalyticsEvent,
  properties?: AnalyticsProperties,
): Promise<void> {
  const posthog = await ensureClient();
  posthog?.capture(event, properties);
}

export async function capturePageview(): Promise<void> {
  const posthog = await ensureClient();
  posthog?.capture('$pageview');
}
