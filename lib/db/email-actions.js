import { randomUUID } from 'crypto';
import { and, eq, lt, desc } from 'drizzle-orm';
import { getDb } from './index.js';
import { emailActions } from './schema.js';

function now() { return Date.now(); }

/**
 * Write an action record. The permanent audit trail — never deleted.
 *
 * @param {{ messageId, accountId, userId, actionType, payload?, mode, actor?, confidence? }} opts
 * @returns {string} action id
 */
export function logAction({ messageId, accountId, userId, actionType, payload, mode, actor = 'agent', confidence }) {
  const db = getDb();
  const id = randomUUID();
  db.insert(emailActions).values({
    id,
    messageId,
    accountId,
    userId,
    actionType,
    payload: payload ? JSON.stringify(payload) : null,
    mode,
    actor,
    confidence: confidence ?? null,
    wasCorrected: 0,
    createdAt: now(),
  }).run();
  return id;
}

/** All actions for a specific message, oldest-first. */
export function listForMessage(messageId) {
  const db = getDb();
  return db
    .select()
    .from(emailActions)
    .where(eq(emailActions.messageId, messageId))
    .all();
}

/**
 * All actions for a user since a timestamp, newest-first.
 * Used by the daily briefing and the dashboard feed.
 */
export function listForUser(userId, { since, limit = 100 } = {}) {
  const db = getDb();
  const conditions = [eq(emailActions.userId, userId)];
  if (since) conditions.push(lt(emailActions.createdAt, since));
  return db
    .select()
    .from(emailActions)
    .where(and(...conditions))
    .orderBy(desc(emailActions.createdAt))
    .limit(limit)
    .all();
}

/**
 * Find pending_auto actions whose undo window has elapsed.
 * `undoWindowSec` is the maximum window; drain anything older.
 * Called by drainUndoQueue() in the pipeline.
 *
 * @param {number} undoWindowSec - maximum undo window across all guardrails
 * @returns {object[]} action rows ready to execute
 */
export function getPendingAutoReady(undoWindowSec = 60) {
  const db = getDb();
  const cutoff = now() - undoWindowSec * 1000;
  return db
    .select()
    .from(emailActions)
    .where(and(eq(emailActions.mode, 'pending_auto'), lt(emailActions.createdAt, cutoff)))
    .all();
}

/** Mark an action as corrected and link to the replacement. */
export function markCorrected(id, correctedToActionId) {
  const db = getDb();
  db.update(emailActions)
    .set({ wasCorrected: 1, correctedToActionId })
    .where(eq(emailActions.id, id))
    .run();
}

/** Promote a pending_auto action to auto (undo window passed, now executed). */
export function markAutoExecuted(id) {
  const db = getDb();
  db.update(emailActions)
    .set({ mode: 'auto' })
    .where(eq(emailActions.id, id))
    .run();
}

/** Cancel a pending_auto action (user used the undo window). */
export function cancelPendingAuto(id) {
  const db = getDb();
  db.update(emailActions)
    .set({ mode: 'cancelled' })
    .where(eq(emailActions.id, id))
    .run();
}
