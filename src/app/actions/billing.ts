'use server';

import Stripe from 'stripe';
import { getCurrentUser } from '@/server/auth/session';

export type CreateCheckoutResult = {
  ok: boolean;
  error?: string;
  url?: string;
};

function getStripe(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not defined');
  }
  return new Stripe(apiKey);
}

/**
 * Create a hosted Checkout Session for the Plus plan. The client is
 * redirected to session.url, Stripe hosts the payment page, and the
 * result is applied by the /api/stripe/webhook route.
 *
 * Only the webhook writes plan state — this action never touches the DB.
 */
export async function createPlusCheckoutSession(): Promise<CreateCheckoutResult> {
  try {
    const priceId = process.env.STRIPE_PLUS_PRICE_ID;
    if (!priceId) {
      return { ok: false, error: 'Billing is not configured.' };
    }

    const user = await getCurrentUser();

    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      // userId travels server-side only (metadata + client_reference_id);
      // email pre-fills the checkout form.
      metadata: { userId: user.id },
      client_reference_id: user.id,
      ...(user.email ? { customer_email: user.email } : {}),
      success_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/drive?upgrade=success`,
      cancel_url: `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/drive`,
    });

    if (!session.url) {
      return { ok: false, error: 'Could not create the checkout session.' };
    }

    return { ok: true, url: session.url };
  } catch (err) {
    console.error('[billing] createPlusCheckoutSession failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
}
