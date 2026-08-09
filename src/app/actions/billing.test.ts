// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const hoisted = vi.hoisted(() => {
  const createMock = vi.fn();
  return {
    createMock,
    getCurrentUser: vi.fn(),
  };
});

vi.mock('@/server/auth/session', () => ({
  getCurrentUser: hoisted.getCurrentUser,
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
      };
    }),
  };
});

import { createPlusCheckoutSession } from './billing';

const currentUser = { id: 'u1', email: 'user@example.com', name: null, image: null };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder');
  vi.stubEnv('STRIPE_PLUS_PRICE_ID', 'price_plus_test');
  vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://app.example.com');
  hoisted.getCurrentUser.mockResolvedValue(currentUser);
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
        client_reference_id: 'u1',
        customer_email: 'user@example.com',
        success_url: 'https://app.example.com/drive?upgrade=success',
        cancel_url: 'https://app.example.com/drive',
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
