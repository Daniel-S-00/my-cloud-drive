'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = {
  href: string;
  label: string;
  matchPrefix?: string;
};

const ITEMS: NavItem[] = [
  { href: '/', label: 'My Drive', matchPrefix: '/' },
  { href: '/trash', label: 'Trash', matchPrefix: '/trash' },
];

function isActive(pathname: string, item: NavItem): boolean {
  if (item.href === pathname) return true;
  if (!item.matchPrefix) return false;
  if (item.matchPrefix === '/') return pathname === '/';
  return pathname === item.matchPrefix || pathname.startsWith(`${item.matchPrefix}/`);
}

export function NavLinks({ trashCount }: { trashCount: number }) {
  const pathname = usePathname() || '/';

  return (
    <>
      {ITEMS.map((item) => {
        const active = isActive(pathname, item);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={[
              'flex items-center gap-2 rounded-md px-3 py-1.5 font-medium transition-colors',
              active
                ? 'bg-zinc-900 text-white'
                : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
            ].join(' ')}
          >
            {item.label}
            {item.href === '/trash' && trashCount > 0 ? (
              <span
                className={[
                  'inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-semibold',
                  active
                    ? 'bg-white text-zinc-900'
                    : 'bg-zinc-200 text-zinc-700',
                ].join(' ')}
                aria-label={`${trashCount} files in trash`}
              >
                {trashCount}
              </span>
            ) : null}
          </Link>
        );
      })}
    </>
  );
}
