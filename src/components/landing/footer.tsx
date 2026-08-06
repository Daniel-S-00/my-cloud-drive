import { Cloud } from 'lucide-react';
import Link from 'next/link';

const productLinks = [
  { href: '#features', label: 'Features' },
  { href: '#security', label: 'Security' },
];

const accountLinks = [
  { href: '/login', label: 'Sign in' },
  { href: '/signup', label: 'Create account' },
];

export function Footer() {
  return (
    <footer data-testid="footer" className="border-t border-border-subtle/70">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 px-4 py-12 sm:px-6">
        <div className="flex flex-col justify-between gap-8 md:flex-row md:items-start">
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-primary/15 text-accent-glow ring-1 ring-inset ring-accent-primary/30">
                <Cloud className="h-4.5 w-4.5" strokeWidth={1.75} />
              </span>
              <span className="text-sm font-semibold tracking-tight text-text-primary">
                My Cloud Drive
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-text-secondary">
              A private, encrypted home for your files — built as a portfolio
              project with Next.js, PostgreSQL, and Cloudflare R2.
            </p>
          </div>

          <div className="flex gap-14">
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
                Product
              </p>
              {productLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-text-secondary transition-colors hover:text-text-primary"
                >
                  {link.label}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <p className="font-mono text-xs uppercase tracking-widest text-text-secondary">
                Account
              </p>
              {accountLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm text-text-secondary transition-colors hover:text-text-primary"
                >
                  {link.label}
                </Link>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-border-subtle/70 pt-6 sm:flex-row sm:items-center">
          <p className="font-mono text-xs text-text-secondary">
            © {new Date().getFullYear()} My Cloud Drive
          </p>
          <p className="font-mono text-xs text-text-secondary">
            BUILT WITH NEXT.JS · POSTGRESQL · CLOUDFLARE R2
          </p>
        </div>
      </div>
    </footer>
  );
}
