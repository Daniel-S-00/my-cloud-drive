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
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties } from 'react';

function reveal(delay: string): CSSProperties {
  return { animationDelay: delay };
}

function HeroVisual() {
  return (
    <div
      className="relative mx-auto mt-16 h-[420px] w-full max-w-4xl sm:h-[500px]"
      aria-hidden
    >
      {/* Orbit rings */}
      <div className="absolute left-1/2 top-1/2 h-[300px] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-accent-primary/25 sm:h-[360px] sm:w-[360px] landing-spin" />
      <div className="absolute left-1/2 top-1/2 h-[380px] w-[380px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-border-subtle/40 sm:h-[480px] sm:w-[480px]" />

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
          <span className="relative font-mono text-[10px] uppercase tracking-widest text-text-secondary">
            Core
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
        <div className="mt-2.5 h-10 rounded-md bg-gradient-to-br from-accent-primary/35 via-accent-glow/20 to-bg-surface-hover" />
      </div>

      <div
        className="landing-float-drift absolute right-[2%] top-[20%] w-40 rounded-xl border border-border-subtle bg-bg-surface/80 p-3 text-left shadow-xl backdrop-blur-md sm:right-[8%] sm:top-[18%] sm:w-48"
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
        <div className="mt-2.5 flex items-center gap-1.5">
          {['bg-accent-primary/40', 'bg-accent-glow/30', 'bg-border-subtle'].map(
            (tint) => (
              <span
                key={tint}
                className={`h-1.5 w-1.5 rounded-full ${tint}`}
              />
            ),
          )}
          <span className="ml-auto font-mono text-[10px] text-text-secondary">
            synced
          </span>
        </div>
      </div>

      <div
        className="landing-float-drift absolute bottom-[12%] left-[5%] flex items-center gap-2 rounded-xl border border-border-subtle bg-bg-surface/80 py-2 pl-2.5 pr-3.5 shadow-xl backdrop-blur-md sm:left-[14%]"
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
        className="landing-float absolute right-[16%] top-[4%] flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-surface/80 px-3 py-1.5 shadow-lg backdrop-blur-md sm:right-[22%] sm:top-[6%]"
        style={{ animationDuration: '8.5s' }}
      >
        <ShieldCheck className="h-3.5 w-3.5 text-accent-glow" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
          2FA on
        </span>
      </div>

      <div
        className="landing-float-drift absolute left-[16%] bottom-[2%] flex items-center gap-1.5 rounded-full border border-border-subtle bg-bg-surface/80 px-3 py-1.5 shadow-lg backdrop-blur-md sm:left-[24%] sm:bottom-[4%]"
        style={{ animationDuration: '9.5s' }}
      >
        <Lock className="h-3.5 w-3.5 text-accent-glow" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-text-secondary">
          Encrypted
        </span>
      </div>

      <div
        className="landing-float absolute left-1/2 bottom-[14%] flex -translate-x-1/2 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 shadow-lg backdrop-blur-md"
        style={{ animationDuration: '7s' }}
      >
        <Check className="h-3.5 w-3.5 text-emerald-400" />
        <span className="font-mono text-[10px] uppercase tracking-wider text-emerald-300">
          Upload complete
        </span>
      </div>

      <Sparkles className="absolute left-[48%] top-[4%] h-4 w-4 text-accent-glow/60" />
      <Sparkles className="absolute bottom-[24%] right-[3%] h-3 w-3 text-accent-glow/40" />
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-[-300px] h-[560px] w-[860px] -translate-x-1/2 rounded-full bg-accent-primary/15 blur-[120px]" />
      </div>

      <div className="mx-auto flex w-full max-w-6xl flex-col items-center px-4 pb-4 pt-20 text-center sm:px-6 md:pt-28">
        <p
          className="landing-fade inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-surface/60 px-3.5 py-1.5 font-mono text-xs uppercase tracking-widest text-accent-glow"
          style={reveal('0ms')}
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent-glow opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent-glow" />
          </span>
          Private cloud storage
        </p>

        <h1
          className="landing-fade mt-7 max-w-3xl text-balance font-display text-5xl font-semibold leading-[1.04] tracking-tight text-text-primary sm:text-6xl md:text-7xl"
          style={reveal('90ms')}
        >
          Your files,{' '}
          <span className="landing-display font-normal text-accent-glow">
            in your orbit.
          </span>
        </h1>

        <p
          className="landing-fade mt-6 max-w-xl text-balance text-base text-text-secondary sm:text-lg"
          style={reveal('180ms')}
        >
          My Cloud Drive is a private home for your files — drag-and-drop
          uploads, shareable links, trash recovery, and two-factor security,
          all under your control.
        </p>

        <div
          className="landing-fade mt-9 flex flex-wrap items-center justify-center gap-3"
          style={reveal('270ms')}
        >
          <Link
            href="/signup"
            className="group inline-flex h-11 items-center gap-2 rounded-lg bg-accent-primary px-6 text-sm font-medium text-white shadow-lg shadow-accent-primary/25 transition-colors hover:bg-accent-glow"
          >
            Create your account
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center rounded-lg border border-border-subtle bg-bg-surface/60 px-6 text-sm font-medium text-text-primary transition-colors hover:bg-bg-surface-hover"
          >
            Sign in
          </Link>
        </div>

        <p
          className="landing-fade mt-6 font-mono text-xs text-text-secondary"
          style={reveal('360ms')}
        >
          NO CREDIT CARD · NO BIG-TECH LOCK-IN · YOUR DATA, YOUR RULES
        </p>

        <HeroVisual />
      </div>
    </section>
  );
}
