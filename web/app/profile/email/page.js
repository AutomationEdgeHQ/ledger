import { redirect } from 'next/navigation';
import { auth } from 'thepopebot/auth';
import { ProfileEmailPage } from 'thepopebot/chat';

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  return <ProfileEmailPage />;
}
