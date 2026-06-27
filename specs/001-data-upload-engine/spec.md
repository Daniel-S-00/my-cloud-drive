# Feature Specification: Data Architecture & Upload Engine

**Feature Branch**: `001-data-upload-engine`
**Created**: 2025-06-27
**Status**: Draft
**Input**: User description: "Create a detailed technical specification for the 'Data Architecture & Upload Engine' module based on our constitution. Detail the Drizzle schema (users, folders with self-referential parent_id, files with size/mime_type/storage_key/upload_status), the step-by-step upload flow for a 1GB file using Next.js Server Actions and AWS S3 v3 Presigned URLs against Cloudflare R2, ownership-based security validation, and the exact list of API routes / server actions (generateUploadUrl, confirmUpload, createFolder, etc.)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Upload a Large File Directly to Cloud Storage (Priority: P1)

An authenticated user opens their drive, navigates to a folder they own, and
drops a 1 GB file into the upload area. They see a live progress bar, and on
completion the file appears in the folder with its correct name, size, and
type. Throughout the upload, no bytes pass through the application server.

**Why this priority**: This is the platform's defining capability. Without
direct-to-cloud uploads the system is not a cloud drive; it is a slow file
proxy. P1 because it unblocks every other storage feature.

**Independent Test**: Seed a user with a folder, dispatch an upload through
the public surface, and verify (a) the file is reachable in object storage,
(b) a `files` row exists with the correct metadata, and (c) no bytes were
observed by the application server in its logs.

**Acceptance Scenarios**:

1. **Given** a signed-in user viewing a folder they own, **When** they drop
   a 1 GB file, **Then** the system returns a one-time URL and the browser
   uploads the file directly to object storage.
2. **Given** an upload in progress, **When** the user watches the UI, **Then**
   they see live progress (0–100%) and a cancel option.
3. **Given** an upload that completed in the browser, **When** the client
   calls the confirmation endpoint, **Then** a `files` row is created in the
   same folder with the user's file name, size, mime type, and verified
   object etag.
4. **Given** the upload finished, **When** the user refreshes the folder,
   **Then** the new file is listed alongside existing items, sorted by the
   folder's default rule.

---

### User Story 2 - Create Nested Folders (Priority: P1)

A user creates a folder inside another folder to organize projects. Folder
names MUST be unique within a parent and the user can descend into arbitrary
depth (folder within folder within folder) without limit.

**Why this priority**: Hierarchy is the other defining capability of a
drive. Without nested folders, "Data Architecture" is not delivered. P1
because US1 and US2 are the minimum viable product.

**Independent Test**: With a single authenticated user, create a 5-level deep
folder chain via the public API and verify each `folders` row links to its
parent by id.

**Acceptance Scenarios**:

1. **Given** a parent folder owned by the user, **When** they create a child
   folder with a name, **Then** a new `folders` row is persisted with that
   name and `parent_id` set to the parent.
2. **Given** an attempt to create a folder with a name that already exists
   in that parent, **When** the user submits, **Then** the system rejects
   the request with a clear "name already used" message.
3. **Given** the folder tree, **When** the user navigates any path, **Then**
   breadcrumbs render the chain from the root folder to the current node.

---

### User Story 3 - Move and Rename Files and Folders (Priority: P2)

A user drags a file into a sub-folder, drags a folder into another parent,
or renames an item. The system MUST prevent a folder from being moved into
one of its own descendants (cycle prevention).

**Why this priority**: Essential UX for organizing content, but the system
is usable without it; ranking P2.

**Independent Test**: Attempt to move folder A into one of its descendants
and verify the request is rejected with a "cannot move folder into itself"
message, then perform a valid rename and verify it persists.

**Acceptance Scenarios**:

1. **Given** a file in folder X, **When** the user moves it to folder Y
   (where Y is a sibling of X), **Then** the `files.folder_id` updates and
   the file is no longer listed in X.
2. **Given** a folder, **When** the user tries to move it into one of its
   own children, **Then** the system rejects the request.
3. **Given** a file, **When** the user renames it to a name not already
   present in its folder, **Then** the new name persists and is reflected
   in the listing.

---

### User Story 4 - Resume an Interrupted Upload (Priority: P3)

A user starts uploading a 1 GB file, loses their network connection for
several minutes, and reconnects. The system supports resuming the upload so
they do not have to start over.

