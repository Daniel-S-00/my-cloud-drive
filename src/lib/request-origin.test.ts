// @vitest-environment node
import { describe, it, expect, vi, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => ({
  headerStore: { get: vi.fn() },
}));
vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(hoisted.headerStore),
}));

import { getRequestOrigin } from './request-origin';

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('getRequestOrigin', () => {
  it('prefers x-forwarded-host over host', async () => {
    hoisted.headerStore.get.mockImplementation((name: string) => {
      if (name === 'x-forwarded-host') return 'preview.vercel.app';
      if (name === 'x-forwarded-proto') return 'https';
      return null;
    });
    expect(await getRequestOrigin()).toBe('https://preview.vercel.app');
  });

  it('falls back to the host header', async () => {
    hoisted.headerStore.get.mockImplementation((name: string) => {
      if (name === 'host') return 'app.example.com';
      if (name === 'x-forwarded-proto') return 'https';
      return null;
    });
    expect(await getRequestOrigin()).toBe('https://app.example.com');
  });

  it('defaults the protocol to https', async () => {
    hoisted.headerStore.get.mockImplementation((name: string) => {
      if (name === 'host') return 'app.example.com';
      return null;
    });
    expect(await getRequestOrigin()).toBe('https://app.example.com');
  });

  it('strips a trailing slash from the host', async () => {
    hoisted.headerStore.get.mockImplementation((name: string) => {
      if (name === 'host') return 'app.example.com/';
      if (name === 'x-forwarded-proto') return 'https';
      return null;
    });
    expect(await getRequestOrigin()).toBe('https://app.example.com');
  });

  it('falls back to NEXT_PUBLIC_APP_URL when no host header exists', async () => {
    hoisted.headerStore.get.mockReturnValue(null);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://fallback.example.com/');
    expect(await getRequestOrigin()).toBe('https://fallback.example.com');
  });

  it('returns null when neither host nor env is available', async () => {
    hoisted.headerStore.get.mockReturnValue(null);
    vi.stubEnv('NEXT_PUBLIC_APP_URL', '');
    expect(await getRequestOrigin()).toBeNull();
  });
});
