import { FileList } from '@/components/file-list';
import { FileUpload } from '@/components/file-upload';
import { LogoutButton } from '@/components/logout-button';

type SearchParams = Promise<{
  folder?: string | string[];
}>;

function pickSingle(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) {
    return value[0] ?? null;
  }
  return value ?? null;
}

export default async function HomePage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const params = await searchParams;
  const folderId = pickSingle(params.folder);

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-6 py-12">
      <header className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            My Cloud Drive
          </h1>
          <p className="text-sm text-zinc-500">
            Drop a file to upload it directly to Cloudflare R2. The bytes never
            pass through the Next.js server.
          </p>
        </div>
        <LogoutButton />
      </header>

      <section aria-label="Upload" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Upload
        </h2>
        <FileUpload folderId={folderId} />
      </section>

      <section aria-label="Files" className="flex flex-col gap-3">
        <h2 className="text-sm font-medium uppercase tracking-wide text-zinc-500">
          Files
        </h2>
        <FileList folderId={folderId} />
      </section>
    </div>
  );
}