**Why this priority**: A nice-to-have for portfolio polish; a personal
drive can launch without it. P3.

**Independent Test**: Start a multipart upload, kill the network mid-way,
reconnect, and verify the upload can be completed without re-sending the
already-transferred parts.

**Acceptance Scenarios**:

1. **Given** an interrupted upload, **When** the user retries from the
   client, **Then** the system issues a fresh set of presigned part URLs
   for the parts that have not yet been received.
2. **Given** a resumable upload, **When** the user cancels instead, **Then**
   the partial object in storage is removed and no `files` row is created.

---

### Edge Cases

- A user requests a presigned URL for a folder id that does not exist or
  that they do not own — request rejected, no URL issued.
- A user uploads a file whose browser-reported size differs from what the
  server stores in the finalize step — finalize rejected, object deleted
  from storage.
- A user uploads a file with the same name as one already in the folder —
  finalize rejected with a "name already used" error and the storage object
  is deleted.
- A user navigates to a folder that has been soft-deleted — listing returns
  404, not a permission error.
- A user pastes a 0-byte file — finalization succeeds, mime type defaults
  to `application/octet-stream`, size is 0.
- A folder is renamed while a concurrent upload to it is in flight — the
  finalize MUST still succeed against the original folder id; race resolves
  in favor of the upload.
- Two clients try to create the same folder name at the same time — exactly
  one row is created; the other receives a duplicate-name error.
- A user attempts to confirm an upload whose presigned URL has already
  expired — confirmation rejected; the client may request a new URL.

## Requirements *(mandatory)*

### Functional Requirements

#### Data Architecture (Drizzle ORM Schema)

- **FR-001**: System MUST persist `users`, `folders`, and `files` tables in
  a Postgres database via Drizzle ORM, with schema files living under
  `src/server/db/schema/` and migrations under `src/server/db/migrations/`.
- **FR-002**: The `folders` table MUST be self-referential: every folder
  row has an optional `parent_id` referencing `folders.id`, with `NULL`
  reserved for the user's root.
- **FR-003**: The `folders` table MUST support infinite depth without a
  schema-level depth cap; a recursive query (Postgres `WITH RECURSIVE` CTE
  or an `ltree` column) MUST resolve any ancestor chain.
- **FR-004**: The `folders` table MUST carry at minimum: `id` (UUID, primary
  key), `parent_id` (UUID, nullable, self-FK), `owner_id` (UUID, FK to
  `users.id`), `name` (text), `created_at`, `updated_at`. A unique
  constraint MUST prevent two folders owned by the same user from sharing
  a `(parent_id, lower(name))` pair.
- **FR-005**: The `files` table MUST carry at minimum: `id` (UUID, primary
  key), `folder_id` (UUID, FK to `folders.id`), `owner_id` (UUID, FK to
  `users.id`), `name` (text), `storage_key` (text, unique, opaque), `mime_type`
  (text), `size_bytes` (bigint), `etag` (text, nullable until finalize),
  `upload_status` (enum: `pending` | `uploading` | `complete` | `failed`),
  `created_at`, `updated_at`.
- **FR-006**: Soft delete MUST be modelled for both `folders` and `files`
  via a nullable `deleted_at` timestamp; listings MUST filter
  `WHERE deleted_at IS NULL`.
- **FR-007**: All folder/file queries MUST filter by `owner_id = $current_user`
  at the SQL level; row-level filtering in application code is forbidden.

#### Upload Engine

- **FR-008**: The system MUST issue presigned URLs that are S3 v3
  compatible, accepted by Cloudflare R2, scoped to a single object key,
  and that expire in 15 minutes or less.
- **FR-009**: The system MUST NOT stream, buffer, or proxy upload or
  download bytes through the Next.js server, Server Actions, or any
  application-tier process; bytes flow only between the browser and R2.
- **FR-010**: A presigned `PUT` MUST bind to a specific object key generated
  server-side; clients MUST NOT be able to influence the key value.
- **FR-011**: `storage_key` MUST be an opaque, non-guessable identifier
  (UUIDv4 or content hash) and MUST NOT contain the user's file name or
  any user-controlled input.
- **FR-012**: The upload flow MUST be split into three explicit phases:
  request URL → direct browser-to-R2 PUT → server-side finalize.
