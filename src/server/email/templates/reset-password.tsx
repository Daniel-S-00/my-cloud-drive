import { Text } from '@react-email/components';
import {
  EmailButton,
  EmailLayout,
  EmailLinkFallback,
  EmailNote,
} from './layout';

export type ResetPasswordEmailProps = {
  resetUrl: string;
  email: string;
};

export function ResetPasswordEmail({
  resetUrl,
  email,
}: ResetPasswordEmailProps) {
  return (
    <EmailLayout
      preview="Reset your My Cloud Drive password with this secure link."
      title="Reset your password"
    >
      <Text
        style={{
          margin: '0 0 12px',
          fontSize: '15px',
          lineHeight: '1.6',
          color: '#f2f8ff',
        }}
      >
        We received a request to reset the password for{' '}
        <strong>{email}</strong>. Click below to choose a new one. This
        link is single-use and expires shortly.
      </Text>

      <EmailButton href={resetUrl}>Reset password</EmailButton>

      <EmailLinkFallback href={resetUrl} label="Reset my password" />

      <div style={{ height: '16px' }} />

      <EmailNote>
        If you didn&apos;t request this, you can safely ignore this email
        — your password won&apos;t change.
      </EmailNote>
    </EmailLayout>
  );
}

export default ResetPasswordEmail;
