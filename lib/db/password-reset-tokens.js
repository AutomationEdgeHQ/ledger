import { randomUUID, randomBytes, createHash } from 'crypto';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { passwordResetTokens } from './schema.js';

const TOKEN_TTL_MS = 60 * 60 * 1000;

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a fresh URL-safe token, store its hash, return the plaintext.
 * The plaintext is what gets emailed to the user; only the hash lives in DB.
 * @param {string} userId
 * @returns {{ token: string, expiresAt: number }}
 */
export function createResetToken(userId) {
  const db = getDb();
  const now = Date.now();
  const token = randomBytes(32).toString('base64url');
  const expiresAt = now + TOKEN_TTL_MS;
  db.insert(passwordResetTokens).values({
    id: randomUUID(),
    userId,
    tokenHash: hashToken(token),
    expiresAt,
    createdAt: now,
  }).run();
  return { token, expiresAt };
}

/**
 * Verify a reset token and atomically consume it. Returns userId on success.
 * @param {string} token - The plaintext token from the email link
 * @returns {string|null}
 */
export function consumeResetToken(token) {
  const db = getDb();
  const now = Date.now();
  const tokenHash = hashToken(token);
  const row = db
    .select()
    .from(passwordResetTokens)
    .where(and(
      eq(passwordResetTokens.tokenHash, tokenHash),
      gt(passwordResetTokens.expiresAt, now),
      isNull(passwordResetTokens.usedAt),
    ))
    .get();
  if (!row) return null;
  const result = db.update(passwordResetTokens)
    .set({ usedAt: now })
    .where(and(eq(passwordResetTokens.id, row.id), isNull(passwordResetTokens.usedAt)))
    .run();
  return result.changes > 0 ? row.userId : null;
}

/**
 * Invalidate any outstanding reset tokens for a user (e.g. after successful
 * password change, so an old link in someone's inbox stops working).
 */
export function invalidateUserResetTokens(userId) {
  const db = getDb();
  const now = Date.now();
  db.update(passwordResetTokens)
    .set({ usedAt: now })
    .where(and(eq(passwordResetTokens.userId, userId), isNull(passwordResetTokens.usedAt)))
    .run();
}

/**
 * Garbage collect tokens older than 7 days.
 */
export function deleteExpiredResetTokens() {
  const db = getDb();
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  db.delete(passwordResetTokens)
    .where(sql`expires_at < ${cutoff}`)
    .run();
}
