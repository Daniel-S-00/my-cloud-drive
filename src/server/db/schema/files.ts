import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { folders } from './folders';
import { users } from './users';

export const uploadStatus = pgEnum('upload_status', [
  'pending',
  'uploading',
  'complete',
  'failed',
]);

export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    folderId: uuid('folder_id')
      .notNull()
      .references(() => folders.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull().default('application/octet-stream'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    etag: text('etag'),
    uploadStatus: uploadStatus('upload_status').notNull().default('pending'),
    r2UploadId: text('r2_upload_id'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    folderIdx: index('files_folder_id_idx').on(t.folderId),
    ownerIdx: index('files_owner_id_idx').on(t.ownerId),
    storageKeyUq: uniqueIndex('files_storage_key_uq').on(t.storageKey),
    uniqueNamePerFolder: uniqueIndex('files_unique_name_per_folder')
      .on(t.ownerId, t.folderId, sql`lower(${t.name})`)
      .where(sql`${t.deletedAt} IS NULL`),
  }),
);

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;
export type UploadStatus = (typeof uploadStatus.enumValues)[number];
