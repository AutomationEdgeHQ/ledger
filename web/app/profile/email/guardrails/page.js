import { redirect } from 'next/navigation';
import { auth } from 'thepopebot/auth';
import { EmailGuardrailsPage } from 'thepopebot/chat';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin');
  return <EmailGuardrailsPage />;
}
