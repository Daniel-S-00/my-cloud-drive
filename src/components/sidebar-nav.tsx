'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  HardDrive,
  History,
  Share2,
  Star,
  Trash2,
  type LucideIcon,
} from 'lucide-react';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
};

export function SidebarNav({
  trashCount,
  sharesCount,
}: {
  trashCount: number;
  sharesCount: number;
}) {
  const pathname = usePathname() ?? '/drive';

  const items: NavItem[] = [
    { href: '/drive', label: 'My Drive', icon: HardDrive },
    { href: '/shares', label: 'Shares', icon: Share2, badge: sharesCount },
    { href: '/trash', label: 'Trash', icon: Trash2, badge: trashCount },
  ];

  const isActive = (href: string) =>
    href === '/drive'
      ? pathname === '/drive' || pathname.startsWith('/drive')
      : pathname.startsWith(href);

  return (
    <nav className="flex flex-col gap-1" aria-label="App navigation">
      {items.map(({ href, label, icon: Icon, badge }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={[
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-accent-primary/15 text-accent-glow'
                : 'text-text-secondary hover:bg-bg-surface-hover hover:text-text-primary',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{label}</span>
            {badge !== undefined && badge > 0 ? (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-bg-surface-hover px-1.5 text-xs font-semibold text-text-secondary">
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}

      <span className="my-2 h-px bg-border-subtle" aria-hidden />

      {/* Placeholder nav items — not wired to routes yet. */}
      <span className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-text-secondary/50">
        <Star className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Favorites</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary/50">
          Soon
        </span>
      </span>
      <span className="flex cursor-not-allowed items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium text-text-secondary/50">
        <History className="h-4 w-4 shrink-0" />
        <span className="min-w-0 flex-1 truncate">Recents</span>
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary/50">
          Soon
        </span>
      </span>
    </nav>
  );
}
