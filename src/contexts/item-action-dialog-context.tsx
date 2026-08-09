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
  // Rename always operates on a single target (targets[0]); Move
  // supports batch (multi-select action bar).
  targets: ItemActionTarget[];
};

export type ItemActionDialogContextValue = {
  state: ItemActionDialogState;
  openMoveDialog: (targets: ItemActionTarget[]) => void;
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
  targets: [],
};

export function ItemActionDialogProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [state, setState] = useState<ItemActionDialogState>(
    ITEM_ACTION_DIALOG_CLOSED,
  );

  const openMoveDialog = useCallback((targets: ItemActionTarget[]) => {
    if (targets.length === 0) return;
    setState({ kind: 'move', targets });
  }, []);

  const openRenameDialog = useCallback((target: ItemActionTarget) => {
    setState({ kind: 'rename', targets: [target] });
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
