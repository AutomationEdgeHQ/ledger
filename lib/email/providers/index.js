/**
 * Email provider registry.
 *
 * Usage — two patterns:
 *
 *   // 1. Get the provider module for an account and call methods directly:
 *   import { getProvider } from 'thepopebot/email/providers';
 *   const provider = getProvider(account);
 *   const messages = await provider.listInbox(account, { since });
 *
 *   // 2. Get a bound helper so you never need to pass `account` again:
 *   import { forAccount } from 'thepopebot/email/providers';
 *   const mail = forAccount(account);
 *   const messages = await mail.listInbox({ since });
 *   const thread  = await mail.getThread(threadId);
 */

import * as google    from './google.js';
import * as microsoft from './microsoft.js';

const PROVIDERS = { google, microsoft };

/**
 * Return the raw provider module (google.js or microsoft.js) for an account.
 * @param {{ provider: string }} account
 */
export function getProvider(account) {
  const p = PROVIDERS[account.provider];
  if (!p) throw new Error(`Unknown email provider: "${account.provider}". Expected: google | microsoft`);
  return p;
}

/**
 * Return a bound interface for an account so callers never pass `account`
 * on every call.  All methods are thin wrappers over the provider module.
 * @param {object} account - safe-shaped row from listAccounts()
 */
export function forAccount(account) {
  const p = getProvider(account);
  return {
    listInbox:      (opts)                  => p.listInbox(account, opts),
    getThread:      (threadId)              => p.getThread(account, threadId),
    createDraft:    (opts)                  => p.createDraft(account, opts),
    sendMessage:    (opts)                  => p.sendMessage(account, opts),
    applyLabel:     (messageId, label)      => p.applyLabel(account, messageId, label),
    moveToFolder:   (messageId, folder)     => p.moveToFolder(account, messageId, folder),
    archiveMessage: (messageId)             => p.archiveMessage(account, messageId),
    trashMessage:   (messageId)             => p.trashMessage(account, messageId),
    listCalendar:   (opts)                  => p.listCalendar(account, opts),
  };
}
