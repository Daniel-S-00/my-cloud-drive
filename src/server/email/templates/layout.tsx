import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import type { ReactNode } from 'react';

// Brand tokens mirrored from src/app/globals.css. Emails can't use the
// app's Tailwind theme, so these inline styles keep every client
// (Gmail, Outlook, Apple Mail) rendering the same dark card.
const COLORS = {
  bg: '#040810',
  surface: '#0c142a',
  border: '#1d2c52',
  textPrimary: '#f2f8ff',
  textSecondary: '#94a7c9',
  accent: '#4388dd',
  accentGlow: '#6eafe6',
} as const;

const PREVIEW_MAX = 200;

type EmailLayoutProps = {
  /** Short preview text shown in the inbox list (first ~200 chars). */
  preview: string;
  /** Page title / main heading shown inside the card. */
  title: string;
  children: ReactNode;
};

export function EmailLayout({ preview, title, children }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview.slice(0, PREVIEW_MAX)}</Preview>
      <Body
        style={{
          backgroundColor: COLORS.bg,
          fontFamily:
            "Manrope, 'Segoe UI', Arial, Helvetica, sans-serif",
          margin: 0,
          padding: '32px 16px',
        }}
      >
        <Container
          style={{
            maxWidth: '560px',
            margin: '0 auto',
          }}
        >
          <Section
            style={{
              marginBottom: '24px',
              textAlign: 'center',
            }}
          >
            <Text
              style={{
                margin: 0,
                fontSize: '18px',
                fontWeight: 700,
                color: COLORS.textPrimary,
                letterSpacing: '0.5px',
              }}
            >
              My Cloud Drive
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: COLORS.surface,
              border: `1px solid ${COLORS.border}`,
              borderRadius: '16px',
              padding: '28px 24px',
            }}
          >
            <Heading
              style={{
                margin: '0 0 12px',
                fontSize: '22px',
                lineHeight: '1.3',
                fontWeight: 700,
                color: COLORS.textPrimary,
              }}
            >
              {title}
            </Heading>
            {children}
          </Section>

          <Hr
            style={{
              borderColor: COLORS.border,
              margin: '28px 0 16px',
            }}
          />
          <Text
            style={{
              margin: 0,
              fontSize: '12px',
              lineHeight: '1.6',
              color: COLORS.textSecondary,
              textAlign: 'center',
            }}
          >
            You received this email because of activity on your My Cloud
            Drive account.
            <br />
            If you didn&apos;t request it, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

/** Primary call-to-action button, usable across every template. */
export function EmailButton({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  return (
    <Section style={{ textAlign: 'center', margin: '24px 0' }}>
      <a
        href={href}
        style={{
          display: 'inline-block',
          backgroundColor: COLORS.accent,
          color: '#fff',
          textDecoration: 'none',
          fontSize: '15px',
          fontWeight: 600,
          lineHeight: 1,
          padding: '14px 28px',
          borderRadius: '10px',
        }}
      >
        {children}
      </a>
    </Section>
  );
}

/** Secondary helper text (muted, small). */
export function EmailNote({ children }: { children: ReactNode }) {
  return (
    <Text
      style={{
        margin: '0',
        fontSize: '13px',
        lineHeight: '1.6',
        color: COLORS.textSecondary,
      }}
    >
      {children}
    </Text>
  );
}
