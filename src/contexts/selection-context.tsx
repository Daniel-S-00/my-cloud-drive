'use client';

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from 'react';

type SelectionContextValue = {
  selectedId: string | null;
  onSelect: (id: string) => void;
  shouldScroll: boolean;
};

const SelectionContext = createContext<SelectionContextValue | null>(null);

export function SelectionProvider({
  children,
  initialSelectedId,
}: {
  children: ReactNode;
  initialSelectedId?: string | null;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId ?? null,
  );

  const [isAutoSelected, setIsAutoSelected] = useState(!!initialSelectedId);

  const onSelect = useCallback((id: string) => {
    setIsAutoSelected(false);
    setSelectedId((prev) => (prev === id ? null : id));
  }, []);

  const shouldScroll = isAutoSelected && selectedId !== null;

  return (
    <SelectionContext.Provider value={{ selectedId, onSelect, shouldScroll }}>
      {children}
    </SelectionContext.Provider>
  );
}

export function useSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) {
    throw new Error('useSelection must be used within a SelectionProvider');
  }
  return ctx;
}
