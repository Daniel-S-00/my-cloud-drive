'use client';

import { Download } from 'lucide-react';
import Image from 'next/image';
import { useCallback } from 'react';
import { getSharedDownloadUrl } from '@/app/actions/shares';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { toast } from 'sonner';

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function isImage(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('image/');
}

function isVideo(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('video/');
}

function isAudio(mimeType: string): boolean {
  return mimeType.toLowerCase().startsWith('audio/');
}

export type SharePreviewProps = {
  token: string;
  presignedUrl: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
};

export function SharePreview({
  token,
  presignedUrl,
  fileName,
  mimeType,
  sizeBytes,
}: SharePreviewProps) {
  const onDownload = useCallback(async () => {
    try {
      const result = await getSharedDownloadUrl({ token });
      const link = document.createElement('a');
      link.href = result.presignedUrl;
      link.download = result.fileName;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Download failed', {
        description:
          err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }, [token]);

  return (
    <div className="flex min-h-screen flex-col items-center bg-bg-base p-4">
      <Card className="w-full max-w-3xl overflow-hidden">
        <div className="flex items-center justify-between border-b border-border-subtle p-4">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-text-primary">
              {fileName}
            </h1>
            <p className="text-sm text-text-secondary">
              {mimeType ?? 'Unknown type'} · {formatBytes(sizeBytes)}
            </p>
          </div>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onDownload}
          >
            <Download className="h-4 w-4" />
            Download
          </Button>
        </div>
        <CardContent className="flex items-center justify-center p-0">
          <div className="relative flex min-h-[350px] w-full items-center justify-center bg-bg-base">
            {isVideo(mimeType) ? (
              <video
                src={presignedUrl}
                controls
                autoPlay
                playsInline
                preload="metadata"
                className="max-h-[80vh] max-w-full object-contain"
              >
                Your browser does not support video playback.
              </video>
            ) : isAudio(mimeType) ? (
              <div className="flex w-full items-center justify-center p-8">
                <audio
                  src={presignedUrl}
                  controls
                  autoPlay
                  preload="metadata"
                  className="w-full max-w-lg"
                >
                  Your browser does not support audio playback.
                </audio>
              </div>
            ) : isImage(mimeType) ? (
              <Image
                src={presignedUrl}
                alt={fileName}
                width={1920}
                height={1080}
                unoptimized
                className="max-h-[80vh] max-w-full object-contain"
              />
            ) : (
              <div className="flex flex-col items-center gap-4 p-12 text-center">
                <div className="rounded-full bg-bg-surface-hover p-6">
                  <Download className="h-10 w-10 text-text-secondary" />
                </div>
                <div>
                  <p className="text-text-primary font-medium">
                    {fileName}
                  </p>
                  <p className="text-sm text-text-secondary mt-1">
                    This file type cannot be previewed, but you can
                    still download it.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="primary"
                  onClick={onDownload}
                >
                  <Download className="h-4 w-4" />
                  Download
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
