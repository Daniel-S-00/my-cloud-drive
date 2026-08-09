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

  return { db, selectQueue, insertValuesLog, updateSetLog };
});

vi.mock('@/server/db/client', () => ({ db: hoisted.db }));

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

function subscriptionPayload(overrides: Record<string, unknown> = {}) {
  return {
    id: 'sub_123',
    object: 'subscription',
    status: 'active',
    metadata: { userId: 'u1' },
    customer: { id: 'cus_1', email: 'user@example.com' },
    cancel_at: null,
    items: {
      data: [
        {
          price: { id: 'price_plus_test' },
          current_period_end: currentPeriodEnd,
        },
      ],
    },
    ...overrides,
  };
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
    // Matches PLANS.plus.storageBytes — which is 100 MB under the
    // temporary test quota.
    expect(inserted.storageQuotaBytes).toBe(
      PLANS.plus.storageBytes,
    );
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
