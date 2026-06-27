---

description: "Task list for the Data Architecture & Upload Engine feature"
---

# Tasks: Data Architecture & Upload Engine

**Input**: Design documents from `/specs/001-data-upload-engine/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)
**Spec**: `001-data-upload-engine`

**Organization**: Tasks are grouped into Setup, Foundational, and three
user-requested implementation phases (Drizzle + DB → R2 + presign →
frontend upload with progress), plus a final Polish phase. Each phase
is independently mergeable and verifiable.

## Format: `[ID] [P?] [Phase] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Phase]**: Which phase this task belongs to
  - `P0` = Foundational (shared infrastructure)
  - `P1` = Drizzle + DB schema
  - `P2` = R2 + Presigned URL generation
  - `P3` = Frontend upload component + progress bar
  - `P4` = Polish
- Include exact file paths in descriptions

## Path Conventions

- **Single project** (this repo): `src/`, `tests/` at repository root
- All new server code lives under `src/server/**`; all new client code
  under `src/components/**` and `src/hooks/**`; all new cross-cutting
  utilities under `src/lib/**`

---

## Phase 0: Setup (Shared Infrastructure)

**Purpose**: Project initialization, base tooling, and the shared
infrastructure that every later phase depends on. No upload or
storage work happens here.

- [ ] T001 Initialize pnpm workspace and add core dependencies:
  `drizzle-orm`, `drizzle-kit`, `postgres`, `zod`, `@aws-sdk/client-s3`,
  `@aws-sdk/s3-request-presigner`, `swr`, `react-hook-form`,
  `@hookform/resolvers/zod`, `lucide-react`, plus dev deps
  `vitest`, `@playwright/test`, `pino`, `pino-pretty`
- [ ] T002 [P] Add `drizzle.config.ts` at repo root pointing at
  `src/server/db/schema` and `src/server/db/migrations`
- [ ] T003 [P] Add `vitest.config.ts` with path alias `@/* → src/*`
  and a `tests/` directory include glob
- [ ] T004 [P] Add `playwright.config.ts` with a single project
  targeting `http://localhost:3000`
- [ ] T005 [P] Add `.env.example` with every key listed in
  `quickstart.md` (DATABASE_URL, R2_*, SUPABASE_*)
- [ ] T006 Tighten `tsconfig.json` to add `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noImplicitOverride` (Constitution III)
- [ ] T007 [P] Configure ESLint `no-restricted-imports` to forbid
  `src/server/**` from any file matching `**/*.{ts,tsx}` that has
  `"use client"` in its first 20 lines, or that lives under
  `src/components/**` or `src/hooks/**`
- [ ] T008 [P] Configure Prettier (`printWidth: 100`, `singleQuote: true`,
  `trailingComma: 'all'`)
- [ ] T009 Create `src/lib/result.ts` exporting `Result<T,E>` and a
  `Result.ok` / `Result.err` constructor pair
- [ ] T010 Create `src/lib/ids.ts` exporting the branded id helpers
  (`UserId`, `FolderId`, `FileId`, `ObjectKey`) per data-model §4
