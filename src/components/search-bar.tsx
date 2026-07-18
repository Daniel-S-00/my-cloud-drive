'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { searchItems, type SearchResult } from '@/app/actions/search';
import { File as FileIcon, Folder, LoaderCircle, Search, X } from 'lucide-react';

function SearchIcon({ className }: { className?: string }) {
  return <Search className={className} aria-hidden />;
}

function FolderIconSm({ className }: { className?: string }) {
  return <Folder className={className} aria-hidden />;
}

function FileIconSm({ className }: { className?: string }) {
  return <FileIcon className={className} aria-hidden />;
}

function Spinner({ className }: { className?: string }) {
  return <LoaderCircle className={`${className ?? ''} animate-spin`} aria-hidden />;
}

function HighlightedName({
  name,
  query,
}: {
  name: string;
  query: string;
}) {
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <>{name}</>;

  const before = name.slice(0, idx);
  const match = name.slice(idx, idx + query.length);
  const after = name.slice(idx + query.length);

  return (
    <>
      {before}
      <mark className="bg-accent-primary/30 text-text-primary rounded-sm px-0.5">
        {match}
      </mark>
      {after}
    </>
  );
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const performSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchItems(q);
      setResults(data);
      setIsOpen(true);
      setActiveIndex(-1);
    } catch {
      setResults([]);
      setIsOpen(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInputChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => performSearch(value), 300);
    },
    [performSearch],
  );

  const handleClear = useCallback(() => {
    setQuery('');
    setResults([]);
    setIsOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  }, []);

  const navigateToResult = useCallback(
    (result: SearchResult) => {
      if (result.type === 'folder') {
        router.push(`/?folder=${result.id}&highlight=${result.id}`);
      } else if (result.parentFolderId) {
        router.push(`/?folder=${result.parentFolderId}&highlight=${result.id}`);
      } else {
        router.push(`/?highlight=${result.id}`);
      }
      setIsOpen(false);
      setQuery('');
      setResults([]);
      setActiveIndex(-1);
    },
    [router],
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        setIsOpen(false);
        inputRef.current?.blur();
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < results.length - 1 ? prev + 1 : 0,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : results.length - 1,
        );
      } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
        e.preventDefault();
        navigateToResult(results[activeIndex]);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, results, activeIndex, navigateToResult]);

  const showDropdown = isOpen && (isLoading || results.length > 0 || query.trim().length >= 2);

  return (
    <div ref={containerRef} className="relative flex-1 sm:flex-none sm:w-72 lg:w-96">
      <div className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute left-2.5 h-4 w-4 text-text-secondary" />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => {
            if (results.length > 0 || query.trim().length >= 2) {
              setIsOpen(true);
            }
          }}
          placeholder="Search files and folders…"
          className="w-full rounded-lg border border-border-subtle bg-bg-surface pl-9 pr-8 py-1.5 text-sm text-text-primary placeholder:text-text-secondary outline-none focus:ring-2 focus:ring-accent-primary transition-shadow"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 flex h-5 w-5 items-center justify-center rounded text-text-secondary hover:text-text-primary transition-colors"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute top-full mt-1.5 left-0 right-0 bg-bg-surface border border-border-subtle shadow-xl rounded-lg overflow-hidden z-40">
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-sm text-text-secondary">
              <Spinner className="mr-2 h-4 w-4" />
              Searching…
            </div>
          )}

          {!isLoading && results.length === 0 && query.trim().length >= 2 && (
            <div className="py-6 text-center text-sm text-text-secondary">
              No results found for &ldquo;{query.trim()}&rdquo;
            </div>
          )}

          {!isLoading && results.length > 0 && (
            <ul role="listbox" className="py-1">
              {results.map((result, i) => (
                <li
                  key={`${result.type}-${result.id}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onClick={() => navigateToResult(result)}
                  className={[
                    'flex items-center gap-3 px-3 py-2 cursor-pointer transition-colors',
                    i === activeIndex
                      ? 'bg-accent-primary/10'
                      : 'hover:bg-bg-surface-hover',
                  ].join(' ')}
                  onMouseEnter={() => setActiveIndex(i)}
                >
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded border border-border-subtle bg-bg-surface-hover text-text-secondary">
                    {result.type === 'folder' ? (
                      <FolderIconSm className="h-4 w-4 text-accent-primary" />
                    ) : (
                      <FileIconSm className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-text-primary">
                      <HighlightedName name={result.name} query={query.trim()} />
                    </div>
                    <div className="truncate text-xs text-text-secondary">
                      {result.type === 'folder' ? 'Folder' : result.name.split('.').pop()?.toUpperCase() || 'File'}
                      {result.parentFolderName && (
                        <span>
                          {' · '}
                          {result.parentFolderName}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
