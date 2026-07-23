import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true })
    .defaultNow()
    .notNull(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  deletionScheduledFor: timestamp('deletion_scheduled_for', {
    withTimezone: true,
  }),
  originalEmail: text('original_email'),
  recoveryToken: text('recovery_token').unique(),
  recoveryTokenExpiresAt: timestamp('recovery_token_expires_at', {
    withTimezone: true,
  }),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
