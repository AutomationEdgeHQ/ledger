import { redirect } from 'next/navigation';
import { ForgotPasswordForm, AsciiLogo } from 'thepopebot/auth/components';
import { isPasswordResetAvailable } from 'thepopebot/auth/password-reset-actions';

export default async function ForgotPasswordPage() {
  const available = await isPasswordResetAvailable();
  if (!available) redirect('/login');

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <AsciiLogo />
      <ForgotPasswordForm />
    </main>
  );
}
