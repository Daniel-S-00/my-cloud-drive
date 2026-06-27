# Server Action Contract: `renameItem`

**Source**: `src/server/actions/folders.ts`
**Spec FR**: FR-027
**Status**: stable

## Purpose

Rename a folder or file. Re-validates ownership and the new name's
uniqueness within its parent / folder.

## Signature

```ts
type RenameItemInput =
  | { kind: 'folder'; id: FolderId; newName: string }
  | { kind: 'file';   id: FileId;   newName: string };

type RenameItemOutput =
  | { kind: 'folder'; folder: FolderNode }
  | { kind: 'file';   file: FileNode };

type Result<RenameItemOutput, AppError>;
```

## Behavior

1. Auth + ownership check.
2. Validate `newName` per data-model §6.
3. Update `name` (and `updated_at`).
4. The unique partial index rejects collisions → `NAME_CONFLICT`.

## Error map

| Failure                              | AppError code        |
|--------------------------------------|----------------------|
| No session                           | `UNAUTHORIZED`       |
| Item not found / wrong owner         | `FOLDER_NOT_FOUND`   |
| Name invalid                         | `INVALID_NAME`       |
| Name already used                    | `NAME_CONFLICT`      |
