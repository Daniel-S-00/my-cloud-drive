import Link from 'next/link';
import { Settings } from 'lucide-react';
import { MobileNav } from '@/components/mobile-nav';
import { SearchBar } from '@/components/search-bar';

export function AppHeader({
  trashCount,
  sharesCount,
  usedBytes,
  storageQuotaBytes,
  isSubscribed,
}: {
  trashCount: number;
  sharesCount: number;
  usedBytes: number;
  storageQuotaBytes: number;
  isSubscribed: boolean;
}) {
  return (
    <header className="z-30 shrink-0 border-b border-border-subtle bg-bg-surface/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg-surface/70">
      <div className="mx-auto flex h-14 w-full max-w-[1920px] items-center gap-4 px-4 sm:px-6">
        <MobileNav
          trashCount={trashCount}
          sharesCount={sharesCount}
          usedBytes={usedBytes}
          storageQuotaBytes={storageQuotaBytes}
          isSubscribed={isSubscribed}
        />
        <div className="flex-1" />
        <div className="w-full max-w-xl">
          <SearchBar />
        </div>
        <div className="flex flex-1 items-center justify-end">
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Settings className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
