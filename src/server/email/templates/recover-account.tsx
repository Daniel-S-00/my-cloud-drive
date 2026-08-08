import { Text } from '@react-email/components';
import {
  EmailButton,
  EmailLayout,
  EmailLinkFallback,
  EmailNote,
} from './layout';

export type RecoverAccountEmailProps = {
  recoveryUrl: string;
  email: string;
  gracePeriodDays: number;
};

export function RecoverAccountEmail({
  recoveryUrl,
  email,
  gracePeriodDays,
}: RecoverAccountEmailProps) {
  return (
    <EmailLayout
      preview="Your My Cloud Drive account is scheduled for deletion — recover it now."
      title="Recover your account"
    >
      <Text
        style={{
          margin: '0 0 12px',
          fontSize: '15px',
          lineHeight: '1.6',
          color: '#f2f8ff',
        }}
      >
        Your account (<strong>{email}</strong>) is scheduled for deletion.
        If this was a mistake, click below within the next{' '}
        <strong>{`${gracePeriodDays} days`}</strong> to restore it and keep
        all your files, folders, and shares.
      </Text>

      <EmailButton href={recoveryUrl}>Recover account</EmailButton>

      <EmailLinkFallback href={recoveryUrl} label="Recover my account" />

      <div style={{ height: '16px' }} />

      <EmailNote>
        If you didn&apos;t request deletion, or changed your mind, use the
        link above before the grace period ends. After that, your data
        will be permanently deleted.
      </EmailNote>
    </EmailLayout>
  );
}

export default RecoverAccountEmail;
