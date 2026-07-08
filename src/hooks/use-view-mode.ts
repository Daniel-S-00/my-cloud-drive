'use client';

import { useCallback, useSyncExternalStore } from 'react';

export type ViewMode = 'list' | 'grid';

const STORAGE_KEY = 'viewMode';

function getSnapshot(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'grid' ? 'grid' : 'list';
}

function getServerSnapshot(): ViewMode {
  return 'list';
}

function subscribe(callback: () => void): () => void {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export type UseViewModeResult = {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  toggleViewMode: () => void;
};

export function useViewMode(): UseViewModeResult {
  const viewMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setViewMode = useCallback((mode: ViewMode) => {
    localStorage.setItem(STORAGE_KEY, mode);
    window.dispatchEvent(new Event('storage'));
  }, []);

  const toggleViewMode = useCallback(() => {
    setViewMode(viewMode === 'list' ? 'grid' : 'list');
  }, [viewMode, setViewMode]);

  return { viewMode, setViewMode, toggleViewMode };
}
