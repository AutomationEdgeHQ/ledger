import { redirect } from 'next/navigation';
import { auth } from 'thepopebot/auth';
import { MfaChallengeForm, AsciiLogo } from 'thepopebot/auth/components';
import { isEmailBackupAvailable } from 'thepopebot/auth/mfa-actions';

export default async function MfaChallengePage() {
  const session = await auth();
  if (!session?.user) redirect('/login');
  if (!session.user.mfaRequired || session.user.mfaCompleted) redirect('/');

  const emailBackupAvailable = await isEmailBackupAvailable();

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <AsciiLogo />
      <MfaChallengeForm emailBackupAvailable={emailBackupAvailable} />
    </main>
  );
}
