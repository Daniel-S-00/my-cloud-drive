import Stripe from 'stripe';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';
import { db } from '@/server/db/client';
import { subscriptions, users } from '@/server/db/schema';
import { PLANS } from '@/server/billing/plans';
import type { SubscriptionRowStatus } from '@/server/db/schema/subscriptions';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.length === 0) {
    throw new Error(`${name} is not defined`);
  }
  return value;
}

// Stripe v22 moved the billing period onto the subscription item, and
// status is an open string enum — narrow it to the values we persist.
function toPersistedStatus(status: string): SubscriptionRowStatus {
  return (['incomplete', 'incomplete_expired', 'trialing', 'active', 'past_due', 'canceled', 'unpaid'] as const).includes(
    status as SubscriptionRowStatus,
  )
    ? (status as SubscriptionRowStatus)
    : 'canceled';
}

/**
 * Convert a Stripe subscription into the fields we persist. Unknown
 * plans (a plan we no longer offer) fall back to a canceled free
 * subscription rather than crashing the webhook.
 */
function planFromSubscription(sub: Stripe.Subscription): {
  plan: string;
  status: SubscriptionRowStatus;
  storageQuotaBytes: number | null;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: Date | null;
} {
  const priceId = sub.items.data[0]?.price?.id;
  const plan = Object.values(PLANS).find((p) => {
    const envPrice = process.env[p.envKey];
    return envPrice === priceId;
  });

  const periodEnd = sub.items.data[0]?.current_period_end;

  if (!plan) {
    return {
      plan: 'free',
      status: 'canceled',
      storageQuotaBytes: null,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: null,
    };
  }

  return {
    plan: plan.name,
    status: toPersistedStatus(sub.status),
    storageQuotaBytes: plan.storageBytes,
    currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
    cancelAtPeriodEnd: sub.cancel_at ? new Date(sub.cancel_at * 1000) : null,
  };
}

/**
 * Upsert the subscription row for a user. The user id comes from the
 * checkout session's client_reference_id / metadata (set server-side in
 * the billing action, never client-controlled), or from the Stripe
 * customer object when only customer_email is available.
 */
async function upsertFromSubscription(sub: Stripe.Subscription) {
  const fields = planFromSubscription(sub);

  // Map the subscription back to our user. Prefer the customer's
  // metadata (set at checkout) then fall back to matching by email.
  const customer =
    typeof sub.customer === 'object' && !sub.customer.deleted
      ? sub.customer
      : null;

  let userId =
    (sub.metadata?.userId as string | undefined) ??
    customer?.metadata?.userId;

  if (!userId && customer?.email) {
    const [user] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, customer.email.toLowerCase()))
      .limit(1);
    userId = user?.id;
  }

  if (!userId) {
    throw new Error(`No user found for subscription ${sub.id}`);
  }

  await db
    .insert(subscriptions)
    .values({
      userId,
      stripeSubscriptionId: sub.id,
      plan: fields.plan,
      status: fields.status,
      storageQuotaBytes: fields.storageQuotaBytes,
      currentPeriodEnd: fields.currentPeriodEnd,
      cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
    })
    .onConflictDoUpdate({
      target: subscriptions.stripeSubscriptionId,
      set: {
        plan: fields.plan,
        status: fields.status,
        storageQuotaBytes: fields.storageQuotaBytes,
        currentPeriodEnd: fields.currentPeriodEnd,
        cancelAtPeriodEnd: fields.cancelAtPeriodEnd,
        updatedAt: new Date(),
      },
    });
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get('stripe-signature');

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const stripe = new Stripe(requireEnv('STRIPE_SECRET_KEY'));
  const webhookSecret = requireEnv('STRIPE_WEBHOOK_SECRET');

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: `Webhook signature: ${msg}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        // The subscription is created (in test mode) after payment; the
        // checkout.session.completed event may arrive before the
        // subscription object is fully visible. The subscription.updated
        // event that follows is the source of truth — if we can't resolve
        // the subscription yet, just ack and let the follow-up land.
        if (session.subscription && typeof session.subscription === 'string') {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await upsertFromSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.created':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await upsertFromSubscription(sub);
        break;
      }
      default:
        // Unknown event types are acked so Stripe stops retrying.
        break;
    }
  } catch (err) {
    // Return non-2xx so Stripe retries the event with backoff.
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] failed to handle event:', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
