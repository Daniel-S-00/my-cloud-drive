// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const createMock = vi.fn();
  const updateMock = vi.fn();
  const selectQueue: unknown[][] = [];
  const whereCalls: unknown[][] = [];
  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockImplementation((...args: unknown[]) => {
          whereCalls.push(args);
          return {
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(() =>
                Promise.resolve(selectQueue.shift() ?? []),
              ),
            })),
            limit: vi.fn().mockImplementation(() =>
              Promise.resolve(selectQueue.shift() ?? []),
            ),
          };
        }),
      }),
    })),
    insert: vi.fn().mockReturnValue({ values: vi.fn().mockResolvedValue([]) }),
    update: vi.fn().mockImplementation(() => ({
      set: vi.fn().mockResolvedValue({}),
    })),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };
  return {
    createMock,
    updateMock,
    selectQueue,
    whereCalls,
    db,
    getCurrentUser: vi.fn(),
    getRequestOrigin: vi.fn(),
  };
});

vi.mock('@/server/auth/session', () => ({
  getCurrentUser: hoisted.getCurrentUser,
}));
vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('@/lib/request-origin', () => ({
  getRequestOrigin: hoisted.getRequestOrigin,
}));

// Mock the Stripe SDK's checkout.sessions.create while keeping the real
// constructor so the class type still resolves. Must be a `function` (not
// an arrow) so `new Stripe(...)` in the action works.
const sessionCreateMock = hoisted.createMock;
vi.mock('stripe', () => {
  return {
    default: vi.fn().mockImplementation(function () {
      return {
        checkout: { sessions: { create: sessionCreateMock } },
        subscriptions: { update: hoisted.updateMock },
      };
    }),
  };
});

import {
  cancelSubscription,
  createPlusCheckoutSession,
  getSubscriptionStatus,
} from './billing';

const currentUser = { id: 'u1', email: 'user@example.com', name: null, image: null };

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectQueue.length = 0;
  hoisted.whereCalls.length = 0;
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder');
  vi.stubEnv('STRIPE_PLUS_PRICE_ID', 'price_plus_test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
  hoisted.getCurrentUser.mockResolvedValue(currentUser);
  hoisted.getRequestOrigin.mockResolvedValue('https://app.example.com');
});
afterEach(() => vi.unstubAllEnvs());

describe('createPlusCheckoutSession', () => {
  it('creates a subscription checkout session and returns its URL', async () => {
    sessionCreateMock.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/x' });

    const result = await createPlusCheckoutSession();

    expect(result.ok).toBe(true);
    expect(result.url).toBe('https://checkout.stripe.com/c/pay/x');
    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'subscription',
        line_items: [{ price: 'price_plus_test', quantity: 1 }],
        metadata: { userId: 'u1' },
        subscription_data: { metadata: { userId: 'u1' } },
        client_reference_id: 'u1',
        customer_email: 'user@example.com',
        success_url: 'https://app.example.com/drive?upgrade=success',
        cancel_url: 'https://app.example.com/drive',
      }),
    );
  });

  it('builds success/cancel URLs from the request origin (preview-safe)', async () => {
    hoisted.getRequestOrigin.mockResolvedValue('https://my-pr-42.vercel.app');
    sessionCreateMock.mockResolvedValue({ url: 'https://checkout.stripe.com/c/pay/x' });

    await createPlusCheckoutSession();

    expect(sessionCreateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        success_url: 'https://my-pr-42.vercel.app/drive?upgrade=success',
        cancel_url: 'https://my-pr-42.vercel.app/drive',
      }),
    );
  });

  it('returns a config error when STRIPE_PLUS_PRICE_ID is missing', async () => {
    vi.stubEnv('STRIPE_PLUS_PRICE_ID', '');
    const result = await createPlusCheckoutSession();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Billing is not configured/);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('returns a config error when STRIPE_SECRET_KEY is missing', async () => {
    vi.stubEnv('STRIPE_SECRET_KEY', '');
    const result = await createPlusCheckoutSession();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Something went wrong/);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });

  it('returns an error when the session has no URL', async () => {
    sessionCreateMock.mockResolvedValue({ url: null });
    const result = await createPlusCheckoutSession();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Could not create the checkout session/);
  });

  it('returns a generic error when checkout creation fails', async () => {
    sessionCreateMock.mockRejectedValue(new Error('boom'));
    const result = await createPlusCheckoutSession();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Something went wrong/);
  });

  it('throws for unauthenticated users', async () => {
    hoisted.getCurrentUser.mockRejectedValue(new Error('UNAUTHORIZED'));
    const result = await createPlusCheckoutSession();
    expect(result.ok).toBe(false);
    expect(sessionCreateMock).not.toHaveBeenCalled();
  });
});