- **FR-013**: The finalize step MUST run in a single database transaction
  that (a) verifies the object exists in R2, (b) reads its real size and
  etag, and (c) inserts the `files` row with `upload_status = 'complete'`.
- **FR-014**: If finalize fails (size mismatch, missing etag, duplicate
  name, lost ownership), the in-flight object MUST be deleted from R2 and
  no `files` row MAY be created.
- **FR-015**: The system MUST support multipart uploads for files larger
  than a configured threshold (default 50 MB), allowing resume of
  individual parts.
- **FR-016**: The system MUST return a typed result (a discriminated union
  of success and named error variants) from every upload-related server
  action; bare thrown exceptions are forbidden at this boundary.

#### Security

- **FR-017**: The system MUST reject any presigned-URL request where the
  supplied `folder_id` does not exist, is soft-deleted, or is not owned
  by the requesting user.
- **FR-018**: The system MUST load the user identity from the verified
  Supabase session cookie on the server; client-supplied `owner_id` or
  `user_id` fields in the request body MUST be ignored.
- **FR-019**: The presigned URL response MUST include the object's
  expected `content-length` and `content-type` constraints, and the
  browser MUST send matching values or the upload will be refused by R2.
- **FR-020**: The presigned URL MUST be bound to a single `key` parameter;
  wildcards or prefix-only signing are forbidden.

#### API Routes / Server Actions

The platform exposes the following Server Actions (all live under
`src/server/actions/`, callable from RSC and client components alike):

- **FR-021**: `generateUploadUrl(input)` — Server Action. Inputs: `{ folderId, fileName, sizeBytes, mimeType }`. Outputs: `{ uploadId, objectKey, url, expiresAt, headers }` on success; `AppError` variant on failure. Validates ownership of `folderId`, generates an opaque `objectKey`, signs a single-part or multipart `PUT` against R2, persists a `files` row with `upload_status = 'pending'`.
- **FR-022**: `generateMultipartUploadUrl(input)` — Server Action. Inputs: `{ folderId, fileName, sizeBytes, mimeType, partCount }`. Outputs: `{ uploadId, objectKey, partUrls[], expiresAt }`. Used when size > 50 MB.
- **FR-023**: `completeMultipartUpload(input)` — Server Action. Inputs: `{ uploadId, parts: { partNumber, etag }[] }`. Tells R2 to assemble the parts, then runs the finalize logic.
- **FR-024**: `confirmUpload(input)` — Server Action. Inputs: `{ uploadId }`. Re-checks ownership and folder validity, verifies the object exists in R2, reads its real `size` and `etag`, then transitions the `files` row to `upload_status = 'complete'` in one transaction. On any inconsistency, the object is deleted and the row is marked `failed`.
- **FR-025**: `abortUpload(input)` — Server Action. Inputs: `{ uploadId }`. Deletes the partial R2 object and marks the `files` row `failed`.
- **FR-026**: `createFolder(input)` — Server Action. Inputs: `{ parentId, name }`. Outputs: `{ folder: { id, parentId, name, path, createdAt } }`. Enforces `(parent_id, lower(name))` uniqueness per owner.
- **FR-027**: `renameItem(input)` — Server Action. Inputs: `{ kind: 'folder' | 'file', id, newName }`. Re-validates ownership and the new name's uniqueness.
- **FR-028**: `moveItem(input)` — Server Action. Inputs: `{ kind, id, newParentId }`. For folders, runs a cycle check before committing.
- **FR-029**: `deleteItem(input)` — Server Action. Inputs: `{ kind, id }`. Soft-deletes the row; for files, also schedules an R2 delete (best-effort, retryable).

In addition, the following read-only Server Actions back Server Components:

- **FR-030**: `getFolderContents(input)` — Inputs: `{ folderId, cursor?, limit? }`. Returns paginated children.
- **FR-031**: `getFolderPath(input)` — Inputs: `{ folderId }`. Returns ancestor chain for breadcrumbs.
- **FR-032**: `getUploadStatus(input)` — Inputs: `{ uploadId }`. Used by the client to reconcile after a refresh.

#### Validation, Errors, and Observability

- **FR-033**: All Server Action inputs MUST be validated with Zod schemas
  declared under `src/lib/schemas/`; unvalidated inputs are forbidden.
