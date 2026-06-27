# Server Action Contract: `getFolderPath`

**Source**: `src/server/actions/folders.ts`
**Spec FR**: FR-031
**Status**: stable

## Purpose

Return the ancestor chain of a folder for breadcrumbs. Always includes
the target itself as the last element.

## Signature

```ts
type GetFolderPathInput = { folderId: FolderId };
type GetFolderPathOutput = { path: FolderNode[] };   // root → leaf
type Result<GetFolderPathOutput, AppError>;
```

## Behavior

1. Auth + ownership check on `folderId`.
2. Recursive CTE walks `parent_id` until NULL.
3. Returns the chain in root-to-leaf order.
