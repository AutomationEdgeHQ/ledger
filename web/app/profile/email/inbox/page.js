import { ProfileLayout } from 'thepopebot/chat';
import { EmailInboxPage } from 'thepopebot/chat';
import { getPageAuthState } from 'thepopebot/auth';

export const dynamic = 'force-dynamic';

export default async function EmailInboxRoute() {
  const { session } = await getPageAuthState();
  return (
    <ProfileLayout session={session}>
      <EmailInboxPage />
    </ProfileLayout>
  );
}
