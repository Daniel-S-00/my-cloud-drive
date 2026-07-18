'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ExistingShare = {
  id: string;
  shareUrl: string;
  expiresAt: string | null;
};

export type ShareDialogState = {
  fileId: string | null;
  fileName: string;
  existing: ExistingShare | null;
};

export type ShareDialogContextValue = {
  state: ShareDialogState;
  openShareDialog: (file: { id: string; name: string; existing?: ExistingShare | null }) => void;
  closeDialog: () => void;
};

const ShareDialogContext = createContext<ShareDialogContextValue | null>(null);

export function useShareDialogs(): ShareDialogContextValue {
  const ctx = useContext(ShareDialogContext);
  if (!ctx) {
    throw new Error('useShareDialogs must be used within a <ShareDialogProvider>');
  }
  return ctx;
}

const SHARE_DIALOG_CLOSED: ShareDialogState = {
  fileId: null,
  fileName: '',
  existing: null,
};

export function ShareDialogProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShareDialogState>(SHARE_DIALOG_CLOSED);

  const openShareDialog = useCallback(
    (file: { id: string; name: string; existing?: ExistingShare | null }) => {
      setState({
        fileId: file.id,
        fileName: file.name,
        existing: file.existing ?? null,
      });
    },
    [],
  );

  const closeDialog = useCallback(() => {
    setState(SHARE_DIALOG_CLOSED);
  }, []);

  const value = useMemo<ShareDialogContextValue>(
    () => ({ state, openShareDialog, closeDialog }),
    [state, openShareDialog, closeDialog],
  );

  return (
    <ShareDialogContext.Provider value={value}>
      {children}
    </ShareDialogContext.Provider>
  );
}
