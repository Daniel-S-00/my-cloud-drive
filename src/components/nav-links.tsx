'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Settings } from 'lucide-react';
import { SearchBar } from '@/components/search-bar';

type NavItem = {
  href: string;
  label: string;
  matchPrefix?: string;
};

const ITEMS: NavItem[] = [
  { href: '/drive', label: 'My Drive', matchPrefix: '/drive' },
  { href: '/shares', label: 'Shares', matchPrefix: '/shares' },
  { href: '/trash', label: 'Trash', matchPrefix: '/trash' },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === pathname) return true;
  if (!item.matchPrefix) return false;
  return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
}

function shortId(id: string): string {
  return id.length <= 8 ? id : `${id.slice(0, 8)}…`;
}

export function NavLinks({ trashCount }: { trashCount: number }) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const folderId = pathname === '/drive' ? searchParams.get('folder') : null;

  return (
    <>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <div key={item.href} className="flex items-center gap-1">
            <Link
              href={item.href}
              className={[
                'flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors',
                active
                  ? 'bg-accent-primary text-white'
                  : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary',
              ].join(' ')}
            >
              {item.label}
              {item.href === '/trash' && trashCount > 0 ? (
                <span
                  className={[
                    'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                    active
                      ? 'bg-bg-base text-accent-glow'
                      : 'bg-bg-surface-hover text-text-secondary',
                  ].join(' ')}
                  aria-label={`${trashCount} files in trash`}
                >
                  {trashCount}
                </span>
              ) : null}
            </Link>
            {item.href === '/drive' && folderId ? (
              <span
                aria-hidden
                className="ml-1 max-w-[14rem] truncate rounded bg-bg-surface-hover px-2 py-0.5 font-mono text-xs text-text-secondary"
                title={`Folder ${folderId}`}
              >
                {shortId(folderId)}
              </span>
            ) : null}
          </div>
        );
      })}
      <div className="hidden sm:block sm:ml-auto" />
      <SearchBar />
      <div className="flex items-center">
        <Link
          href="/settings"
          className={[
            'flex items-center gap-2 rounded-md px-2 py-1.5 font-medium transition-colors',
            pathname === '/settings'
              ? 'bg-accent-primary text-white'
              : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary',
          ].join(' ')}
          title="Settings"
        >
          <Settings className="h-4 w-4" />
          <span className="sm:hidden">Settings</span>
        </Link>
      </div>
    </>
  );
}
