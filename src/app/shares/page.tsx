import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/server/auth/session';
import { getUserShares } from '@/app/actions/shares';
import { LogoutButton } from '@/components/logout-button';
import { SharesList } from '@/components/shares-list';

export const dynamic = 'force-dynamic';

export default async function SharesPage() {
  try {
    await getCurrentUser();
  } catch {
    redirect('/login');
  }

  const shares = await getUserShares();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-[1920px] flex-col gap-8 bg-bg-base px-4 py-8 text-text-primary sm:px-6 sm:py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-text-primary">
            Shared links
          </h1>
          <p className="text-sm text-text-secondary">
            {shares.length === 0
              ? 'No shared links yet. Open a file and click Share to create one.'
              : `${shares.length} shared link${shares.length === 1 ? '' : 's'}. Anyone with the link can view the file.`}
          </p>
        </div>
        <LogoutButton />
      </header>

      <SharesList shares={shares} />
    </div>
  );
}
