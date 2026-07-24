import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

export const user2fa = pgTable(
  'user_2fa',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    secret: text('secret').notNull(),
    enabled: boolean('enabled').notNull().default(false),
    backupCodes: text('backup_codes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({
    userIdIdx: index('user_2fa_user_id_idx').on(t.userId),
  }),
);

export const pending2faVerifications = pgTable(
  'pending_2fa_verifications',
  {
    token: text('token').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true })
      .notNull(),
    attempts: integer('attempts').notNull().default(0),
  },
);
