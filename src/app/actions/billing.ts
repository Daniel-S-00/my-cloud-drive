'use server';

import Stripe from 'stripe';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { getCurrentUser } from '@/server/auth/session';
import { db } from '@/server/db/client';
import { subscriptions } from '@/server/db/schema';

export type CreateCheckoutResult = {
  ok: boolean;
  error?: string;
  url?: string;
};

export type SubscriptionStatusResult = {
  ok: boolean;
  plan: string;
  status: string | null;
  storageQuotaBytes: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  /** True when the user currently holds an active paid plan. */
  isActive: boolean;
};

export type CancelSubscriptionResult = {
  ok: boolean;
  error?: string;
  cancelAtPeriodEnd?: boolean;
};

function getStripe(): Stripe {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not defined');
  }
  return new Stripe(apiKey);
}

/**
 * The user's latest subscription row, or null when they've never
 * subscribed. `isActive` is true only for a paid plan with an active
 * status — the sidebar uses it to decide whether to show the upgrade
 * button, and the settings page uses it to decide whether to offer
 * cancellation.
 */
export async function getSubscriptionStatus(): Promise<SubscriptionStatusResult | null> {
  const user = await getCurrentUser();

  const [sub] = await db
    .select({
      plan: subscriptions.plan,
      status: subscriptions.status,
      storageQuotaBytes: subscriptions.storageQuotaBytes,
      currentPeriodEnd: subscriptions.currentPeriodEnd,
      cancelAtPeriodEnd: subscriptions.cancelAtPeriodEnd,
      stripeSubscriptionId: subscriptions.stripeSubscriptionId,
    })
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .orderBy(sql`${subscriptions.createdAt} desc`)
    .limit(1);

  if (!sub) return null;

  return {
    ok: true,
    plan: sub.plan,
    status: sub.status,
    storageQuotaBytes: sub.storageQuotaBytes ?? null,
    currentPeriodEnd: sub.currentPeriodEnd,
    cancelAtPeriodEnd: Boolean(sub.cancelAtPeriodEnd),
    stripeSubscriptionId: sub.stripeSubscriptionId,
    isActive: sub.status === 'active' && sub.plan !== 'free',
  };
}

/**
 * Cancel the user's active subscription at the end of the current
 * period. The customer keeps Plus until the period ends, then Stripe
 * fires customer.subscription.deleted and the webhook downgrades the
 * user to free.
 */
export async function cancelSubscription(): Promise<CancelSubscriptionResult> {
  try {
    const user = await getCurrentUser();

    const [sub] = await db
      .select({ stripeSubscriptionId: subscriptions.stripeSubscriptionId })
      .from(subscriptions)
      .where(
        and(
          eq(subscriptions.userId, user.id),
          eq(subscriptions.plan, 'plus'),
          eq(subscriptions.status, 'active'),
          isNull(subscriptions.cancelAtPeriodEnd),
        ),
      )
      .orderBy(sql`${subscriptions.createdAt} desc`)
      .limit(1);

    if (!sub?.stripeSubscriptionId) {
      return { ok: false, error: 'No active subscription to cancel.' };
    }

    const stripe = getStripe();
    const updated = await stripe.subscriptions.update(
      sub.stripeSubscriptionId,
      { cancel_at_period_end: true },
    );

    return {
      ok: true,
      cancelAtPeriodEnd: updated.cancel_at_period_end,
    };
  } catch (err) {
    console.error('[billing] cancelSubscription failed:', err);
    return { ok: false, error: 'Something went wrong. Please try again.' };
  }
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
      // userId travels server-side only. It must be on the SUBSCRIPTION
      // (via subscription_data.metadata), not just the session — Stripe
      // does not copy session metadata onto the created subscription, and
      // subscription events carry the subscription's metadata. The
      // webhook maps sub -> user with it.
      metadata: { userId: user.id },
      subscription_data: { metadata: { userId: user.id } },
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
