# Quickstart: Validating the Upload Engine

**Phase**: 1
**Spec**: [./spec.md](./spec.md)
**Date**: 2025-06-27

This guide walks through end-to-end validation of the upload engine.
It is the runnable proof that the three task phases compose into a
working system. Implementation details live in `tasks.md` and the
source tree; this document is a test plan, not a tutorial.

---

## Prerequisites

- Node.js 20 LTS, pnpm 9.x.
- A Supabase project (free tier is fine) with the SQL from
  `drizzle-kit` migrations applied.
- A Cloudflare R2 bucket with an access key + secret.
- A `.env.local` with at minimum:
  ```
  DATABASE_URL=postgres://...
  R2_ACCOUNT_ID=...
  R2_ACCESS_KEY_ID=...
  R2_SECRET_ACCESS_KEY=...
  R2_BUCKET=my-cloud-drive-dev
  SUPABASE_URL=...
  SUPABASE_ANON_KEY=...
  ```
  All keys are validated at module load by `src/lib/env.ts`.

---

## Phase 1 validation: Drizzle + DB schema

**Goal**: confirm the schema applies cleanly and supports the
hierarchical + ownership invariants.

### Setup

```bash
pnpm install
pnpm drizzle-kit generate    # produces src/server/db/migrations/0000_init.sql
pnpm drizzle-kit migrate     # applies to DATABASE_URL
```

### Tests

```bash
pnpm test tests/integration/folder-ownership.test.ts
pnpm test tests/integration/cycle-prevention.test.ts
```

The first test asserts that a user cannot SELECT a folder they do
not own (the SQL filter is present and effective). The second test
asserts that moving folder A into a descendant of A is rejected by
`moveItem` with `CYCLE_DETECTED`.

### Manual checks

```sql
-- In Supabase SQL editor
SELECT indexname FROM pg_indexes
  WHERE tablename = 'folders';
-- Expect: folders_unique_name_per_parent, folders_parent_id_idx, folders_owner_id_idx
```

---

## Phase 2 validation: R2 + presigned URLs

**Goal**: confirm a presigned URL works against R2 and that finalize
verifies size + etag.

### Unit tests

```bash
pnpm test tests/unit/presign.test.ts
pnpm test tests/unit/finalize.test.ts
```

`presign.test.ts` asserts that the presigner emits URLs that the AWS
SDK can re-parse and that signing binds the URL to the exact
`Bucket`, `Key`, `ContentLength`, and `ContentType`.

`finalize.test.ts` asserts that finalize (a) deletes the R2 object
and marks the row failed on size mismatch, (b) marks the row
`complete` on a matching size + etag, and (c) rejects ownership
violations.

### Smoke test with a real R2 bucket

```bash
# In a Node REPL after pnpm dev
node -e "
  const r = await import('./src/server/storage/r2.ts');
  console.log(await r.listBuckets());
"
```

You should see your bucket. If not, the env is wrong and Phase 2 is
not actually wired up.

---

## Phase 3 validation: frontend upload with progress

**Goal**: confirm a 1 GB file uploads entirely browser → R2 and the
UI shows live progress.

### Run the app

```bash
pnpm dev
```

Open `http://localhost:3000/drive`, sign in, and:

1. Create a folder "Phase 3 test".
2. Open browser DevTools → Network tab; filter for the R2 endpoint.
3. Drop a 1 GB file (a synthetic `dd if=/dev/urandom of=./1gb.bin
   bs=1M count=1024` is fine for dev).
4. Verify:
   - The progress bar updates live (0 → 100%).
   - The Network tab shows N `PUT` requests to the R2 endpoint,
     NOT to `/api/files/...`.
   - The Next.js server logs contain NO body bytes (only the
     presign/finalize calls).

### E2E

```bash
pnpm test:e2e tests/e2e/upload-1gb.spec.ts
```

The Playwright spec signs in (via Supabase test session), navigates
to a folder, dispatches an upload through the same code path the UI
uses, waits for `upload_status = 'complete'`, and asserts the file
appears in the listing.

---

## Acceptance walk-through (maps to the spec's Success Criteria)

| SC    | How to verify                                                            |
|-------|--------------------------------------------------------------------------|
| SC-001 | After the E2E test, grep `pnpm dev` logs: no request body > 1 MB.        |
| SC-002 | Time the 1 GB E2E on a 100 Mbps line; expect < 2 min wall-clock.         |
| SC-003 | Run `createFolder` 10 times with `parentId = previous.id`; all succeed. |
| SC-004 | Call `generateUploadUrl` with another user's folderId; expect `FOLDER_NOT_FOUND` and no URL in the response. |
| SC-005 | Kill the browser mid-upload, reopen, retry; remaining parts upload.      |
| SC-006 | Seed 10 000 files in a folder, time the listing query; < 1 s.            |
| SC-007 | The E2E test inspects the row's `etag` and `size_bytes`; assert equality with the object in R2. |

---

## When something goes wrong

- **Presign returns 200 but PUT to R2 fails with 403** → your R2
  CORS configuration is missing. Add a CORS rule allowing your
  origin and `PUT`/`GET`/`HEAD` methods.
- **Finalize says size mismatch but the PUT succeeded** → the
  browser rewrote `Content-Length` (some intermediaries do this on
  chunked uploads). Disable chunked transfer encoding by setting
  `Content-Length` explicitly on the `PUT` request.
- **`NAME_CONFLICT` on finalize** → two uploads raced. The
  `confirmUpload` that loses returns the error; the client surfaces
  "name already used" and the user can rename or retry.
- **Cycle prevention blocks a valid move** → check the
  `WITH RECURSIVE` query; it MUST filter by `owner_id` and
  `deleted_at IS NULL` or it can return false positives.
