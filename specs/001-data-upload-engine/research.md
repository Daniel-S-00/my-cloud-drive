# Research: Data Architecture & Upload Engine

**Phase**: 0 (resolve unknowns, choose tech)
**Spec**: [./spec.md](./spec.md)
**Date**: 2025-06-27

This document records the technical decisions for the upload engine and the
rationale behind them. It resolves every `NEEDS CLARIFICATION` from the
plan's Technical Context and locks in the patterns the implementation will
follow.

---

## R-001. R2 multipart upload against S3 v3 SDK

**Decision**: Use `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
configured with the R2 endpoint (`https://<account_id>.r2.cloudflarestorage.com`).
Use `CreateMultipartUploadCommand`, `UploadPartCommand` (one signed URL per
part), and `CompleteMultipartUploadCommand` for assembly.

**Rationale**: R2 advertises full S3 v3 multipart compatibility. The
official AWS SDK is the most actively maintained client, presigner support
is built in, and the same code works against real S3 if the team ever
needs to switch backends.

**Alternatives considered**:

- `aws4fetch` (Cloudflare Workers native) — rejected because the sign
  happens in Next.js Node runtime, not the edge, and the official SDK
  plays better with TypeScript types.
- Hand-rolled S3 signer — rejected; no benefit, more code, more bugs.
- `minio` client — rejected; less idiomatic and not aligned with the S3
  v3 vocabulary the rest of the stack uses.

---

## R-002. Single-part vs. multipart threshold

**Decision**: Multipart for files `> 50 MB`. Single-part for the rest.

**Rationale**: 50 MB is the same threshold AWS S3 itself uses as the
default in many SDKs. Below it, the overhead of `CreateMultipartUpload`
plus N part URLs is not worth it. Above it, a single 1 GB `PUT` risks
browser timeouts and offers no parallelism.

**Alternatives considered**:

- Always-multipart (5 MB parts) — overkill for small files; doubles the
  presign endpoint cost.
- Always-single — breaks the 1 GB design driver from the spec.

---

## R-003. Recursive folder traversal: `ltree` vs. recursive CTE

**Decision**: **Recursive CTE** (`WITH RECURSIVE`) on read, no `ltree`
column. Maintain `parent_id` only; compute paths in the query.

**Rationale**:

- The spec demands "infinite depth without a schema-level cap"; both
  options satisfy this, but a recursive CTE requires zero schema ceremony
  and is straightforward to test.
- The hot read path is "list this folder's contents", not "give me the
  full path of folder X". A single indexed lookup by `parent_id` is the
  primary access; full-path reconstruction is a one-off ancestor walk
  used by breadcrumbs and cycle checks.
- `ltree` adds extension dependency, index bloat, and a write-time
  cost (every rename/move walks ancestors and rewrites paths). Recursive
  CTE defers that cost to reads that need it.
- Recursive CTE is the documented Postgres idiom; portability is high.

**Alternatives considered**:

- `ltree` column with `GIST` index — chosen for paths-heavy workloads.
  Rejected for v1 because we don't read paths often.
- Closure table — normalized; rejected for the same reason as `ltree`
  (overkill for the read pattern).
- Materialized `path` string (`/a/b/c`) — rejected: renames and moves
  must cascade, and cascade-rewrites are a known footgun.

**Cycle check**: `WITH RECURSIVE ancestors(id) AS (SELECT $1 UNION SELECT
parent_id FROM folders JOIN ancestors ON folders.id = ancestors.id WHERE
folders.deleted_at IS NULL)`. If `$newParent` appears in `ancestors`,
reject the move.

---

## R-004. Object key format and naming

**Decision**: `${userId}/${uuidv4()}` — opaque, non-guessable,
user-scoped prefix.

**Rationale**:

- The `userId` prefix is useful for R2 lifecycle rules and for
  soft-deletion sweeps without DB lookups.
- `uuidv4()` is non-guessable; the spec demands non-guessable.
- The user-supplied file name MUST NEVER appear in the key (avoid
  enumeration and Unicode normalization bugs).

**Alternatives considered**:

- Content-hash keys (SHA-256 of bytes) — appealing for dedup, rejected
  for v1 because we don't know the bytes at presign time and a second
  pass would require server-side upload.
- Flat `uuidv4()` only — accepted, but loses the user-prefix benefit.

---

## R-005. `upload_status` representation

**Decision**: Postgres `enum` type `upload_status` with values
`pending`, `uploading`, `complete`, `failed`. Stored as a typed column on
`files`; mirrored in TypeScript as a string-literal union.

**Rationale**: The spec mandates the four states. A native enum is more
discoverable and indexable than a `text` column with a check constraint;
TypeScript literal union keeps the client and server in lockstep.

**Alternatives considered**:

- `text` + CHECK — accepted but weaker. The enum is a one-time setup
  cost.
- Separate `uploads` table — rejected; the spec already calls out that
  `UploadSession` is transient and the `files` row IS the upload record.

---

## R-006. Server Action transport (vs. Route Handlers)

**Decision**: Use **Next.js Server Actions** for every action in FR-021…
FR-029. Reserve **Route Handlers** only for cases that explicitly need
REST/HTTP semantics (e.g., a public webhook).

**Rationale**:

