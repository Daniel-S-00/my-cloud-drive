import type { Metadata } from 'next';
import { Instrument_Serif } from 'next/font/google';
import { Cta } from '@/components/landing/cta';
import { Features } from '@/components/landing/features';
import { Footer } from '@/components/landing/footer';
import { Hero } from '@/components/landing/hero';
import { LandingNav } from '@/components/landing/landing-nav';
import { Pillars } from '@/components/landing/pillars';
import { Security } from '@/components/landing/security';

const instrumentSerif = Instrument_Serif({
  weight: '400',
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-instrument-serif',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'My Cloud Drive — Private cloud storage',
  description:
    'A private, encrypted home for your files. Drag-and-drop uploads, shareable links, trash recovery, and two-factor security.',
};

export default function LandingPage() {
  return (
    <div
      className={`${instrumentSerif.variable} flex min-h-full flex-col bg-bg-base text-text-primary`}
    >
      <LandingNav />
      <div className="flex-1">
        <Hero />
        <Pillars />
        <Features />
        <Security />
        <Cta />
      </div>
      <Footer />
    </div>
  );
}
