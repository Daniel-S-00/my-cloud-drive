import {
  ArrowRight,
  Check,
  FileImage,
  FileText,
  Folder,
  HardDrive,
  Link2,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';
import { GlitchHeadline } from './glitch-headline';
import HeroScene from './hero-scene';

function reveal(delay: string): CSSProperties {
  return { animationDelay: delay };
}

function HeroVisual() {
  return (
    <div
      className="relative mx-auto mt-10 h-[290px] w-full max-w-4xl sm:h-[360px]"
      aria-hidden
    >
      {/* Orbit rings */}
      <div className="absolute left-1/2 top-1/2 h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent-primary/25 sm:h-[265px] sm:w-[265px] landing-spin" />
      <div className="absolute left-1/2 top-1/2 h-[290px] w-[290px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-subtle/40 sm:h-[360px] sm:w-[360px]" />

      {/* Drive core */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="landing-pulse absolute left-1/2 top-1/2 h-28 w-28 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-accent-glow/50 sm:h-32 sm:w-32" />
        <div className="relative flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-2xl border border-accent-primary/40 bg-bg-surface shadow-2xl shadow-accent-primary/25 sm:h-32 sm:w-32">
          <div className="absolute inset-0 rounded-2xl bg-accent-primary/15 blur-xl" />
          <HardDrive
            className="relative h-7 w-7 text-accent-glow"
            strokeWidth={1.5}
          />
          <span className="relative text-xs font-semibold text-text-primary">
            My Drive
          </span>
        </div>
      </div>

      {/* Floating cards */}
      <div
        className="landing-float absolute left-[2%] top-[6%] w-40 rounded-xl border border-border-subtle bg-bg-surface/80 p-3 text-left shadow-xl backdrop-blur-md sm:left-[9%] sm:top-[12%] sm:w-48"
        style={{ animationDuration: '6s' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow">
            <FileImage className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-text-primary">
              aurora.jpg
            </p>
            <p className="font-mono text-[10px] text-text-secondary">
              1.2 MB · JPG
            </p>
          </div>
        </div>
      </div>

      <div
        className="landing-float-drift absolute right-[2%] top-[20%] w-40 rounded-xl border border-border-subtle bg-bg-surface/80 p-3 text-left shadow-xl backdrop-blur-md sm:right-[8%] sm:top-[18%] sm:w-48 hidden sm:block"
        style={{ animationDuration: '8s' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow">
            <Folder className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-text-primary">
              Projects
            </p>
            <p className="font-mono text-[10px] text-text-secondary">
              128 files · 2 folders
            </p>
          </div>
        </div>
      </div>

      <div
        className="landing-float-drift absolute bottom-[12%] left-[5%] hidden items-center gap-2 rounded-xl border border-border-subtle bg-bg-surface/80 py-2 pl-2.5 pr-3.5 shadow-xl backdrop-blur-md sm:left-[14%] sm:flex"
        style={{ animationDuration: '7.5s' }}
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow">
          <Link2 className="h-3.5 w-3.5" />
        </span>
        <div className="text-left">
          <p className="text-[11px] font-medium text-text-primary">
            Share link ready
          </p>
          <p className="font-mono text-[10px] text-text-secondary">
            expires in 7 days
          </p>
        </div>
      </div>

      <div
        className="landing-float absolute bottom-[8%] right-[3%] w-40 rounded-xl border border-border-subtle bg-bg-surface/80 p-3 text-left shadow-xl backdrop-blur-md sm:bottom-[12%] sm:right-[11%] sm:w-44"
        style={{ animationDuration: '6.5s' }}
      >
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow">
            <FileText className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-text-primary">
              resume.pdf
            </p>
            <p className="font-mono text-[10px] text-text-secondary">
              240 KB · PDF
            </p>
          </div>
        </div>
        <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-bg-surface-hover">
          <div className="h-full w-3/4 rounded-full bg-accent-primary/70" />
        </div>
      </div>

      {/* Badges */}
      <div
        className="landing-float absolute right-[16%] top-[4%] hidden items-center gap-1.5 rounded-full border border-border-subtle bg-bg-surface/80 px-3 py-1.5 shadow-lg backdrop-blur-md sm:right-[22%] sm:top-[6%] sm:flex"
        style={{ animationDuration: '8.5s' }}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-accent-glow" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
          2FA on
        </span>
      </div>

      <div
        className="landing-float-drift absolute bottom-[2%] left-[16%] hidden items-center gap-1.5 rounded-full border border-border-subtle bg-bg-surface/80 px-3 py-1.5 shadow-lg backdrop-blur-md sm:bottom-[1%] sm:left-[2%] sm:flex"
        style={{ animationDuration: '9.5s' }}
      >
        <Lock className="h-3.5 w-3.5 text-accent-glow" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
          Access-controlled
        </span>
      </div>

      <div
        className="landing-float absolute right-[3%] top-[4%] flex max-[359px]:hidden items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 shadow-lg backdrop-blur-md sm:bottom-[14%] sm:left-1/2 sm:right-auto sm:top-auto sm:-translate-x-1/2"
        style={{ animationDuration: '7s' }}
      >
        <Check className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
          Upload complete
        </span>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section
      data-testid="hero"
      className="relative flex min-h-[calc(100svh-4rem)] flex-col overflow-hidden"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <HeroScene />
        {/* Scrim stack. The canvas is transparent, so the vertical wash
            only darkens the particles; the radial shield does the same
            but concentrated behind the copy, which otherwise sits on the
            brightest part of the field; the bottom fade paints the page
            colour over the clipped edge of the canvas so the section
            boundary doesn't read as a line. */}
        <div className="absolute inset-0 bg-gradient-to-b from-bg-base/70 via-bg-base/30 to-bg-base/60" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_62%_42%_at_50%_30%,rgb(4_8_16/0.78),transparent_78%)]" />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-[linear-gradient(to_bottom,transparent,rgb(4_8_16/0.55)_55%,rgb(4_8_16))]" />
        <div className="absolute left-1/2 top-[-300px] h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-accent-primary/10 blur-[120px]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 pb-12 pt-12 text-center sm:px-6 md:pt-14">
        {/* The headline's own entry is the typing reveal, so it carries no
            fade: the two would fight over the characters' visibility. */}
        <GlitchHeadline
          className="max-w-3xl text-balance font-display text-5xl font-semibold leading-[1.05] tracking-tight text-text-primary sm:text-6xl md:text-7xl"
          parts={[
            { text: 'Your files, ' },
            {
              text: 'in your orbit.',
              className: 'landing-display font-normal text-accent-glow',
            },
          ]}
        />

        <p
          className="landing-fade mt-5 max-w-xl text-balance text-base text-text-secondary"
          style={reveal('90ms')}
        >
          Drag-and-drop uploads, shareable links, trash recovery, and
          two-factor security — everything you upload stays in your orbit.
        </p>

        <div
          className="landing-fade mt-8 flex flex-wrap items-center justify-center gap-3"
          style={reveal('180ms')}
        >
          <Link
            data-testid="hero-signup"
            href="/signup"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-accent-primary px-6 text-sm font-medium text-white shadow-lg shadow-accent-primary/25 transition-colors hover:bg-accent-glow"
          >
            Create your account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            data-testid="hero-login"
            href="/login"
            className="inline-flex h-11 items-center rounded-lg border border-border-subtle bg-bg-surface/60 px-6 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-hover"
          >
            Sign in
          </Link>
        </div>

        <p
          className="landing-fade mt-6 font-mono text-xs text-text-secondary"
          style={reveal('270ms')}
        >
          NO CREDIT CARD · NO BIG-TECH LOCK-IN · YOUR DATA, YOUR RULES
        </p>

        <HeroVisual />
      </div>
    </section>
  );
}
