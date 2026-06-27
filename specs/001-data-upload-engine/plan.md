# Implementation Plan: Data Architecture & Upload Engine

**Branch**: `001-data-upload-engine` | **Date**: 2025-06-27 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-data-upload-engine/spec.md`

**Note**: This template is filled in by the `/speckit.plan` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Build the data architecture and upload engine for My Cloud Drive: a Drizzle ORM
schema for users, folders (self-referential, infinite-depth), and files
(opaque-keyed, soft-deletable); a Cloudflare R2 storage layer that issues
short-lived S3 v3 presigned URLs scoped to a single object key; and the
ownership-validating Server Actions that drive both single-part and multipart
direct browser-to-R2 uploads with server-side finalize. The frontend upload
component with live progress is delivered as the third and final task phase.

## Technical Context

- **Language/Version**: TypeScript 5.x, `strict: true` + `noUncheckedIndexedAccess`
  + `exactOptionalPropertyTypes` + `noImplicitOverride` (per Constitution III).
- **Primary Dependencies**:
  - `next@16.x` (App Router, RSC), `react@19`.
  - `drizzle-orm` + `drizzle-kit` + `postgres` (or `pg`) driver.
  - `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` against R2.
  - `zod` for input validation, `react-hook-form` + `@hookform/resolvers/zod`
    for forms.
  - `swr` for client mutation lifecycles (Constitution §II, no global store).
  - `tailwindcss@4`, `shadcn/ui` (copy-in components), `lucide-react`.
  - `vitest` for unit tests, `@playwright/test` for E2E.
- **Storage**: Postgres (Supabase) via Drizzle. Cloudflare R2 (S3 v3 compatible)
  for object bytes. Migrations under `src/server/db/migrations/`.
- **Testing**: Vitest for units + integration (with Drizzle test DB and R2
  mock); Playwright for the 1 GB happy-path E2E.
- **Target Platform**: Next.js 16 server (Vercel or self-hosted Node 20 LTS);
  evergreen browsers (Chrome/Firefox/Safari) for the upload UI.
- **Project Type**: `web-service` (Next.js full-stack with RSC + Server Actions).
- **Performance Goals**: 1 GB upload completes in < 2 min on 100 Mbps; folder
  listing p95 < 1 s for up to 10 000 items; presign endpoint p95 < 200 ms.
- **Constraints**: zero bytes traverse the Next.js server (Constitution I);
  presigned URLs ≤ 15 min TTL; storage keys opaque and `${userId}/`-prefixed;
  no `any`; all Server Actions return `Result<T, AppError>` (Constitution V).
- **Scale/Scope**: v1 supports 1–10 000 files per folder per user, files up to
  10 GB via multipart. No sharing/quota/virus-scanning in v1.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Direct-to-Cloud Transfers (I)**: All upload/download bytes flow browser ↔
  R2. Server only signs, verifies, and persists metadata. Result: **YES**
- **Server-First React (II)**: Read paths (folder listing, breadcrumbs) are
  Server Components; client components are restricted to `useUpload`,
  dropzone UI, and progress bar. Result: **YES**
- **Strict TypeScript (III)**: Zod schemas validate every Server Action input;
  branded IDs (`UserId`, `FolderId`, `FileId`, `ObjectKey`) used throughout;
  `any` forbidden. Result: **YES**
- **Hierarchical FS Data Model (IV)**: `folders` self-FK on `parent_id`,
  `WITH RECURSIVE` ancestor walk for cycle checks, `WHERE owner_id = $1`
  filter on every query, unique `(folder_id, lower(name)) WHERE deleted_at
  IS NULL` partial index, soft delete via `deleted_at`. Result: **YES**
- **Typed Errors & Observability (V)**: `Result<T, AppError>` returned from
  every action; `AppError` union includes `UnauthorizedError`,
  `FolderNotFoundError`, `NameConflictError`, `QuotaExceededError`,
  `UploadTooLargeError`, `InvalidMimeTypeError`, `R2Error`;
  `requestId` middleware propagates through every request. Result: **YES**
- **Folder Structure**: New files live under `src/server/{db,storage,actions,
  services,auth,errors.ts}`, `src/lib/{result,logger,env,schemas}`,
  `src/components/drive/`, and `src/hooks/`. No new top-level directories.
  `src/server/**` will be import-guarded by an ESLint `no-restricted-imports`
  rule. Result: **YES**

No violations to track.

## Project Structure

### Documentation (this feature)

```text
specs/001-data-upload-engine/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output (typed Server Action contracts)
│   ├── generateUploadUrl.md
│   ├── generateMultipartUploadUrl.md
│   ├── completeMultipartUpload.md
│   ├── confirmUpload.md
│   ├── abortUpload.md
│   ├── createFolder.md
│   ├── renameItem.md
│   ├── moveItem.md
│   ├── deleteItem.md
│   ├── getFolderContents.md
│   ├── getFolderPath.md
│   └── getUploadStatus.md
├── checklists/
│   └── requirements.md
└── tasks.md             # Phase 2 output (this command's primary deliverable)
```

### Source Code (repository root)

The authoritative layout is defined in `.specify/memory/constitution.md`
§"Folder Structure & Module Boundaries". The plan references that layout and
introduces the following new paths for this feature:

```text
src/
├── app/
│   ├── (auth)/
│   │   └── drive/[[...path]]/
│   │       ├── page.tsx                 # RSC: folder listing
│   │       ├── loading.tsx
│   │       └── error.tsx                # Typed AppError boundary
│   └── api/
│       └── files/
│           ├── presign/route.ts         # thin handler (delegates to action)
│           └── finalize/route.ts        # thin handler (delegates to action)
├── components/
│   ├── ui/                              # shadcn/ui (Button, Progress, Dialog, Toast, …)
│   └── drive/
│       ├── folder-grid.tsx              # RSC
│       ├── folder-row.tsx               # RSC
│       ├── breadcrumb.tsx               # RSC
│       ├── upload-dropzone.tsx          # "use client"
│       ├── upload-progress-list.tsx     # "use client"
│       └── upload-provider.tsx          # "use client" (React Query/SWR)
├── server/
│   ├── actions/
│   │   ├── uploads.ts                   # generateUploadUrl, generateMultipartUploadUrl, completeMultipartUpload, confirmUpload, abortUpload
│   │   └── folders.ts                   # createFolder, renameItem, moveItem, deleteItem
│   ├── services/
│   │   ├── presign.ts                   # Presign logic (pure)
│   │   ├── finalize.ts                  # Object verification + DB transaction
│   │   └── folder-tree.ts               # Recursive ancestor + cycle checks
│   ├── db/
│   │   ├── client.ts                    # Drizzle instance
│   │   ├── schema/
│   │   │   ├── users.ts
│   │   │   ├── folders.ts               # self-FK parent_id
│   │   │   └── files.ts                 # upload_status enum
│   │   └── migrations/                  # drizzle-kit output
│   ├── storage/
│   │   ├── r2.ts                        # S3 client (server-only)
│   │   └── presigner.ts                 # getSignedUrl helpers
│   ├── auth/
│   │   └── session.ts                   # getCurrentUser
│   └── errors.ts                        # AppError union + helpers
├── lib/
│   ├── result.ts                        # Result<T, E>
│   ├── logger.ts                        # structured JSON logger
│   ├── env.ts                           # Zod-validated env
│   ├── request-id.ts                    # requestId middleware
│   ├── ids.ts                           # branded ID helpers
│   └── schemas/
│       ├── uploads.ts                   # Zod for upload actions
│       ├── folders.ts                   # Zod for folder actions
│       └── common.ts
├── hooks/
│   └── use-upload.ts                    # client multipart orchestrator
└── types/

tests/
├── unit/                                # Vitest
│   ├── presign.test.ts
│   ├── finalize.test.ts
│   └── folder-tree.test.ts
├── integration/                         # Drizzle test DB + R2 mock
│   ├── folder-ownership.test.ts
│   ├── cycle-prevention.test.ts
│   └── finalize-transaction.test.ts
└── e2e/                                 # Playwright
    └── upload-1gb.spec.ts
```

**Structure Decision**: This feature respects the constitution's `src/{app,
server,lib,components,hooks,types}` boundary. All new code follows the
import-guard rule (server-only code never imported by client components).
The presign/finalize/folder-tree services are kept separate from the
Server Actions that call them, so each route handler stays thin (< 40
lines) and unit-testable in isolation.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No violations. The constitution gates pass as written.
