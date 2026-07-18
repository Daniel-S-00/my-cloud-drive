import { notFound } from 'next/navigation';
import { getShareByToken, getSharedPreviewUrl, incrementViewCount } from '@/app/actions/shares';
import { SharePreview } from '@/components/share-preview';

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function SharePage({ params }: PageProps) {
  const { token } = await params;

  let share: Awaited<ReturnType<typeof getShareByToken>>;
  let presignedUrl: string;

  try {
    share = await getShareByToken(token);
  } catch {
    notFound();
  }

  try {
    ({ presignedUrl } = await getSharedPreviewUrl({ token }));
  } catch {
    notFound();
  }

  await incrementViewCount(share.id);

  return (
    <SharePreview
      token={token}
      presignedUrl={presignedUrl}
      fileName={share.file.name}
      mimeType={share.file.mimeType}
      sizeBytes={share.file.sizeBytes ?? 0}
    />
  );
}
