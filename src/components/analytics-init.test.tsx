// @vitest-environment jsdom
import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  capturePageview: vi.fn().mockResolvedValue(undefined),
  pathname: { current: '/drive' },
}));

vi.mock('@/lib/analytics', () => ({
  capturePageview: hoisted.capturePageview,
}));

vi.mock('next/navigation', () => ({
  usePathname: () => hoisted.pathname.current,
}));

import { AnalyticsInit } from './analytics-init';

beforeEach(() => {
  hoisted.capturePageview.mockClear();
  hoisted.pathname.current = '/drive';
});

describe('AnalyticsInit', () => {
  it('captures a pageview on mount', async () => {
    render(<AnalyticsInit />);

    await vi.waitFor(() =>
      expect(hoisted.capturePageview).toHaveBeenCalledTimes(1),
    );
  });

  it('captures again when the route changes', async () => {
    const { rerender } = render(<AnalyticsInit />);
    await vi.waitFor(() =>
      expect(hoisted.capturePageview).toHaveBeenCalledTimes(1),
    );

    hoisted.pathname.current = '/login';
    rerender(<AnalyticsInit />);

    await vi.waitFor(() =>
      expect(hoisted.capturePageview).toHaveBeenCalledTimes(2),
    );
  });
});
