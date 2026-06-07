/**
 * Inbox sync — polls each active linked mailbox and stores new messages.
 *
 * Design choices:
 * - `since` is derived from the most recent `receivedAt` in email_messages for
 *   the account; defaults to 24h ago on first run. No extra DB column needed.
 * - Idempotency is handled by storeMessage (unique on accountId + providerMessageId).
 * - Body is encrypted at rest immediately (AES-256-GCM via lib/db/crypto.js).
 * - Per-account failures are caught and logged; one bad account doesn't abort the run.
 */

import { listAccounts } from '../db/user-email-accounts.js';
import { storeMessage, getLastReceivedAt } from '../db/email-messages.js';
import { forAccount } from './providers/index.js';

const DEFAULT_LOOKBACK_MS = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Sync one account — fetch inbox since last known message, store new ones.
 *
 * @param {object} account - safe-shaped row from listAccounts()
 * @returns {{ synced: number, errors: string[] }}
 */
export async function syncAccount(account) {
  const errors = [];
  let synced = 0;

  if (account.status !== 'active') {
    return { synced: 0, errors: [`account ${account.id} is ${account.status}, skipping`] };
  }

  const lastAt = getLastReceivedAt(account.id);
  // Add 1ms so we don't re-fetch the most recent message every time
  const since = lastAt ? new Date(lastAt + 1) : new Date(Date.now() - DEFAULT_LOOKBACK_MS);

  const mail = forAccount(account);
  let messages;
  try {
    messages = await mail.listInbox({ since, maxResults: 100 });
  } catch (err) {
    return { synced: 0, errors: [`listInbox failed for account ${account.email}: ${err.message}`] };
  }

  for (const msg of messages) {
    try {
      // Fetch the full thread body for storage (so the classifier has it)
      let body = null;
      try {
        const thread = await mail.getThread(msg.threadId);
        // Concatenate all message bodies in the thread for context
        body = thread.messages
          .map(m => [
            `From: ${m.from}`,
            `Date: ${new Date(m.receivedAt).toISOString()}`,
            m.bodyText || '',
          ].join('\n'))
          .join('\n\n---\n\n');
      } catch {
        // Body fetch failed — store without body; classifier will have less context
        errors.push(`getThread failed for ${msg.providerMessageId}, storing without body`);
      }

      const result = storeMessage({
        accountId: account.id,
        userId: account.userId,
        providerMessageId: msg.providerMessageId,
        threadId: msg.threadId,
        headers: {
          from: msg.from,
          to: msg.to,
          subject: msg.subject,
          receivedAt: msg.receivedAt,
          labels: msg.labels,
          snippet: msg.snippet,
        },
        body,
        receivedAt: msg.receivedAt,
      });
      // storeMessage returns { status: 'pending' } for new rows,
      // or { status: existing_status } for dupes — only count new ones
      if (result.status === 'pending') synced++;
    } catch (err) {
      errors.push(`storeMessage failed for ${msg.providerMessageId}: ${err.message}`);
    }
  }

  return { synced, errors };
}

/**
 * Sync all active accounts for a user.
 *
 * @param {string} userId
 * @returns {{ total: number, errors: string[] }}
 */
export async function syncAllAccounts(userId) {
  const accounts = listAccounts(userId).filter(a => a.status === 'active');
  let total = 0;
  const allErrors = [];

  for (const account of accounts) {
    const { synced, errors } = await syncAccount(account);
    total += synced;
    allErrors.push(...errors);
  }

  return { total, errors: allErrors };
}
