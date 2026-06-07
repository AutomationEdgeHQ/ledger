import { getPageAuthState } from 'thepopebot/auth';
import { AsciiLogo, SetupForm, LoginForm } from 'thepopebot/auth/components';
import { isPasswordResetAvailable } from 'thepopebot/auth/password-reset-actions';

// Reads live setup state + SMTP config (DB) at render — never prerender it.
export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const [{ needsSetup }, passwordResetAvailable] = await Promise.all([
    getPageAuthState(),
    isPasswordResetAvailable(),
  ]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <AsciiLogo />
      {needsSetup
        ? <SetupForm />
        : <LoginForm passwordResetAvailable={passwordResetAvailable} />
      }
    </main>
  );
}
