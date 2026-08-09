import { ArrowRight, Cloud } from 'lucide-react';
import Link from 'next/link';

const links = [
  { href: '#features', label: 'Features' },
  { href: '#security', label: 'Security' },
];

export function LandingNav() {
  return (
    <header data-testid="landing-nav" className="sticky top-0 z-40 border-b border-border-subtle/70 bg-bg-base/80 backdrop-blur-md supports-[backdrop-filter]:bg-bg-base/70">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow ring-1 ring-inset ring-accent-primary/30">
            <Cloud className="h-4.5 w-4.5" strokeWidth={1.75} />
          </span>
          <span className="text-sm font-semibold tracking-tight text-text-primary">
            My Cloud Drive
          </span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-surface-hover hover:text-text-primary"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/login"
            className="rounded-md px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Sign in
          </Link>
          <Link
            href="/signup"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent-primary px-4 text-sm font-medium text-white shadow transition-colors hover:bg-accent-glow"
          >
            Get started
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </header>
  );
}
