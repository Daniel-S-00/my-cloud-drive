# Data Model: Data Architecture & Upload Engine

**Phase**: 1
**Spec**: [./spec.md](./spec.md)
**Research**: [./research.md](./research.md)
**Date**: 2025-06-27

This artifact defines the persistent shapes for the upload engine. It is the
single source of truth that Drizzle schemas, Zod input schemas, and TypeScript
types MUST agree on.

---

## 1. Enumerations

### `upload_status`

| Value        | Meaning                                                     |
|--------------|-------------------------------------------------------------|
| `pending`    | A `files` row exists; presign was issued; finalize not run.  |
| `uploading`  | The browser has started the direct upload (set on first PUT response). |
| `complete`   | Finalize succeeded; the object exists in R2 with verified size + etag. |
| `failed`     | Finalize rejected (size mismatch, dup name, lost ownership, R2 error). |

Transitions:

```
pending → uploading → complete
                  ↘  failed
pending → failed  (abort, timeout, ownership lost)
```

`complete` and `failed` are terminal.

---

## 2. Tables

### 2.1 `users`

Surfaced from Supabase Auth. The application does not own this row's
write lifecycle; it projects the columns it needs into its own queries
(via `auth.users` views) and stores its own extension fields if
required.

| Column          | Type           | Constraints                              | Notes                              |
|-----------------|----------------|------------------------------------------|------------------------------------|
| `id`            | `uuid`         | PK                                       | Mirrors `auth.users.id`.           |
| `email`         | `text`         | unique, not null                         | Mirrors `auth.users.email`.        |
| `created_at`    | `timestamptz`  | not null, default `now()`                |                                    |

Drizzle:

```ts
// src/server/db/schema/users.ts
import { pgTable, uuid, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  email: text('email').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
```

---

### 2.2 `folders`

Self-referential, owner-scoped, soft-deletable.

| Column       | Type           | Constraints                                              | Notes                                     |
|--------------|----------------|----------------------------------------------------------|-------------------------------------------|
| `id`         | `uuid`         | PK, default `gen_random_uuid()`                          | Public id (branded `FolderId`).           |
| `parent_id`  | `uuid`         | nullable, FK → `folders.id` ON DELETE RESTRICT            | NULL means "user's root".                 |
| `owner_id`   | `uuid`         | not null, FK → `users.id` ON DELETE CASCADE               | Source of truth for ownership.            |
| `name`       | `text`         | not null, length 1–255                                   | Human-readable; unique per `(parent_id, lower(name), owner_id)`. |
| `created_at` | `timestamptz`  | not null, default `now()`                                |                                           |
| `updated_at` | `timestamptz`  | not null, default `now()`                                | Updated on rename/move.                   |
| `deleted_at` | `timestamptz`  | nullable                                                 | Soft delete; listings filter `IS NULL`.   |

Indexes:

- `folders_parent_id_idx` on `(parent_id)` — for "list children of X".
- `folders_owner_id_idx` on `(owner_id)` — for ownership scans.
- `folders_unique_name_per_parent` UNIQUE on
  `(owner_id, parent_id, lower(name)) WHERE deleted_at IS NULL` —
  enforces FR-004 uniqueness.

Drizzle:

```ts
// src/server/db/schema/folders.ts
import {
  pgTable, uuid, text, timestamp,
  uniqueIndex, index, type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { sql } from 'drizzle-orm';

export const folders = pgTable(
  'folders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    parentId: uuid('parent_id').references((): AnyPgColumn => folders.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
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
```

---

### 2.3 `files`

Leaf nodes referencing R2 objects.

| Column           | Type           | Constraints                                              | Notes                                       |
|------------------|----------------|----------------------------------------------------------|---------------------------------------------|
| `id`             | `uuid`         | PK, default `gen_random_uuid()`                          | Branded `FileId`.                           |
| `folder_id`      | `uuid`         | not null, FK → `folders.id` ON DELETE RESTRICT            | Exactly one parent, never null.             |
| `owner_id`       | `uuid`         | not null, FK → `users.id` ON DELETE CASCADE               |                                             |
| `name`           | `text`         | not null, length 1–255                                   | Human-readable.                             |
| `storage_key`    | `text`         | not null, unique                                         | Opaque, `${userId}/${uuidv4()}`.            |
| `mime_type`      | `text`         | not null, default `'application/octet-stream'`           |                                             |
| `size_bytes`     | `bigint`       | not null                                                 | Set at finalize, verified against R2.       |
| `etag`           | `text`         | nullable                                                 | Set at finalize, verified against R2.       |
| `upload_status`  | `upload_status`| not null, default `'pending'`                            | Postgres enum.                              |
| `r2_upload_id`   | `text`         | nullable                                                 | Set only for multipart; null for single-part.|
| `created_at`     | `timestamptz`  | not null, default `now()`                                |                                             |
| `updated_at`     | `timestamptz`  | not null, default `now()`                                |                                             |
| `deleted_at`     | `timestamptz`  | nullable                                                 | Soft delete.                                |

