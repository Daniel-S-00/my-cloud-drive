import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  uniqueIndex,
  varchar,
} from 'drizzle-orm/pg-core';
import { files } from './files';
import { users } from './users';

export const shares = pgTable(
  'shares',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    viewCount: integer('view_count').notNull().default(0),
  },
  (t) => ({
    tokenUq: uniqueIndex('shares_token_uq').on(t.token),
    fileIdx: index('shares_file_id_idx').on(t.fileId),
    createdByIdx: index('shares_created_by_idx').on(t.createdBy),
  }),
);

export type Share = typeof shares.$inferSelect;
export type NewShare = typeof shares.$inferInsert;
