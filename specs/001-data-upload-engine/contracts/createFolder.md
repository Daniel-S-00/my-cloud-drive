# Server Action Contract: `createFolder`

**Source**: `src/server/actions/folders.ts`
**Spec FR**: FR-026
**Status**: stable

## Purpose

Create a folder under an optional parent. Enforces
`(owner_id, parent_id, lower(name))` uniqueness per the data model.

## Signature

```ts
type CreateFolderInput = {
  parentId: FolderId | null;   // null = user's root
  name: string;                // 1..255 chars, see data-model §6
};

type FolderNode = {
  id: FolderId;
  parentId: FolderId | null;
  name: string;
  createdAt: string;           // ISO 8601
};

type CreateFolderOutput = { folder: FolderNode };
type Result<CreateFolderOutput, AppError>;
```

## Behavior

1. Auth + ownership check on `parentId` (if not null).
2. Insert `folders` row. The partial unique index rejects duplicates
   → `NAME_CONFLICT`.
3. Return the new node.

## Error map

| Failure                                  | AppError code        |
|------------------------------------------|----------------------|
| No session                               | `UNAUTHORIZED`       |
| Parent missing/soft-deleted/wrong owner  | `FOLDER_NOT_FOUND`   |
| Name invalid (length/chars)              | `INVALID_NAME`       |
| Name already used in parent              | `NAME_CONFLICT`      |