Indexes:

- `files_folder_id_idx` on `(folder_id)` — for folder listing.
- `files_owner_id_idx` on `(owner_id)`.
- `files_storage_key_uq` UNIQUE on `(storage_key)`.
- `files_unique_name_per_folder` UNIQUE on
  `(owner_id, folder_id, lower(name)) WHERE deleted_at IS NULL`.

Drizzle:

```ts
// src/server/db/schema/files.ts
import {
  pgTable, uuid, text, bigint, timestamp,
  pgEnum, uniqueIndex, index,
} from 'drizzle-orm/pg-core';
import { users } from './users';
import { folders } from './folders';
import { sql } from 'drizzle-orm';

export const uploadStatus = pgEnum('upload_status', [
  'pending', 'uploading', 'complete', 'failed',
]);

export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    folderId: uuid('folder_id').notNull().references(() => folders.id, { onDelete: 'restrict' }),
    ownerId: uuid('owner_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    storageKey: text('storage_key').notNull(),
    mimeType: text('mime_type').notNull().default('application/octet-stream'),
    sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull(),
    etag: text('etag'),
    uploadStatus: uploadStatus('upload_status').notNull().default('pending'),
    r2UploadId: text('r2_upload_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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
```

---

## 3. Relationships (E-R summary)

```
users (1) ──< (N) folders
                │
                └──< (N) folders     (self-FK: parent_id)
                │
                └──< (N) files

users (1) ──< (N) files
```

`files.folder_id` is non-null and `RESTRICT` (cannot delete a folder
with files; must soft-delete or move children first).

---

## 4. Branded IDs

To satisfy Constitution III, domain ids are wrapped in nominal types:

```ts
// src/lib/ids.ts
import type { User } from '@/server/db/schema/users';
import type { Folder } from '@/server/db/schema/folders';
import type { File } from '@/server/db/schema/files';

declare const __brand: unique symbol;
type Brand<T, B> = T & { readonly [__brand]: B };

export type UserId    = Brand<string, 'UserId'>;
export type FolderId  = Brand<string, 'FolderId'>;
export type FileId    = Brand<string, 'FileId'>;
export type ObjectKey = Brand<string, 'ObjectKey'>;

export const asUserId    = (s: string) => s as UserId;
export const asFolderId  = (s: string) => s as FolderId;
export const asFileId    = (s: string) => s as FileId;
export const asObjectKey = (s: string) => s as ObjectKey;
```

---

## 5. Recursive CTE (folder-tree service)

Used by `getFolderPath` (breadcrumbs) and by the move cycle check
(FR-028).

```sql
-- ancestors of folder :id
WITH RECURSIVE ancestors(id, parent_id) AS (
  SELECT id, parent_id FROM folders
    WHERE id = $1 AND owner_id = $current_user AND deleted_at IS NULL
  UNION ALL
  SELECT f.id, f.parent_id FROM folders f
    JOIN ancestors a ON f.id = a.parent_id
    WHERE f.owner_id = $current_user AND f.deleted_at IS NULL
)
SELECT id FROM ancestors;
```

The cycle check passes if `$newParentId` does not appear in the ancestor
chain of the folder being moved.

---

## 6. Validation rules (Zod)

| Field         | Rule                                              |
|---------------|---------------------------------------------------|
| `name`        | 1–255 chars, no `/`, no leading/trailing whitespace, no `..`, no NUL. |
| `sizeBytes`   | 0 ≤ n ≤ 10 GiB (10 * 1024^3).                     |
| `mimeType`    | RFC 6838 media type, ≤ 255 chars.                 |
| `folderId`    | UUID v4, owned by `currentUserId`.                |
| `objectKey`   | Match `^[a-f0-9-]{36}$` (uuidv4) after the `userId/` prefix. |

These are enforced by Zod schemas in `src/lib/schemas/`.

---

## 7. State invariants (must hold at all times)

- A `files` row with `upload_status = 'complete'` MUST have `etag` NOT
  NULL, and the object in R2 at `storage_key` MUST return the same etag
  on `HeadObject`.
- A `files` row with `upload_status = 'failed'` or
  `upload_status = 'pending'` for > 24 h MUST be eligible for sweep
  (out of scope for v1, but a future background job).
- A `folders` row's `parent_id` MUST be either NULL or point to a row
  owned by the same user; cycle check on every move.
- Every `files` and `folders` row MUST have `owner_id` matching the
  caller at every query.

These invariants are unit- and integration-tested under
`tests/unit/folder-tree.test.ts` and
`tests/integration/cycle-prevention.test.ts`.
