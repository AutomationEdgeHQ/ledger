import { randomUUID, createHash } from 'crypto';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { mfaEmailCodes } from './schema.js';

const CODE_TTL_MS = 10 * 60 * 1000;

function hashCode(code) {
  return createHash('sha256').update(code).digest('hex');
}

/**
 * Store a hashed email code with a 10-minute expiry.
 * @param {string} userId
 * @param {string} code - The plaintext 6-digit code (caller already generated it)
 * @returns {string} the row id
 */
export function createEmailCode(userId, code) {
  const db = getDb();
  const now = Date.now();
  const id = randomUUID();
  db.insert(mfaEmailCodes).values({
    id,
    userId,
    codeHash: hashCode(code),
    expiresAt: now + CODE_TTL_MS,
    createdAt: now,
  }).run();
  return id;
}

/**
 * Verify a code and atomically consume it. Returns true if matched + consumed.
 * @param {string} userId
 * @param {string} code
 * @returns {boolean}
 */
export function consumeEmailCode(userId, code) {
  const db = getDb();
  const now = Date.now();
  const codeHash = hashCode(code);
  const row = db
    .select()
    .from(mfaEmailCodes)
    .where(and(
      eq(mfaEmailCodes.userId, userId),
      eq(mfaEmailCodes.codeHash, codeHash),
      gt(mfaEmailCodes.expiresAt, now),
      isNull(mfaEmailCodes.usedAt),
    ))
    .get();
  if (!row) return false;
  const result = db.update(mfaEmailCodes)
    .set({ usedAt: now })
    .where(and(eq(mfaEmailCodes.id, row.id), isNull(mfaEmailCodes.usedAt)))
    .run();
  return result.changes > 0;
}

/**
 * Garbage collect expired/used codes older than 24 hours.
 */
export function deleteExpiredEmailCodes() {
  const db = getDb();
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  db.delete(mfaEmailCodes)
    .where(sql`expires_at < ${cutoff}`)
    .run();
}