- Server Actions are callable from RSC and client components, eliminating
  the `fetch + JSON parse + revalidate` boilerplate.
- They integrate with `revalidatePath`/`revalidateTag` for cache
  invalidation out of the box.
- Per Constitution II, mutations MUST go through Server Actions or
  Route Handlers (never direct DB calls from the client).
- They still pass through the same `requestId` middleware and can return
  the same `Result<T, AppError>` shape.

**Alternatives considered**:

- All Route Handlers — accepted but adds boilerplate; Server Actions
  are the App Router's intended path for mutations.

---

## R-007. Client upload orchestration library

**Decision**: Use **SWR** for in-flight upload tracking (mutations + key
invalidation), wrapped in a custom `useUpload` hook for the multipart
orchestration. No external upload library (Uppy, tus-js-client, etc.) in
v1.

**Rationale**:

- The spec and Constitution §II both prefer SWR/React Query for client
  mutation state.
- A custom hook over `fetch` is ~150 lines: read file in chunks, sign
  per part, `Promise.all` with bounded concurrency, retry transient
  errors. The library was small enough to keep ownership.
- Avoids pulling in Uppy/tus, which have their own state machines and
  would force us to fight against the constitution's "no global store"
  rule.

**Alternatives considered**:

- `@uppy/aws-s3-multipart` — feature-rich, but ships its own state
  model and bundle weight.
- `tus-js-client` — uses tus protocol; R2 doesn't natively speak tus
  and the indirection would complicate the finalize step.

---

## R-008. Soft delete semantics

**Decision**: Soft delete via `deleted_at TIMESTAMPTZ NULL`. Hard delete
is OUT OF SCOPE for v1; a future trash-bin feature can sweep rows older
than N days.

**Rationale**: The spec mandates soft delete (FR-006). It also leaves
hard delete to a future feature. Hard delete would also require deleting
the R2 object, which is best-effort retryable and not safe to do
synchronously in a request.

**Alternatives considered**:

- Hard delete with cascading R2 sweep — rejected; unsafe in request
  context and conflicts with the "soft delete is sufficient" assumption.

---

## R-009. Result type and `AppError` union

**Decision**: Discriminated union `Result<T, AppError> = { ok: true, value: T }
| { ok: false, error: AppError }` defined in `src/lib/result.ts`. Each
`AppError` variant is `{ code, message, cause? }` with a string `code`
discriminator (`'UNAUTHORIZED' | 'FOLDER_NOT_FOUND' | ...`).

**Rationale**:

- Forces every failure mode to be modeled, named, and translated (per
  Constitution V).
- Plays nicely with TypeScript exhaustive `switch` checks.
- Easy to serialize across the Server Action boundary.

**Alternatives considered**:

- Throw exceptions — explicitly forbidden by the constitution at this
  layer.
- `neverthrow` package — accepted but adds a runtime dependency for
  what is effectively a 30-line type.

---

## R-010. requestId propagation

**Decision**: Generate `requestId = crypto.randomUUID()` in a
middleware at the edge of every request; attach it to the response via
`x-request-id`; include it in every log line and every `AppError` returned
to the client.

**Rationale**: Constitution V mandates it. UUIDs are universally
supported, cheap, and unique enough for tracing.

**Alternatives considered**:

- AsyncLocalStorage to thread it through — used in addition, but the
  primary source is the middleware-set response header.

---

## R-011. Frontend progress reporting

**Decision**: Compute progress client-side from each part's bytes-sent
delta (using `XMLHttpRequest` or `fetch` with a streaming body). Surface
in a `<Progress />` shadcn primitive.

**Rationale**: R2 returns no upload-progress headers. The only honest
source of progress is the browser. Using a stream-based `fetch` keeps
the implementation simple and works for both single and multipart paths.

**Alternatives considered**:

- Server-sent events from a progress endpoint — rejected because bytes
  never touch the server.
- WebSocket bridge — same rejection.

---

## R-012. Testing approach

**Decision**:

- **Unit (Vitest)**: presign logic, finalize logic, recursive CTE
  helper, name-uniqueness helper, Result helpers.
- **Integration (Vitest + testcontainers or Supabase local)**: Drizzle
  queries against a real Postgres, R2 mocked via a `S3Client` stub.
- **E2E (Playwright)**: a single happy-path spec that signs in, picks
  a folder, drops a synthetic 1 GB file (or a smaller real file with
  the multipart path forced), and asserts the file appears.

**Rationale**: Matches the constitution's quality gates (lint,
typecheck, test all in CI). The 1 GB E2E can be gated behind a manual
flag in CI to keep runner time reasonable.

**Alternatives considered**:

- MSW for R2 — considered, but a typed S3 stub is simpler and gives
  us access to assertions about `CompleteMultipartUpload` payloads.

---

## Resolved unknowns (from Technical Context)

- Language/Version → locked (TypeScript strict + extra flags).
- Primary Dependencies → locked.
- Storage → Postgres + R2, both S3 v3 compatible.
- Testing → Vitest + Playwright.
- Target Platform → Node 20 LTS + evergreen browsers.
- Project Type → `web-service` (full-stack Next.js).
- Performance Goals → see SC-001..SC-007.
- Constraints → see plan §Technical Context.
- Scale/Scope → see plan §Technical Context.

No `NEEDS CLARIFICATION` markers remain.
