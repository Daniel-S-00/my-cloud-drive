import { generateDownloadUrl } from '@/app/actions/files';

/**
 * Trigger a browser download for a live file using its short-lived
 * presigned URL. Shared by the file rows and the per-item menu.
 */
export async function downloadFile(fileId: string): Promise<void> {
  const { presignedUrl, fileName } = await generateDownloadUrl({ fileId });
  const link = document.createElement('a');
  link.href = presignedUrl;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
