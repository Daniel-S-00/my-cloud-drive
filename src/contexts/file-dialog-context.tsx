'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type FileDialogKind = 'preview' | 'delete' | null;

export type FileDialogState = {
  fileId: string | null;
  kind: FileDialogKind;
};

export type FileDialogContextValue = {
  state: FileDialogState;
  openPreviewDialog: (fileId: string) => void;
  openDeleteDialog: (fileId: string) => void;
  closeDialog: () => void;
};

const FileDialogContext = createContext<FileDialogContextValue | null>(null);

export function useFileDialogs(): FileDialogContextValue {
  const ctx = useContext(FileDialogContext);
  if (!ctx) {
    throw new Error('useFileDialogs must be used within a <FileDialogProvider>');
  }
  return ctx;
}

export function FileDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FileDialogState>({
    fileId: null,
    kind: null,
  });

  const openPreviewDialog = useCallback((fileId: string) => {
    setState({ fileId, kind: 'preview' });
  }, []);

  const openDeleteDialog = useCallback((fileId: string) => {
    setState({ fileId, kind: 'delete' });
  }, []);

  const closeDialog = useCallback(() => {
    setState({ fileId: null, kind: null });
  }, []);

  const value = useMemo<FileDialogContextValue>(
    () => ({ state, openPreviewDialog, openDeleteDialog, closeDialog }),
    [state, openPreviewDialog, openDeleteDialog, closeDialog],
  );

  return (
    <FileDialogContext.Provider value={value}>
      {children}
    </FileDialogContext.Provider>
  );
}

export type TrashDialogKind = 'restore' | 'permanent-delete' | 'empty' | null;

export type TrashDialogState = {
  fileId: string | null;
  kind: TrashDialogKind;
};

export type TrashDialogContextValue = {
  state: TrashDialogState;
  openRestoreDialog: (fileId: string) => void;
  openPermanentDeleteDialog: (fileId: string) => void;
  openEmptyDialog: () => void;
  closeDialog: () => void;
};

const TrashDialogContext = createContext<TrashDialogContextValue | null>(null);

export function useTrashDialogs(): TrashDialogContextValue {
  const ctx = useContext(TrashDialogContext);
  if (!ctx) {
    throw new Error(
      'useTrashDialogs must be used within a <TrashDialogProvider>',
    );
  }
  return ctx;
}

export function TrashDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<TrashDialogState>({
    fileId: null,
    kind: null,
  });

  const openRestoreDialog = useCallback((fileId: string) => {
    setState({ fileId, kind: 'restore' });
  }, []);

  const openPermanentDeleteDialog = useCallback((fileId: string) => {
    setState({ fileId, kind: 'permanent-delete' });
  }, []);

  const openEmptyDialog = useCallback(() => {
    setState({ fileId: null, kind: 'empty' });
  }, []);

  const closeDialog = useCallback(() => {
    setState({ fileId: null, kind: null });
  }, []);

  const value = useMemo<TrashDialogContextValue>(
    () => ({
      state,
      openRestoreDialog,
      openPermanentDeleteDialog,
      openEmptyDialog,
      closeDialog,
    }),
    [state, openRestoreDialog, openPermanentDeleteDialog, openEmptyDialog, closeDialog],
  );

  return (
    <TrashDialogContext.Provider value={value}>
      {children}
    </TrashDialogContext.Provider>
  );
}

export type FolderDialogKind = 'create' | 'delete' | null;

export type FolderDialogState = {
  kind: FolderDialogKind;
  // For 'create': the parent folder id (null = root). For 'delete': the
  // folder to delete along with a precomputed count of its contents so
  // the confirmation message can show "X files and Y subfolders".
  parentFolderId: string | null;
  targetFolder: {
    id: string;
    name: string;
    filesCount: number;
    subfoldersCount: number;
  } | null;
};

export type FolderDialogContextValue = {
  state: FolderDialogState;
  openCreateDialog: (parentFolderId: string | null) => void;
  openDeleteDialog: (target: FolderDialogState['targetFolder']) => void;
  closeDialog: () => void;
};

const FolderDialogContext = createContext<FolderDialogContextValue | null>(
  null,
);

export function useFolderDialogs(): FolderDialogContextValue {
  const ctx = useContext(FolderDialogContext);
  if (!ctx) {
    throw new Error(
      'useFolderDialogs must be used within a <FolderDialogProvider>',
    );
  }
  return ctx;
}

const FOLDER_DIALOG_CLOSED: FolderDialogState = {
  kind: null,
  parentFolderId: null,
  targetFolder: null,
};

export function FolderDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FolderDialogState>(FOLDER_DIALOG_CLOSED);

  const openCreateDialog = useCallback((parentFolderId: string | null) => {
    setState({
      kind: 'create',
      parentFolderId,
      targetFolder: null,
    });
  }, []);

  const openDeleteDialog = useCallback(
    (target: FolderDialogState['targetFolder']) => {
      setState({
        kind: 'delete',
        parentFolderId: null,
        targetFolder: target,
      });
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setState(FOLDER_DIALOG_CLOSED);
  }, []);

  const value = useMemo<FolderDialogContextValue>(
    () => ({ state, openCreateDialog, openDeleteDialog, closeDialog }),
    [state, openCreateDialog, openDeleteDialog, closeDialog],
  );

  return (
    <FolderDialogContext.Provider value={value}>
      {children}
    </FolderDialogContext.Provider>
  );
}
