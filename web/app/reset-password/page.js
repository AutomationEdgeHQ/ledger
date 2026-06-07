import { ResetPasswordForm, AsciiLogo } from 'thepopebot/auth/components';

export default async function ResetPasswordPage({ searchParams }) {
  const params = await searchParams;
  const token = typeof params?.token === 'string' ? params.token : '';

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <AsciiLogo />
      <ResetPasswordForm token={token} />
    </main>
  );
}
