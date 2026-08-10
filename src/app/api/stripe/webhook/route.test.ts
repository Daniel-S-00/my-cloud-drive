// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Stripe from 'stripe';

const hoisted = vi.hoisted(() => {
  const selectQueue: unknown[][] = [];
  const insertValuesLog: unknown[] = [];
  const updateSetLog: unknown[] = [];

  const db = {
    select: vi.fn().mockImplementation(() => ({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          limit: vi.fn().mockImplementation(() =>
            Promise.resolve(selectQueue.shift() ?? []),
          ),
        }),
      }),
    })),
    insert: vi.fn().mockImplementation(() => ({
      values: vi.fn().mockImplementation((v: unknown) => {
        insertValuesLog.push(v);
        return { onConflictDoUpdate: vi.fn().mockResolvedValue([]) };
      }),
    })),
    update: vi.fn().mockReturnValue({
      set: vi.fn().mockImplementation((obj: unknown) => {
        updateSetLog.push(obj);
        return { where: vi.fn().mockResolvedValue([]) };
      }),
    }),
    delete: vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue([]) }),
  };

  return { db, selectQueue, insertValuesLog, updateSetLog, captureException: vi.fn() };
});

vi.mock('@/server/db/client', () => ({ db: hoisted.db }));
vi.mock('@sentry/nextjs', () => ({
  captureException: hoisted.captureException,
}));

// Keep the real Stripe webhook signature verification (constructEvent /
// generateTestHeaderString) but mock only the network call made by the
// checkout.session.completed path (subscriptions.retrieve).
const retrieveMock = vi.fn();
vi.mock('stripe', async (importOriginal) => {
  const actual = await importOriginal<typeof import('stripe')>();
  const RealStripe = actual.default;
  return {
    default: vi.fn().mockImplementation(function (key: string) {
      const real = new RealStripe(key);
      return {
        webhooks: real.webhooks,
        subscriptions: { retrieve: retrieveMock },
      };
    }),
  };
});

import { POST } from './route';
import { PLANS } from '@/server/billing/plans';

const TEST_WEBHOOK_SECRET = 'whsec_test_secret';
const currentPeriodEnd = Math.floor(Date.now() / 1000) + 30 * 24 * 3600;

// ── API-version canary ─────────────────────────────────────────────────
// These fixtures are TYPED against the SDK's Stripe types at the SDK's
// pinned API version (ApiVersion in node_modules/stripe/cjs/apiVersion.js,
// currently 2026-07-29.dahlia). The webhook destination must be pinned to
// the same version. If Stripe's API version drifts (a recreated
// destination defaults to the newest version, or the SDK is bumped and a
// field moves), the fixture below stops type-checking and `tsc` fails
// loudly — instead of the webhook silently persisting null periods /
// wrong plans.
function subscriptionPayload(
  overrides: Record<string, unknown> = {},
): Stripe.Subscription {
  return {
    id: 'sub_123',
    object: 'subscription',
    status: 'active',
    metadata: { userId: 'u1' },
    customer: { id: 'cus_1', email: 'user@example.com' },
    cancel_at: null,
    items: {
      object: 'list',
      data: [
        {
          id: 'si_1',
          object: 'subscription_item',
          price: { id: 'price_plus_test' },
          current_period_end: currentPeriodEnd,
        },
      ],
      has_more: false,
      url: '/v1/subscription_items?subscription=sub_123',
    },
    ...overrides,
  } as unknown as Stripe.Subscription;
}

function invoicePayload(
  overrides: Record<string, unknown> = {},
): Stripe.Invoice {
  return {
    id: 'in_1',
    object: 'invoice',
    parent: {
      type: 'subscription',
      subscription_details: { subscription: 'sub_123' },
    },
    ...overrides,
  } as unknown as Stripe.Invoice;
}

