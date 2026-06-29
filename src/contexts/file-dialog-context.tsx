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
