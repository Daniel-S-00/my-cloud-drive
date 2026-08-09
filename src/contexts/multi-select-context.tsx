'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type SelectableItem = {
  type: 'file' | 'folder';
  id: string;
  name: string;
};

export type MultiSelectContextValue = {
  items: SelectableItem[];
  mode: boolean;
  isSelected: (id: string) => boolean;
  /** Long-press: start multi-select mode and add the item. */
  enter: (item: SelectableItem) => void;
  /** Tap while in selection mode: add/remove the item. */
  toggle: (item: SelectableItem) => void;
  clear: () => void;
  exit: () => void;
};

const MultiSelectContext = createContext<MultiSelectContextValue | null>(null);

export function useMultiSelect(): MultiSelectContextValue {
  const ctx = useContext(MultiSelectContext);
  if (!ctx) {
    throw new Error('useMultiSelect must be used within a MultiSelectProvider');
  }
  return ctx;
}

export function MultiSelectProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SelectableItem[]>([]);
  const [mode, setMode] = useState(false);

  const isSelected = useCallback(
    (id: string) => items.some((i) => i.id === id),
    [items],
  );

  const enter = useCallback((item: SelectableItem) => {
    setMode(true);
    setItems((prev) =>
      prev.some((i) => i.id === item.id) ? prev : [...prev, item],
    );
  }, []);

  const toggle = useCallback(
    (item: SelectableItem) => {
      const exists = items.some((i) => i.id === item.id);
      if (exists) {
        const next = items.filter((i) => i.id !== item.id);
        setItems(next);
        // Deselecting the last item ends selection mode so taps go back
        // to their normal behavior (no invisible selection state).
        if (next.length === 0) setMode(false);
      } else {
        setItems([...items, item]);
      }
    },
    [items],
  );

  const clear = useCallback(() => {
    setItems([]);
    setMode(false);
  }, []);

  const exit = useCallback(() => {
    setItems([]);
    setMode(false);
  }, []);

  const value = useMemo<MultiSelectContextValue>(
    () => ({ items, mode, isSelected, enter, toggle, clear, exit }),
    [items, mode, isSelected, enter, toggle, clear, exit],
  );

  return (
    <MultiSelectContext.Provider value={value}>
      {children}
    </MultiSelectContext.Provider>
  );
}
