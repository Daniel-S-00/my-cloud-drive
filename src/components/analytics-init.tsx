'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { capturePageview } from '@/lib/analytics';

export function AnalyticsInit() {
  const pathname = usePathname();

  useEffect(() => {
    void capturePageview();
  }, [pathname]);

  return null;
}
