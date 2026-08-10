import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const subscriptionStatus = pgEnum('subscription_status', [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Stripe subscription id (sub_...). Null while the checkout session
    // is still open (the subscription is created after payment).
    stripeSubscriptionId: text('stripe_subscription_id').unique(),
    // The plan the user is on. 'free' is the implicit default; the
    // actual paid plan name (plus/pro/max) is recorded when a
    // subscription is active.
    plan: text('plan').notNull().default('free'),
    status: subscriptionStatus('status')
      .notNull()
      .default('incomplete'),
    // The real quota backing the storage meter (replaces the hardcoded
    // 5 GB display tier once billing lands).
    storageQuotaBytes: bigint('storage_quota_bytes', {
      mode: 'number',
    }),
    currentPeriodEnd: timestamp('current_period_end', {
      withTimezone: true,
    }),
    cancelAtPeriodEnd: timestamp('cancel_at_period_end', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdIdx: index('subscriptions_user_id_idx').on(t.userId),
  }),
);

export type Subscription = typeof subscriptions.$inferSelect;
export type NewSubscription = typeof subscriptions.$inferInsert;
export type SubscriptionRowStatus = (typeof subscriptionStatus.enumValues)[number];