- [ ] T011 Create `src/lib/env.ts` with a Zod schema validating
  `DATABASE_URL`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`,
  `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`,
  `SUPABASE_URL`, `SUPABASE_ANON_KEY`; export a frozen `env` object
- [ ] T012 Create `src/lib/logger.ts` with a `pino` instance bound to
  a `requestId` via `AsyncLocalStorage`
- [ ] T013 Create `src/lib/request-id.ts` with a Next.js middleware
  that generates `crypto.randomUUID()`, sets `x-request-id` on the
  response, and stores the id in `AsyncLocalStorage`
- [ ] T014 Create `src/server/errors.ts` defining the `AppError`
  union (UNAUTHORIZED, FOLDER_NOT_FOUND, NAME_CONFLICT, NOT_EMPTY,
  CYCLE_DETECTED, UPLOAD_TOO_LARGE, INVALID_NAME, INVALID_MIME_TYPE,
  R2_ERROR) and a `toAppError(err)` mapper
- [ ] T015 [P] Create `src/lib/schemas/common.ts` with shared Zod
  primitives (`uuid`, `safeName`, `mimeType`, `byteSize`)
- [ ] T016 [P] Add shadcn/ui primitives used by the upload UI:
  `button`, `progress`, `dialog`, `toast`, `dropdown-menu`,
  `input` — generated into `src/components/ui/`
- [ ] T017 Add `pnpm lint && pnpm typecheck && pnpm test` to a
  pre-commit hook (Husky + lint-staged)
- [ ] T018 [P] Add CI workflow `.github/workflows/ci.yml` running
  `pnpm install`, `pnpm lint`, `pnpm typecheck`, `pnpm test` on PRs

**Checkpoint**: `pnpm dev` boots; `pnpm typecheck` and `pnpm lint`
pass; `Result`, branded ids, env loader, logger, requestId middleware,
and `AppError` union are importable from any path.

---

## Phase 1: Drizzle + DB Schema

**Purpose**: Stand up the Postgres schema (`users`, `folders`, `files`)
with Drizzle, generate and apply the first migration, and lock in the
hierarchical + ownership invariants at the SQL level. This is the
phase the user requested first.

**⚠️ CRITICAL**: Phase 2 and Phase 3 cannot start until this phase
ships a migration that runs cleanly against a fresh Supabase project.

### Tests for Phase 1 (write first; they must fail before implementation)

- [ ] T019 [P] [P1] Unit test for the folder-tree service:
  `tests/unit/folder-tree.test.ts` — covers ancestor walk, cycle
  detection on `WITH RECURSIVE`, and the soft-delete filter
- [ ] T020 [P] [P1] Integration test for ownership filtering:
  `tests/integration/folder-ownership.test.ts` — uses a test Postgres
  (testcontainers or Supabase local), creates two users, asserts
  that user A cannot read or mutate user B's folders/files
- [ ] T021 [P] [P1] Integration test for cycle prevention:
  `tests/integration/cycle-prevention.test.ts` — seeds a 3-level
  chain, attempts `moveItem` of the root into the leaf, asserts
  `CYCLE_DETECTED`

### Implementation for Phase 1

- [ ] T022 [P] [P1] Drizzle schema for `users`:
  `src/server/db/schema/users.ts` per [data-model.md §2.1](./data-model.md)
- [ ] T023 [P] [P1] Drizzle schema for `folders` with self-FK
  `parent_id` and the partial unique index on
  `(owner_id, parent_id, lower(name)) WHERE deleted_at IS NULL`:
  `src/server/db/schema/folders.ts`
- [ ] T024 [P] [P1] Drizzle schema for `files` with the
  `upload_status` enum and the partial unique index on
  `(owner_id, folder_id, lower(name)) WHERE deleted_at IS NULL`:
  `src/server/db/schema/files.ts`
- [ ] T025 [P] [P1] Drizzle client + pool: `src/server/db/client.ts`
  exporting a singleton `db` using `postgres-js` driver, reading
  `DATABASE_URL` from `src/lib/env.ts`
- [ ] T026 [P] [P1] Folder-tree service (pure): `src/server/services/folder-tree.ts`
  exporting `getAncestors(folderId, userId)` and
  `wouldCreateCycle(folderId, newParentId, userId)` using the
  recursive CTE from [data-model §5](./data-model.md)
- [ ] T027 [P1] Folder Server Actions: `src/server/actions/folders.ts`
  implementing `createFolder`, `renameItem`, `moveItem`, `deleteItem`
  per their respective contract files in [contracts/](./contracts/).
  Each action returns `Result<T, AppError>`. (depends on T022-T026)
- [ ] T028 [P1] Read-only Server Actions: extend `folders.ts` with
  `getFolderContents` and `getFolderPath` (FR-030, FR-031)
- [ ] T029 [P] [P1] Zod schemas for folder actions:
  `src/lib/schemas/folders.ts` (re-uses primitives from T015)
- [ ] T030 [P1] Generate the first Drizzle migration:
  `pnpm drizzle-kit generate` → commit
  `src/server/db/migrations/0000_init.sql` (depends on T022-T024)
- [ ] T031 [P1] Apply migration to dev DB: `pnpm drizzle-kit migrate`
  in `quickstart.md`. Document the command in `package.json`
  scripts as `db:migrate`
- [ ] T032 [P1] Auth helper: `src/server/auth/session.ts` exporting
  `getCurrentUser()` that reads the Supabase session cookie and
  returns `{ id: UserId }` or throws `UNAUTHORIZED` (depends on T010)
- [ ] T033 [P1] Wire `getCurrentUser` into every folder action
  (refactor T027/T028). The folder ownership check is now one call
  followed by one SQL query (per [security §3](./spec.md))
- [ ] T034 [P1] Drive the catch-all folder page to render:
  `src/app/(auth)/drive/[[...path]]/page.tsx` as a Server Component
  that calls `getFolderContents` and `getFolderPath` and renders
  the listing. (depends on T028, T032)

**Checkpoint**: All Phase 1 tests pass; `pnpm db:migrate` applies
cleanly to a fresh Supabase project; the dev page at
`/drive/<some-folder>` lists children and shows breadcrumbs. No
upload code is in the codebase yet.

---

## Phase 2: R2 Configuration + Presigned URL Generation

**Purpose**: Wire up Cloudflare R2, generate presigned URLs (single
part and multipart), implement the finalize transaction, and ship
the upload-related Server Actions. The upload UI is NOT built yet;
this phase proves the server side end-to-end with a smoke test.

**⚠️ CRITICAL**: No HTTP `PUT` of file bytes may be invoked from
server-side code in this phase (Constitution I). All presigning
happens in Next.js; all bytes flow browser → R2.

### Tests for Phase 2 (write first)

- [ ] T035 [P] [P2] Unit test for presign: `tests/unit/presign.test.ts`
  — asserts the signed URL re-parses to the same Bucket, Key,
  ContentLength, ContentType and that TTL ≤ 900s
- [ ] T036 [P] [P2] Unit test for finalize: `tests/unit/finalize.test.ts`
  — uses an in-memory S3 stub; asserts (a) size mismatch deletes the
  object and marks the row `failed`, (b) matching etag marks
  `complete`, (c) ownership violation returns `UNAUTHORIZED`
- [ ] T037 [P] [P2] Integration test for the upload actions:
  `tests/integration/finalize-transaction.test.ts` — drives
  `generateUploadUrl` → fake `PUT` → `confirmUpload` and asserts the
  resulting `files` row state and the audit log lines

### Implementation for Phase 2

- [ ] T038 [P] [P2] R2 client: `src/server/storage/r2.ts` exporting
  a singleton `S3Client` configured for the R2 endpoint from
  `src/lib/env.ts`. The file is `server-only`; add the
  `import 'server-only'` directive at the top
- [ ] T039 [P] [P2] Presigner: `src/server/storage/presigner.ts`
  exporting `signSinglePut({ key, contentType, contentLength })` and
  `signMultipartUpload({ key, contentType, partCount, partSize })`
  and `signCompleteMultipart({ key, uploadId, parts })`. Each
  helper returns a plain object with `{ url | urls, expiresAt }`
- [ ] T040 [P] [P2] Presign service (pure): `src/server/services/presign.ts`
  exporting `buildUploadPlan(input, userId, folder)` that returns
  `{ objectKey, uploadMode: 'single' | 'multipart', partSize?,
  partCount? }`. The service contains zero I/O; it is unit-testable
- [ ] T041 [P2] Upload Server Actions: `src/server/actions/uploads.ts`
  implementing `generateUploadUrl`, `generateMultipartUploadUrl`,
  `completeMultipartUpload`, `confirmUpload`, `abortUpload`,
  `getUploadStatus` per [contracts/](./contracts/) (depends on
  T038-T040, T032)
- [ ] T042 [P] [P2] Zod schemas for upload actions:
  `src/lib/schemas/uploads.ts` (re-uses primitives from T015)
- [ ] T043 [P2] Finalize service: `src/server/services/finalize.ts`
  exporting `finalizeFile(fileId, userId)` that runs the
  HeadObject + transaction + (on failure) DeleteObject path
  (depends on T025, T038, T041)
- [ ] T044 [P2] Wire `finalizeFile` into `confirmUpload` and
  `completeMultipartUpload` (refactor T041). (depends on T043)
- [ ] T045 [P2] Route handler wrappers: `src/app/api/files/presign/route.ts`
  and `src/app/api/files/finalize/route.ts` — thin handlers that
  delegate to the Server Actions. Used by external clients and for
  curl-based smoke tests in this phase
- [ ] T046 [P] [P2] Smoke script: `scripts/r2-smoke.mjs` — signs a
  single 1 MB file via `generateUploadUrl`, performs a real `PUT`
  to R2 from Node, then calls `confirmUpload` and prints the
  resulting row. Run it once during PR review to prove the wiring
- [ ] T047 [P] [P2] Configure R2 CORS for the dev origin (document
  in `docs/r2-setup.md`): allow `PUT`, `GET`, `HEAD`; expose `ETag`;
  max age 3600

**Checkpoint**: All Phase 2 tests pass; `pnpm tsx scripts/r2-smoke.mjs`
uploads a 1 MB file to a real R2 bucket end-to-end without any bytes
traversing the Next.js server; the `files` row is `complete` with a
matching etag and size.

---

## Phase 3: Frontend Upload Component + Progress Bar

**Purpose**: Build the user-facing upload experience: a dropzone
client component, a custom `useUpload` hook that orchestrates
multipart uploads with live progress, a list of in-flight uploads,
and the typed Result/Error rendering.

### Tests for Phase 3 (write first)

- [ ] T048 [P] [P3] Component test: `tests/unit/upload-dropzone.test.tsx`
  — Vitest + Testing Library; asserts the dropzone calls
  `onFilesSelected` with the chosen file objects and rejects
  oversize uploads before any network call
- [ ] T049 [P] [P3] Hook test: `tests/unit/use-upload.test.ts` — uses
  a fake Server Action and a fake fetcher; asserts the hook
  reports per-part progress and transitions the row through
  `pending → uploading → complete` exactly once
- [ ] T050 [P3] E2E: `tests/e2e/upload-1gb.spec.ts` — Playwright
  spec; signs in, navigates to `/drive/<folder>`, dispatches a
  1 GB upload through the same code path as the UI, asserts
  (a) no request body > 1 MB hits the Next.js origin in network
  logs, (b) the file appears in the listing after `complete` (depends
  on T034, T044, T051)

### Implementation for Phase 3

- [ ] T051 [P] [P3] SWR provider: `src/components/drive/upload-provider.tsx`
  — `"use client"` component exposing a context that wraps SWR's
  mutation cache; gives `useUpload` a place to register uploads
  for the progress list
- [ ] T052 [P] [P3] Dropzone: `src/components/drive/upload-dropzone.tsx`
  — `"use client"`, shadcn-styled, accepts a single `folderId` prop,
  uses native HTML5 drag-and-drop and a hidden `<input type="file">`,
  validates size (≤ 10 GiB) and mime type locally before calling
  `useUpload`
- [ ] T053 [P3] `useUpload` hook: `src/hooks/use-upload.ts` —
  `"use client"`; signature
  `useUpload(folderId): { start(file): Promise<Result<...>>, abort(id): Promise<void>, list: UploadState[] }`.
  Internally: picks single vs. multipart based on size, calls
  `generateUploadUrl` / `generateMultipartUploadUrl`, fans out
  `fetch PUT` per part with bounded concurrency (default 4),
  computes per-part progress from `XMLHttpRequest` upload events
  OR `Response.body` readers on a streaming `fetch`, and finalizes
  with `completeMultipartUpload` / `confirmUpload`
- [ ] T054 [P3] Progress list: `src/components/drive/upload-progress-list.tsx`
  — `"use client"`; renders one `<Progress />` per in-flight upload
  with `x of N parts (NN%)` and a per-row cancel button that calls
  `abortUpload`. Mounts at the top of the drive page (depends on
  T051, T053)
- [ ] T055 [P3] Mount progress list and dropzone in the drive
  page: edit `src/app/(auth)/drive/[[...path]]/page.tsx` to
  import `UploadProvider`, `UploadDropzone`, and
  `UploadProgressList`; pass the current `folderId` as a prop.
  The page itself stays a Server Component; only the children
  carry `"use client"`. (depends on T034, T051-T054)
- [ ] T056 [P] [P3] Typed error boundary: `src/app/(auth)/drive/[[...path]]/error.tsx`
  — client component that consumes the `AppError` code and renders
  the matching localized message + recovery action
- [ ] T057 [P3] Wire SWR cache invalidation: on `complete`, the
  hook calls `mutate(getFolderContentsKey(folderId))` so the
  listing refreshes without a hard reload (depends on T028, T053)
- [ ] T058 [P3] Resume support (P3 stretch): extend `useUpload` to
  detect a network error mid-multipart, re-call
  `generateMultipartUploadUrl` to obtain fresh part URLs for
  parts not yet acknowledged, and resume. Test in T050 covers
  the "kill network, resume, complete" path

**Checkpoint**: All Phase 3 tests pass; manual smoke (drop a 1 GB
file in the dev UI) shows live progress; the file appears in the
listing; the E2E spec passes; the Next.js dev server logs contain
no request body > 1 MB.

---

## Phase 4: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple phases.

- [ ] T059 [P] [P4] Documentation: `docs/architecture.md` — a
  one-page diagram of the upload flow with the four steps from
  [spec.md §Upload Flow](./spec.md)
- [ ] T060 [P4] ADR: `docs/adr/0001-ltree-vs-recursive-cte.md`
  recording the choice in [research.md R-003](./research.md)
- [ ] T061 [P4] ADR: `docs/adr/0002-multipart-threshold.md` recording
  the 50 MB threshold (research R-002)
- [ ] T062 [P] [P4] Security pass: re-grep the codebase for any
  Server Component / client import of `src/server/**`; assert none
- [ ] T063 [P] [P4] Performance pass: add a benchmark script
  `scripts/bench-listing.mjs` that seeds 10 000 files and times
  the listing query; assert p95 < 1 s
- [ ] T064 [P4] Rate limiting: add a per-user rate limit on
  `generateUploadUrl` (e.g., 60 / min) using a simple in-memory
  token bucket; surface `RATE_LIMITED` in `AppError`
- [ ] T065 [P4] Sweep job stub: `src/server/services/sweep-stale-uploads.ts`
  exporting `sweepStaleUploads()` that finds `files` rows in
  `pending` or `uploading` for > 24 h and calls `abortUpload` on
  each; wire to a `pnpm tsx scripts/sweep.ts` cron entry (no
  scheduler needed in v1)
- [ ] T066 [P4] Re-attest Constitution Check in `plan.md` and link
  the four ADRs created above

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 0 (Setup)**: No dependencies — can start immediately.
- **Phase 1 (Drizzle + DB)**: Depends on Phase 0 completion.
  BLOCKS Phase 2 and Phase 3.
- **Phase 2 (R2 + Presign)**: Depends on Phase 1 completion
  (needs the `files` table and `getCurrentUser`). BLOCKS Phase 3.
- **Phase 3 (Frontend upload)**: Depends on Phase 2 completion
  (needs the Server Actions wired) and Phase 1's drive page
  (T034).
- **Phase 4 (Polish)**: Depends on all desired phases being
  complete.

### Within Each Phase

- Tests (T019-T021, T035-T037, T048-T050) MUST be written and
  MUST FAIL before the matching implementation tasks.
- Schemas (T022-T024, T042, T029) before services
  (T026, T040, T043) before actions (T027, T041, T044).
- Implementation before wiring (T032 before T033, T043 before
  T044, T053 before T055).
- Story complete before moving to the next phase.

### Parallel Opportunities

- All Phase 0 tasks marked [P] can run in parallel.
- All Phase 1 schema tasks (T022, T023, T024) can run in parallel.
- All Phase 1 test tasks (T019, T020, T021) can run in parallel.
- All Phase 2 test tasks (T035, T036, T037) can run in parallel.
- All Phase 3 test tasks (T048, T049) can run in parallel.
- Once Phase 1 ships, the folder page (T034) and the R2 client
  (T038) can start in parallel as long as they only touch
  different files.

---

## Implementation Strategy

### MVP First (Phase 1 + minimal Phase 2)

The minimum viable product is a working folder hierarchy you can
create, list, and navigate in the browser. That requires only
**Phase 0 + Phase 1**; uploads can be added in Phase 2.

1. Complete Phase 0: Setup.
2. Complete Phase 1: Drizzle + DB (tests T019-T021, then T022-T034).
3. **STOP and VALIDATE**: open `/drive/<folder>`, create a nested
   folder, refresh, and confirm the tree persists.
4. (Optional) Demo the MVP before moving on.

### Incremental Delivery

1. Phase 0 + Phase 1 → Folder hierarchy MVP. Demo.
2. + Phase 2 (R2 + presign) → Backend upload engine. Run the
   `r2-smoke.mjs` script to prove it. Demo via curl.
3. + Phase 3 (frontend upload + progress) → Full UX. Run the
   Playwright E2E. Demo the 1 GB upload.
4. + Phase 4 (polish) → Production-ready.

### Parallel Team Strategy

With multiple developers:

- Dev A: Phase 0 + Phase 1 schemas (T022-T024) + folder actions
  (T027-T028).
- Dev B (after T023 lands): Phase 2 R2 client (T038) + presigner
  (T039).
- Dev C (after T028 lands): Phase 3 hook skeleton (T053) with a
  fake Server Action stub; integrate once T041 lands.

---

## Notes

- [P] tasks = different files, no dependencies.
- [Phase] tag maps each task to a user-requested implementation
  phase for traceability.
- Every task lists the file path it touches in the description.
- All Phase 1 tests must fail before any Phase 1 implementation
  lands in `main`.
- Commit after each task or logical group (e.g., a single phase
  is a good commit boundary).
- Stop at any checkpoint to validate the phase independently.
- Avoid: vague tasks, same-file conflicts, cross-phase
  dependencies that break the [P] flag.