describe('getSubscriptionStatus', () => {
  it('returns null when the user has no subscription', async () => {
    hoisted.selectQueue.push([]);
    const result = await getSubscriptionStatus();
    expect(result).toBeNull();
  });

  it('flags an active paid plan as subscribed', async () => {
    hoisted.selectQueue.push([
      {
        plan: 'plus',
        status: 'active',
        storageQuotaBytes: 100 * 1024 ** 3,
        currentPeriodEnd: new Date(),
        cancelAtPeriodEnd: null,
        stripeSubscriptionId: 'sub_123',
      },
    ]);
    const result = await getSubscriptionStatus();
    expect(result?.isActive).toBe(true);
    expect(result?.plan).toBe('plus');
  });

  it('does not flag a canceled or free plan as active', async () => {
    hoisted.selectQueue.push([
      {
        plan: 'free',
        status: 'canceled',
        storageQuotaBytes: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null,
        stripeSubscriptionId: null,
      },
    ]);
    const result = await getSubscriptionStatus();
    expect(result?.isActive).toBe(false);
  });

  it('keeps a canceled plan active during the paid soft-landing period', async () => {
    hoisted.selectQueue.push([
      {
        plan: 'plus',
        status: 'canceled',
        storageQuotaBytes: 100 * 1024 ** 3,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        cancelAtPeriodEnd: null,
        stripeSubscriptionId: 'sub_123',
      },
    ]);
    const result = await getSubscriptionStatus();
    // The user canceled immediately but already paid for the current
    // period — the plan badge/quote stays until that period ends.
    expect(result?.isActive).toBe(true);
  });

  it('keeps a past_due plan active during the grace period (Option A)', async () => {
    hoisted.selectQueue.push([
      {
        plan: 'plus',
        status: 'past_due',
        storageQuotaBytes: 100 * 1024 ** 3,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        cancelAtPeriodEnd: null,
        stripeSubscriptionId: 'sub_123',
      },
    ]);
    const result = await getSubscriptionStatus();
    // Churn policy Option A: a failed renewal keeps the paid quota until
    // the period the user already paid for ends.
    expect(result?.isActive).toBe(true);
    expect(result?.status).toBe('past_due');
  });
});

describe('cancelSubscription', () => {
  it('cancels an active plus subscription at period end', async () => {
    hoisted.selectQueue.push([
      {
        stripeSubscriptionId: 'sub_123',
        plan: 'plus',
        status: 'active',
        cancelAtPeriodEnd: null,
      },
    ]);
    hoisted.updateMock.mockResolvedValue({ cancel_at_period_end: true });

    const result = await cancelSubscription();

    expect(result.ok).toBe(true);
    expect(result.cancelAtPeriodEnd).toBe(true);
    expect(hoisted.updateMock).toHaveBeenCalledWith(
      'sub_123',
      { cancel_at_period_end: true },
    );
  });

  it('only targets active subscriptions (never a stale canceled row)', async () => {
    // Simulate the DB returning no rows because the WHERE filter excludes
    // the stale canceled subscription.
    hoisted.selectQueue.push([]);
    const result = await cancelSubscription();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No active subscription/);
    expect(hoisted.updateMock).not.toHaveBeenCalled();

    // The query must filter on status = 'active' so a canceled row is
    // never selected for Stripe cancellation (the regression: it was
    // picking the old canceled sub and Stripe rejected the update). The
    // where predicate is a drizzle `and([...])` whose parts serialize
    // with the column + value.
    // The query must filter on status = 'active' so a canceled row is
    // never selected for Stripe cancellation (the regression: it was
    // picking the old canceled sub and Stripe rejected the update). The
    // where predicate is a drizzle `and([...])` whose parts carry the
    // column's name and the compared value; stringify with a replacer
    // that skips circular table refs.
    const cancelWhere = hoisted.whereCalls
      .at(-1)?.[0] as unknown[];
    const serialized = JSON.stringify(cancelWhere, (_k, v) => {
      if (v && typeof v === 'object' && 'table' in v && 'name' in v) {
        return `col:${(v as { name?: string }).name}`;
      }
      return v;
    });
    expect(serialized).toContain('active');
  });

  it('errors when the Stripe call fails', async () => {
    hoisted.selectQueue.push([
      {
        stripeSubscriptionId: 'sub_123',
        plan: 'plus',
        status: 'active',
        cancelAtPeriodEnd: null,
      },
    ]);
    hoisted.updateMock.mockRejectedValue(new Error('boom'));
    const result = await cancelSubscription();
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/Something went wrong/);
  });
});
