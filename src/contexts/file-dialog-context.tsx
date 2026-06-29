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
