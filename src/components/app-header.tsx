import Link from 'next/link';
import { MobileNav } from '@/components/mobile-nav';
import { SearchBar } from '@/components/search-bar';

type HeaderUser = {
  name: string | null;
  email: string | null;
  image: string | null;
};

function userDisplayName(user: HeaderUser | null): string {
  return user?.name ?? user?.email ?? 'Settings';
}

function userInitial(user: HeaderUser | null): string {
  const source = user?.name ?? user?.email ?? '?';
  return source.trim().charAt(0).toUpperCase();
}

export function AppHeader({
  user,
  trashCount,
  sharesCount,
  usedBytes,
  storageQuotaBytes,
  isSubscribed,
  overQuota,
  plan,
}: {
  user: HeaderUser | null;
  trashCount: number;
  sharesCount: number;
  usedBytes: number;
  storageQuotaBytes: number;
  isSubscribed: boolean;
  overQuota: boolean;
  plan: string;
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
          overQuota={overQuota}
          plan={plan}
        />
        <div className="flex-1" />
        <div className="w-full max-w-xl">
          <SearchBar />
        </div>
        <div className="flex flex-1 items-center justify-end">
          <Link
            href="/settings"
            aria-label={`Open settings for ${userDisplayName(user)}`}
            title={userDisplayName(user)}
            className="group flex h-9 w-9 items-center justify-center rounded-full transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            {user?.image ? (
              // OAuth (Google/GitHub) provides the avatar; render it as
              // the account button.
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={user.image}
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full border border-border-subtle object-cover"
              />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full border border-border-subtle bg-bg-surface-hover text-sm font-semibold text-text-primary">
                {userInitial(user)}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
