'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type ItemActionTarget = {
  type: 'file' | 'folder';
  id: string;
  name: string;
};

export type ItemActionDialogKind = 'move' | 'rename' | null;

export type ItemActionDialogState = {
  kind: ItemActionDialogKind;
  target: ItemActionTarget | null;
};

export type ItemActionDialogContextValue = {
  state: ItemActionDialogState;
  openMoveDialog: (target: ItemActionTarget) => void;
  openRenameDialog: (target: ItemActionTarget) => void;
  closeDialog: () => void;
};

const ItemActionDialogContext = createContext<ItemActionDialogContextValue | null>(
  null,
);

export function useItemActionDialogs(): ItemActionDialogContextValue {
  const ctx = useContext(ItemActionDialogContext);
  if (!ctx) {
    throw new Error(
      'useItemActionDialogs must be used within an <ItemActionDialogProvider>',
    );
  }
  return ctx;
}

const ITEM_ACTION_DIALOG_CLOSED: ItemActionDialogState = {
  kind: null,
  target: null,
};

export function ItemActionDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<ItemActionDialogState>(
    ITEM_ACTION_DIALOG_CLOSED,
  );

  const openMoveDialog = useCallback((target: ItemActionTarget) => {
    setState({ kind: 'move', target });
  }, []);

  const openRenameDialog = useCallback((target: ItemActionTarget) => {
    setState({ kind: 'rename', target });
  }, []);

  const closeDialog = useCallback(() => {
    setState(ITEM_ACTION_DIALOG_CLOSED);
  }, []);

  const value = useMemo<ItemActionDialogContextValue>(
    () => ({ state, openMoveDialog, openRenameDialog, closeDialog }),
    [state, openMoveDialog, openRenameDialog, closeDialog],
  );

  return (
    <ItemActionDialogContext.Provider value={value}>
      {children}
    </ItemActionDialogContext.Provider>
  );
}
