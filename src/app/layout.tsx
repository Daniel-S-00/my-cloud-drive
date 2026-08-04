import type { Metadata } from "next";
import { IBM_Plex_Mono, Manrope, Syne } from "next/font/google";
import { Toaster } from "sonner";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { Nav } from "@/components/nav";
import "./globals.css";

const syne = Syne({
  subsets: ["latin"],
  variable: "--font-syne",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "My Cloud Drive",
  description: "Personal cloud storage",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`dark ${syne.variable} ${ibmPlexMono.variable} ${manrope.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-bg-base text-text-primary">
        <AuthSessionProvider>
          <Nav />
          <main className="flex-1 bg-bg-base text-text-primary">{children}</main>
          <Toaster
            theme="dark"
            position="top-right"
            closeButton
            toastOptions={{
              classNames: {
                toast:
                  'bg-bg-surface text-text-primary border border-border-subtle',
                description: 'text-text-secondary',
                title: 'text-text-primary',
                actionButton: 'bg-accent-primary text-text-primary',
                cancelButton: 'bg-bg-surface-hover text-text-secondary',
                success: 'border-accent-primary',
                error: 'border-red-500',
              },
            }}
          />
        </AuthSessionProvider>
      </body>
    </html>
  );
}