async function signedEvent(
  payload: unknown,
  type = 'customer.subscription.updated',
): Promise<{ body: string; header: string }> {
  const stripe = new Stripe('sk_test_placeholder');
  const body = JSON.stringify({
    id: 'evt_test_1',
    object: 'event',
    type,
    data: { object: payload },
  });
  const header = stripe.webhooks.generateTestHeaderString({
    payload: body,
    secret: TEST_WEBHOOK_SECRET,
  });
  return { body, header };
}

function makeReq(body: string, header: string) {
  return {
    text: async () => body,
    headers: new Headers({ 'stripe-signature': header }),
  } as unknown as Parameters<typeof POST>[0];
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.selectQueue.length = 0;
  hoisted.insertValuesLog.length = 0;
  hoisted.updateSetLog.length = 0;
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder');
  vi.stubEnv('STRIPE_WEBHOOK_SECRET', TEST_WEBHOOK_SECRET);
  vi.stubEnv('STRIPE_PLUS_PRICE_ID', 'price_plus_test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
});
afterEach(() => vi.unstubAllEnvs());

describe('stripe webhook', () => {
  it('rejects a request without a signature header', async () => {
    const res = await POST({
      text: async () => '{}',
      headers: new Headers(),
    } as unknown as Parameters<typeof POST>[0]);
    expect(res.status).toBe(400);
  });

  it('rejects an invalid signature', async () => {
    const { body } = await signedEvent({});
    const res = await POST(makeReq(body, 't=0,v1=deadbeef'));
    expect(res.status).toBe(400);
  });

  it('acks unknown event types', async () => {
    const { body, header } = await signedEvent(
      subscriptionPayload(),
      'invoice.paid',
    );
    const req = makeReq(body, header);
    const res = await POST(req);
    expect(res.status).toBe(200);
    expect(hoisted.insertValuesLog).toHaveLength(0);
  });

  it('upserts a plus subscription row from customer.subscription.updated', async () => {
    const { body, header } = await signedEvent(subscriptionPayload());
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);

    expect(hoisted.insertValuesLog).toHaveLength(1);
    const inserted = hoisted.insertValuesLog[0] as Record<string, unknown>;
    expect(inserted.stripeSubscriptionId).toBe('sub_123');
    expect(inserted.userId).toBe('u1');
    expect(inserted.plan).toBe('plus');
    expect(inserted.status).toBe('active');
    expect(inserted.storageQuotaBytes).toBe(
      PLANS.plus.storageBytes,
    );
  });

  it('persists the billing period from items.data[0].current_period_end (API-version canary)', async () => {
    // The fixture pins the exact field the route reads at the SDK's API
    // version (2026-07-29.dahlia). If a future Stripe bump moves the
    // period end off the subscription item, this test fails loudly
    // instead of silently persisting a null period.
    const { body, header } = await signedEvent(subscriptionPayload());
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    const inserted = hoisted.insertValuesLog[0] as Record<string, unknown>;
    expect(inserted.currentPeriodEnd).toBeInstanceOf(Date);
    expect((inserted.currentPeriodEnd as Date).getTime()).toBe(
      currentPeriodEnd * 1000,
    );
  });

  it('resolves the subscription from invoice.parent.subscription_details (API-version canary)', async () => {
    // Same idea for invoice.payment_failed: the route reads the sub id
    // from parent.subscription_details.subscription.
    retrieveMock.mockResolvedValue(
      subscriptionPayload({ status: 'past_due' }),
    );
    const { body, header } = await signedEvent(
      invoicePayload(),
      'invoice.payment_failed',
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(retrieveMock).toHaveBeenCalledWith('sub_123');
    expect(hoisted.insertValuesLog[0]).toMatchObject({
      stripeSubscriptionId: 'sub_123',
      status: 'past_due',
    });
  });

  it('reports to Sentry when an active subscription lacks current_period_end (drift guard)', async () => {
    // Simulate an active sub with the period end field missing/moved —
    // the drift scenario. The webhook must surface it, not silently
    // persist a null period.
    const { body, header } = await signedEvent(
      subscriptionPayload({
        items: { data: [{ id: 'si_1', price: { id: 'price_plus_test' } }] },
      }),
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(hoisted.captureException).toHaveBeenCalledTimes(1);
    expect(hoisted.captureException).toHaveBeenCalledWith(
      expect.any(Error),
    );
    const err = hoisted.captureException.mock.calls[0][0] as Error;
    expect(err.message).toMatch(/no current_period_end/);
    expect(err.message).toMatch(/API version drift/);
  });

  it('does not report when current_period_end is present', async () => {
    const { body, header } = await signedEvent(subscriptionPayload());
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(hoisted.captureException).not.toHaveBeenCalled();
  });

  it('falls back to email lookup when metadata is missing', async () => {
    hoisted.selectQueue.push([{ id: 'u_by_email' }]);
    const { body, header } = await signedEvent(
      subscriptionPayload({ metadata: {}, customer: { id: 'cus_1', email: 'user@example.com' } }),
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(hoisted.insertValuesLog[0]).toMatchObject({ userId: 'u_by_email' });
  });

  it('maps an unknown price to a canceled free plan', async () => {
    const { body, header } = await signedEvent(
      subscriptionPayload({ items: { data: [{ price: { id: 'price_retired' } }] } }),
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(hoisted.insertValuesLog[0]).toMatchObject({
      plan: 'free',
      status: 'canceled',
      storageQuotaBytes: null,
    });
  });

  it('handles checkout.session.completed by retrieving the subscription', async () => {
    retrieveMock.mockResolvedValue(subscriptionPayload());
    const { body, header } = await signedEvent(
      {
        id: 'cs_1',
        subscription: 'sub_123',
      },
      'checkout.session.completed',
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(retrieveMock).toHaveBeenCalledWith('sub_123');
    expect(hoisted.insertValuesLog[0]).toMatchObject({
      stripeSubscriptionId: 'sub_123',
      plan: 'plus',
    });
  });

  it('acks checkout.session.completed when the subscription is missing', async () => {
    const { body, header } = await signedEvent(
      { id: 'cs_1', subscription: null },
      'checkout.session.completed',
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(hoisted.insertValuesLog).toHaveLength(0);
  });

  it('throws when STRIPE_WEBHOOK_SECRET is missing (boot misconfig)', async () => {
    vi.stubEnv('STRIPE_WEBHOOK_SECRET', '');
    const { body, header } = await signedEvent(subscriptionPayload());
    await expect(POST(makeReq(body, header))).rejects.toThrow(
      'STRIPE_WEBHOOK_SECRET is not defined',
    );
  });

  it('handles invoice.payment_failed by upserting the past_due subscription', async () => {
    retrieveMock.mockResolvedValue(
      subscriptionPayload({ status: 'past_due' }),
    );
    const { body, header } = await signedEvent(
      {
        id: 'in_1',
        parent: {
          type: 'subscription',
          subscription_details: { subscription: 'sub_123' },
        },
      },
      'invoice.payment_failed',
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(retrieveMock).toHaveBeenCalledWith('sub_123');
    expect(hoisted.insertValuesLog[0]).toMatchObject({
      stripeSubscriptionId: 'sub_123',
      plan: 'plus',
      status: 'past_due',
    });
  });

  it('acks invoice.payment_failed when the subscription id is missing', async () => {
    const { body, header } = await signedEvent(
      { id: 'in_1', parent: null },
      'invoice.payment_failed',
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(200);
    expect(retrieveMock).not.toHaveBeenCalled();
    expect(hoisted.insertValuesLog).toHaveLength(0);
  });

  it('returns 500 when the user cannot be resolved (Stripe retries)', async () => {
    // No metadata and no email match.
    hoisted.selectQueue.push([]);
    const { body, header } = await signedEvent(
      subscriptionPayload({ metadata: {}, customer: { id: 'cus_1' } }),
    );
    const res = await POST(makeReq(body, header));
    expect(res.status).toBe(500);
  });
});