- **FR-034**: Server Actions MUST return a `Result<T, AppError>` shaped
  value; the `AppError` union includes at minimum
  `UnauthorizedError`, `FolderNotFoundError`, `NameConflictError`,
  `QuotaExceededError`, `UploadTooLargeError`, `InvalidMimeTypeError`,
  and `R2Error`.
- **FR-035**: Every request MUST carry a server-generated `requestId`
  surfaced in logs, error responses, and the `x-request-id` response
  header.

### Key Entities *(include if feature involves data)*

- **User**: An authenticated principal. Owns folders and files. Identified
  by `id`. Source of truth for all authorization decisions.
- **Folder**: A node in a self-referential tree. Has a `parent_id` (nullable,
  pointing to another folder; `NULL` means the user's root). Has a
  human-readable `name` unique within its parent per owner. A folder has
  zero or more child folders and zero or more files. Soft-deletable.
- **File**: A leaf node referencing an R2 object via an opaque
  `storage_key`. Has a `folder_id` (exactly one parent folder, never null),
  a `name` unique within that folder per owner, `mime_type`, `size_bytes`,
  `etag`, and a lifecycle `upload_status`. Soft-deletable.
- **UploadSession** *(transient, not a long-lived DB row)*: A logical
  grouping created when `generateUploadUrl` is called. Tracked through
  the `files.upload_status` field plus R2's `UploadId` for multipart.
  Ends in either `complete` or `failed`.
- **R2Object** *(implicit, not a DB row)*: The actual bytes in Cloudflare
  R2 addressed by `files.storage_key`. Exists for the duration between
  presign and finalize; either committed (file row created) or deleted
  (no row, no object).

## Technical Architecture

This section captures the engineering details the team needs to implement
the requirements above. It documents the **how** that the user-facing
scenarios imply.

### Step-by-Step Upload Flow (1 GB File)

1. **User selects file in the browser.** The client reads the file into
   memory metadata only (`name`, `size`, `type`); the bytes are NOT read
   into a single buffer. Because 1 GB > 50 MB threshold, the client
   decides to use the multipart path.
2. **Client calls `generateMultipartUploadUrl` Server Action** with
   `{ folderId, fileName, sizeBytes, mimeType, partCount }`. The action:
   - Verifies the Supabase session; resolves `currentUserId`.
   - Looks up `folderId`; rejects if missing, soft-deleted, or not owned
     by `currentUserId`.
   - Generates `objectKey = ${currentUserId}/${uuidv4()}` (opaque, scoped
     by user prefix for R2 lifecycle rules).
   - Calls R2's `CreateMultipartUpload` to obtain a real R2 `UploadId`.
   - For each part number, signs a presigned `UploadPart` URL with a
     15-minute expiry, scoped to the exact `objectKey` + `PartNumber`.
   - Inserts a `files` row with `upload_status = 'pending'`,
     `storage_key`, `size_bytes`, `mime_type`, `folder_id`, `owner_id`,
     and the R2 `UploadId` in a transient column.
   - Returns the part URLs to the client.
3. **Browser uploads each part in parallel** (default concurrency 4)
   directly to the corresponding R2 URL via `fetch(url, { method: 'PUT',
   body: chunk, signal })`. The Next.js server is not involved.
4. **Browser tracks per-part etags** returned in the `ETag` response
   header for each successful `UploadPart`.
5. **Client calls `completeMultipartUpload` Server Action** with
   `{ uploadId, parts: [{ partNumber, etag }, ...] }`. The action:
   - Verifies the `files` row's `upload_status = 'pending'` and that the
     row is still owned by `currentUserId`.
   - Calls R2's `CompleteMultipartUpload` with the ordered part list.
   - Reads the assembled object's `ContentLength` and `ETag` from R2.
   - In a single transaction: compares real size to `size_bytes`,
     compares the real etag to the etag returned by Complete, sets
     `upload_status = 'complete'`, and stores the verified etag.
   - On any mismatch: deletes the object via R2 `DeleteObject`, sets
     `upload_status = 'failed'`, returns a typed error.
6. **Client receives the typed success result** and the React Query
   cache invalidates the folder listing. The new file appears in the UI.

#### What runs on the server vs. the client

| Step | Runs on | Notes |
|------|---------|-------|
| Session check, ownership validation, presign generation | Next.js Server | No bytes touched |
| HTTP `PUT` of file parts | Browser → R2 directly | Never hits Next.js |
| Multipart assembly (`CompleteMultipartUpload`) | Next.js Server | Only API call, no bytes |
| Object size + etag verification | Next.js Server | `HeadObject` against R2 |
| DB transaction (`files` row update) | Next.js Server | Drizzle transaction |

### Security Validation of Folder Ownership

The ownership check is the single most important authorization in the
module. It is implemented as follows:

1. Every Server Action begins by calling `getCurrentUser()` from
   `src/server/auth/`, which reads the Supabase session cookie and
   returns `{ id: UserId }` or throws `UnauthorizedError`. The user id
   is treated as the **only** source of truth for ownership; any
   `userId` field in the request body is ignored.
2. The action then issues a single Drizzle query:
   ```sql
   SELECT id, owner_id, deleted_at
   FROM folders
   WHERE id = $1 AND deleted_at IS NULL
   ```
3. The action checks that `row.owner_id === currentUser.id`. If the
   row is missing, soft-deleted, or owned by someone else, the action
   returns `FolderNotFoundError` (deliberately indistinct from
   "does not exist" to prevent enumeration).
4. The generated presigned URL is signed only after this check passes.
   Object keys are prefixed with `${currentUser.id}/`, so even if a
   presigned URL were leaked to another user, R2's key namespace
   guarantees the bytes are scoped to the original owner.
5. The finalize step repeats the same ownership check, because the
   client could have started an upload hours earlier under a session
   that has since been revoked.

### Presigned URL Generation (S3 v3 against R2)

- Use `@aws-sdk/client-s3` and `@aws-sdk/s3-request-presigner` with
  the R2 endpoint (`https://<account>.r2.cloudflarestorage.com`).
- Sign with `getSignedUrl(s3, new PutObjectCommand({...}), { expiresIn: 900 })`
  for single-part uploads.
- For multipart, call `CreateMultipartUploadCommand`, then
  `UploadPartCommand` per part, then `CompleteMultipartUploadCommand`.
- The signed URL includes the bucket name and exact `Key`; clients
  cannot alter the key without invalidating the signature.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A user can upload a 1 GB file from the browser with no
  observable bytes traversing the application server (verified by
  absence of large request bodies in Next.js access logs).
- **SC-002**: A 1 GB upload on a 100 Mbps connection completes in under
  2 minutes wall-clock and shows live progress within 500 ms of
  drop.
- **SC-003**: A user can create a 10-level deep folder chain through
  the public API without any depth-related error.
- **SC-004**: 100% of ownership-violation attempts (requesting a URL
  for a folder the user does not own) are rejected with no presigned
  URL returned and with a structured `FolderNotFoundError` in the
  audit log.
- **SC-005**: An interrupted upload can be resumed without re-sending
  already-transferred parts.
- **SC-006**: Folder listings render within 1 second for folders
  containing up to 10 000 items.
- **SC-007**: Every upload completes with a `files` row whose `size_bytes`
  and `etag` exactly match the bytes stored in R2; mismatches trigger
  automatic cleanup.

## Assumptions

- Authentication is provided by Supabase Auth with session cookies; this
  spec does not cover sign-up or login flows (separate feature).
- The user owns the entire namespace below their own user id; there is
  no cross-user sharing in v1.
- A user's storage quota is out of scope for this spec; if it is added
  later, it will gate `generateUploadUrl` and surface a
  `QuotaExceededError`.
- A user may upload any `mime_type` they choose; no content-type
  allowlist is enforced in v1 (a future feature will add virus scanning
  and policy).
- Soft delete is sufficient for v1; hard delete and trash-bin UX are
  out of scope.
- Multipart upload is required for files > 50 MB and optional below;
  the exact threshold may be tuned without a spec change.
- The 1 GB "large file" assumption is the design driver for multipart;
  the system MUST also handle 10 GB files in v1.
- The `users` table is created and managed by Supabase Auth; the
  application reads from `auth.users` and projects only the columns it
  needs (e.g., `id`, `email`) into its own `users` view or relies on
  Supabase's foreign-key helpers.
- R2 lifecycle rules are configured out-of-band; this spec only
  describes the application's responsibilities.
