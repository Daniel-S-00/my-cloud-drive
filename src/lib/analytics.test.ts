// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  init: vi.fn(),
  capture: vi.fn(),
}));

vi.mock('posthog-js', () => ({
  default: {
    init: hoisted.init,
    capture: hoisted.capture,
  },
}));

async function loadAnalytics() {
  vi.resetModules();
  return import('./analytics');
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('analytics', () => {
  it('does not load or capture when the PostHog key is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', '');
    const { captureEvent } = await loadAnalytics();

    await captureEvent('file_downloaded');

    expect(hoisted.init).not.toHaveBeenCalled();
    expect(hoisted.capture).not.toHaveBeenCalled();
  });

  it('initializes PostHog once and forwards events', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    const { captureEvent } = await loadAnalytics();

    await captureEvent('upload_completed', { file_count: 2 });
    await captureEvent('file_downloaded');

    expect(hoisted.init).toHaveBeenCalledTimes(1);
    expect(hoisted.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({
        autocapture: false,
        capture_pageview: false,
      }),
    );
    expect(hoisted.capture).toHaveBeenNthCalledWith(1, 'upload_completed', {
      file_count: 2,
    });
    expect(hoisted.capture).toHaveBeenNthCalledWith(
      2,
      'file_downloaded',
      undefined,
    );
  });

  it('captures pageviews through the same client and honors the host override', async () => {
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_KEY', 'phc_test');
    vi.stubEnv('NEXT_PUBLIC_POSTHOG_HOST', 'https://eu.i.posthog.com');
    const { capturePageview } = await loadAnalytics();

    await capturePageview();

    expect(hoisted.init).toHaveBeenCalledWith(
      'phc_test',
      expect.objectContaining({ api_host: 'https://eu.i.posthog.com' }),
    );
    expect(hoisted.capture).toHaveBeenCalledWith('$pageview');
  });
});
