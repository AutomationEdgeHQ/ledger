import { randomUUID } from 'crypto';
import { and, eq, desc, asc, gt, lt } from 'drizzle-orm';
import { getDb } from './index.js';
import { emailMessages } from './schema.js';
import { encrypt, decrypt } from './crypto.js';

function now() { return Date.now(); }

/**
 * Store a new inbound message. Idempotent on (accountId, providerMessageId) —
 * returns the existing row (safe-shaped) if already stored.
 *
 * @param {{ accountId, userId, providerMessageId, threadId, headers, body, receivedAt }} opts
 * @returns {{ id, status, ... }} safe row (no decrypted body)
 */
export function storeMessage({ accountId, userId, providerMessageId, threadId, headers, body, receivedAt }) {
  const db = getDb();
  const existing = db
    .select({ id: emailMessages.id, status: emailMessages.status })
    .from(emailMessages)
    .where(and(eq(emailMessages.accountId, accountId), eq(emailMessages.providerMessageId, providerMessageId)))
    .get();
  if (existing) return existing;

  const id = randomUUID();
  const ts = now();
  db.insert(emailMessages).values({
    id,
    accountId,
    userId,
    providerMessageId,
    threadId,
    headers: typeof headers === 'string' ? headers : JSON.stringify(headers),
    bodyEnc: body ? encrypt(body) : null,
    receivedAt,
    status: 'pending',
    createdAt: ts,
    updatedAt: ts,
  }).run();
  return { id, status: 'pending' };
}

/**
 * Returns all pending messages for a user, oldest-first (up to limit).
 * Used by the classifier to pick up work.
 */
export function getPending(userId, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), eq(emailMessages.status, 'pending')))
    .orderBy(asc(emailMessages.receivedAt))
    .limit(limit)
    .all();
}

/**
 * Returns all classified (but not yet actioned) messages for a user.
 * Used by decide.js.
 */
export function getClassified(userId, limit = 50) {
  const db = getDb();
  return db
    .select()
    .from(emailMessages)
    .where(and(eq(emailMessages.userId, userId), eq(emailMessages.status, 'classified')))
    .orderBy(asc(emailMessages.receivedAt))
    .limit(limit)
    .all();
}

/**
 * Returns the decrypted body for a message (null if already purged).
 * Only used by the classifier — bodies are not needed beyond that.
 */
export function getDecryptedBody(id) {
  const db = getDb();
  const row = db.select({ bodyEnc: emailMessages.bodyEnc }).from(emailMessages).where(eq(emailMessages.id, id)).get();
  if (!row?.bodyEnc) return null;
  try { return decrypt(row.bodyEnc); } catch { return null; }
}

/** Persist LLM classification results; transitions status → 'classified'. */
export function setClassification(id, { classification, summary, confidence, extracted }) {
  const db = getDb();
  db.update(emailMessages).set({
    classification,
    summary,
    confidence,
    extracted: extracted ? JSON.stringify(extracted) : null,
    status: 'classified',
    updatedAt: now(),
  }).where(eq(emailMessages.id, id)).run();
}

/** Transitions status (pending → classified → actioned → cleared). */
export function setStatus(id, status) {
  const db = getDb();
  db.update(emailMessages).set({ status, updatedAt: now() }).where(eq(emailMessages.id, id)).run();
}

/**
 * Purge the encrypted body and mark cleared. Headers + classification kept.
 * Call after an action is fully resolved (sent/approved/archived).
 */
export function clearMessage(id) {
  const db = getDb();
  db.update(emailMessages).set({
    bodyEnc: null,
    status: 'cleared',
    clearedAt: now(),
    updatedAt: now(),
  }).where(eq(emailMessages.id, id)).run();
}

/**
 * The most recent receivedAt for an account — used by inbox-sync to determine
 * the `since` window. Returns null if no messages yet (sync from 24h ago).
 */
export function getLastReceivedAt(accountId) {
  const db = getDb();
  const row = db
    .select({ receivedAt: emailMessages.receivedAt })
    .from(emailMessages)
    .where(eq(emailMessages.accountId, accountId))
    .orderBy(desc(emailMessages.receivedAt))
    .limit(1)
    .get();
  return row?.receivedAt ?? null;
}

/** List messages for a user (dashboard / briefing). */
export function listForUser(userId, { status, limit = 50, since } = {}) {
  const db = getDb();
  const conditions = [eq(emailMessages.userId, userId)];
  if (status) conditions.push(eq(emailMessages.status, status));
  if (since) conditions.push(gt(emailMessages.receivedAt, since));
  return db
    .select()
    .from(emailMessages)
    .where(and(...conditions))
    .orderBy(desc(emailMessages.receivedAt))
    .limit(limit)
    .all();
}
