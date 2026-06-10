import { EmailInboxPage } from 'thepopebot/chat';
import { getPageAuthState } from 'thepopebot/auth';

export const dynamic = 'force-dynamic';

export default async function EmailInboxRoute() {
  const { session } = await getPageAuthState();
  if (!session?.user?.id) return null;
  return <EmailInboxPage />;
}
