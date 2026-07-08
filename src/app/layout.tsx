import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import { AuthSessionProvider } from "@/components/auth-session-provider";
import { Nav } from "@/components/nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
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
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
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
