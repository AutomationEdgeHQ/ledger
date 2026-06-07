/**
 * Guardrail engine — decides what to do with a classified message.
 *
 * Modes (per user's guardrail configuration, defaults to shadow):
 *   shadow       — record what would happen; never touch the inbox
 *   manual       — create a draft and notify the user for approval
 *   pending_auto — queue the action; execute after the undo window elapses
 *   auto         — (set by drainUndoQueue after the window) — executed
 *   off          — skip entirely; log a noop
 *
 * Undo queue: pending_auto actions are stored in email_actions with
 * mode='pending_auto'. drainUndoQueue() (called in the pipeline) executes
 * them once their createdAt + undoWindowSec has passed. This is persistent —
 * a process restart won't lose queued actions (unlike an in-memory setTimeout).
 *
 * All actions are logged to the audit trail (email_actions) regardless of mode.
 */

import { getClassified, setStatus, clearMessage } from '../db/email-messages.js';
import { logAction, getPendingAutoReady, markAutoExecuted, cancelPendingAuto } from '../db/email-actions.js';
import { getEffectiveGuardrail, incrementExampleCount } from '../db/email-guardrails.js';
import { forAccount } from './providers/index.js';
import { listAccounts } from '../db/user-email-accounts.js';

// Maps a classification category to the default action type the agent takes.
// The guardrail controls *whether* and *how* (shadow/auto/manual); this map
// controls *what* action is taken when mode permits it.
const CATEGORY_ACTION = {
  'VIP':           'label',          // mark important, keep in inbox
  'Important':     'label',
  'Action-needed': 'draft_reply',    // suggest a reply draft
  'Sales':         'archive',        // out of inbox, not trash
  'Junk':          'trash',
  'Unsubscribe':   'flag_unsubscribe', // human decides — never auto-click
  'Other':         'archive',
};

/**
 * Decide and act on one classified message.
 *
 * @param {object} msgRow - row from email_messages (status='classified')
 * @param {object} account - safe-shaped account row
 */
export async function decideMessage(msgRow, account) {
  const headers = JSON.parse(msgRow.headers);
  const category = msgRow.classification;
  const sender = headers.from || '';

  const guardrail = getEffectiveGuardrail(msgRow.userId, category, sender);
  const { mode, confidenceThreshold, undoWindowSec, guardrailId } = guardrail;

  const actionType = CATEGORY_ACTION[category] || 'archive';
  const meetsThreshold = (msgRow.confidence ?? 0) >= confidenceThreshold;

  // Common action payload for logging
  const payload = {
    category,
    actionType,
    confidence: msgRow.confidence,
    confidenceThreshold,
    undoWindowSec,
    subject: headers.subject,
    from: headers.from,
  };

  if (mode === 'off') {
    logAction({
      messageId: msgRow.id, accountId: account.id, userId: msgRow.userId,
      actionType: 'noop', payload, mode: 'off', actor: 'agent',
      confidence: msgRow.confidence,
    });
    setStatus(msgRow.id, 'actioned');
    return;
  }

  if (mode === 'shadow' || !meetsThreshold) {
    // Record the would-be action without touching the inbox.
    // Low-confidence messages in any mode also fall here until re-assessed.
    logAction({
      messageId: msgRow.id, accountId: account.id, userId: msgRow.userId,
      actionType, payload: { ...payload, shadowReason: !meetsThreshold ? 'low_confidence' : 'shadow_mode' },
      mode: 'shadow', actor: 'agent', confidence: msgRow.confidence,
    });
    setStatus(msgRow.id, 'actioned');
    return;
  }

  if (mode === 'manual') {
    // Create a draft suggestion and wait for user approval
    let draftId = null;
    if (actionType === 'draft_reply') {
      try {
        const mail = forAccount(account);
        const draft = await mail.createDraft({
          to: [sender],
          subject: `Re: ${headers.subject}`,
          body: `[AI-suggested reply — edit before sending]\n\n`,
          threadId: msgRow.threadId,
        });
        draftId = draft.draftId;
      } catch (err) {
        payload.draftError = err.message;
      }
    }
    logAction({
      messageId: msgRow.id, accountId: account.id, userId: msgRow.userId,
      actionType, payload: { ...payload, draftId },
      mode: 'manual', actor: 'agent', confidence: msgRow.confidence,
    });
    setStatus(msgRow.id, 'actioned');
    return;
  }

  // auto mode + meets threshold → queue with undo window
  logAction({
    messageId: msgRow.id, accountId: account.id, userId: msgRow.userId,
    actionType, payload, mode: 'pending_auto', actor: 'agent',
    confidence: msgRow.confidence,
  });
  setStatus(msgRow.id, 'actioned');
}

/**
 * Run decide on all classified messages for a user.
 *
 * @param {string} userId
 * @returns {{ decided: number, errors: string[] }}
 */
export async function processDecisions(userId) {
  const classified = getClassified(userId);
  const accounts = Object.fromEntries(
    listAccounts(userId).map(a => [a.id, a])
  );

  let decided = 0;
  const errors = [];

  for (const msg of classified) {
    const account = accounts[msg.accountId];
    if (!account) {
      errors.push(`no account found for message ${msg.id} (accountId: ${msg.accountId})`);
      continue;
    }
    try {
      await decideMessage(msg, account);
      decided++;
    } catch (err) {
      errors.push(`decide failed for message ${msg.id}: ${err.message}`);
    }
  }

  return { decided, errors };
}

/**
 * Execute pending_auto actions whose undo window has elapsed.
 * Called each pipeline cycle; safe to call frequently (query is indexed).
 *
 * Uses the maximum possible undo window (300s) to catch any configuration.
 * Actions past their own window are found because createdAt is indexed.
 *
 * @param {string} userId
 * @returns {{ executed: number, errors: string[] }}
 */
export async function drainUndoQueue(userId) {
  const MAX_WINDOW = 300; // never drain anything younger than this
  const ready = getPendingAutoReady(MAX_WINDOW);
  // Filter to this user's actions only
  const mine = ready.filter(a => a.userId === userId);

  const accounts = Object.fromEntries(
    listAccounts(userId).map(a => [a.id, a])
  );

  let executed = 0;
  const errors = [];

  for (const action of mine) {
    const account = accounts[action.accountId];
    if (!account) continue;

    const payload = action.payload ? JSON.parse(action.payload) : {};
    const mail = forAccount(account);

    try {
      switch (action.actionType) {
        case 'archive':
          await mail.archiveMessage(payload.providerMessageId || action.messageId);
          break;
        case 'trash':
          await mail.trashMessage(payload.providerMessageId || action.messageId);
          break;
        case 'label':
          // For VIP/Important: mark as important in the provider
          await mail.applyLabel(
            payload.providerMessageId || action.messageId,
            account.provider === 'google' ? 'IMPORTANT' : 'Important'
          );
          break;
        case 'mark_read':
          // Provider-specific read marking — noop for now (provider adapters can add later)
          break;
        case 'flag_unsubscribe':
          // Never auto-execute unsubscribe — log but skip
          markAutoExecuted(action.id);
          continue;
        default:
          // draft_reply, noop etc. — already handled at decision time, just mark done
          break;
      }

      markAutoExecuted(action.id);
      if (payload.guardrailId) incrementExampleCount(payload.guardrailId);
      // Purge body now that action is complete
      clearMessage(action.messageId);
      executed++;
    } catch (err) {
      errors.push(`drain failed for action ${action.id}: ${err.message}`);
    }
  }

  return { executed, errors };
}
