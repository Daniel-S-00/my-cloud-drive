import { sql } from 'drizzle-orm';
import {
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users';

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references(
      (): AnyPgColumn => folders.id,
      { onDelete: 'restrict' },
    ),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    favoriteAt: timestamp('favorite_at', { withTimezone: true }),
  },
  (t) => ({
    parentIdx: index('folders_parent_id_idx').on(t.parentId),
    ownerIdx: index('folders_owner_id_idx').on(t.ownerId),
    uniqueNamePerParent: uniqueIndex('folders_unique_name_per_parent')
      .on(t.ownerId, t.parentId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
);

export type Folder = typeof folders.$inferSelect;
export type NewFolder = typeof folders.$inferInsert;
