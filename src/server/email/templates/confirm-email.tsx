import { Text } from '@react-email/components';
import {
  EmailButton,
  EmailLayout,
  EmailLinkFallback,
  EmailNote,
} from './layout';

export type ConfirmEmailProps = {
  confirmationUrl: string;
  email: string;
};

export function ConfirmEmail({
  confirmationUrl,
  email,
}: ConfirmEmailProps) {
  return (
    <EmailLayout
      preview="Confirm your email to finish creating your My Cloud Drive account."
      title="Confirm your email"
    >
      <Text
        style={{
          margin: '0 0 12px',
          fontSize: '15px',
          lineHeight: '1.6',
          color: '#f2f8ff',
        }}
      >
        Welcome! You&apos;re one step away from your account. Confirm that{' '}
        <strong>{email}</strong> is yours and you&apos;re ready to start
        uploading.
      </Text>

      <EmailButton href={confirmationUrl}>Confirm email</EmailButton>

      <EmailLinkFallback href={confirmationUrl} label="Confirm my email" />

      <div style={{ height: '16px' }} />

      <EmailNote>
        This link expires shortly. If it stops working, request a fresh
        one from the login page.
      </EmailNote>
    </EmailLayout>
  );
}

export default ConfirmEmail;
