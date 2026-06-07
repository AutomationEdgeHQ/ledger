import { eq } from 'drizzle-orm';
import { getDb } from '../db/index.js';
import { users } from '../db/schema.js';

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

/**
 * Returns lockout state without mutating. Read-side check used before prompting
 * for a code.
 * @param {{ mfaLockedUntil: number|null, mfaFailedAttempts: number }} user
 * @returns {{ locked: boolean, unlockAt: number|null }}
 */
export function getLockoutState(user) {
  const now = Date.now();
  if (user.mfaLockedUntil && user.mfaLockedUntil > now) {
    return { locked: true, unlockAt: user.mfaLockedUntil };
  }
  return { locked: false, unlockAt: null };
}

/**
 * Record a failed MFA verification. If attempts hit MAX_ATTEMPTS, set a
 * lockout window. Returns the new lockout state.
 * @param {string} userId
 * @returns {{ locked: boolean, unlockAt: number|null, attempts: number }}
 */
export function recordFailedAttempt(userId) {
  const db = getDb();
  const row = db.select({
    failed: users.mfaFailedAttempts,
    locked: users.mfaLockedUntil,
  }).from(users).where(eq(users.id, userId)).get();
  if (!row) return { locked: false, unlockAt: null, attempts: 0 };

  const nextAttempts = (row.failed || 0) + 1;
  const now = Date.now();
  const update = { mfaFailedAttempts: nextAttempts, updatedAt: now };
  let unlockAt = null;
  if (nextAttempts >= MAX_ATTEMPTS) {
    unlockAt = now + LOCKOUT_MS;
    update.mfaLockedUntil = unlockAt;
    update.mfaFailedAttempts = 0;
  }
  db.update(users).set(update).where(eq(users.id, userId)).run();
  return { locked: Boolean(unlockAt), unlockAt, attempts: nextAttempts };
}

/**
 * Clear counters on successful verification or when starting fresh.
 */
export function clearFailedAttempts(userId) {
  const db = getDb();
  db.update(users).set({
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    updatedAt: Date.now(),
  }).where(eq(users.id, userId)).run();
}

export const MFA_MAX_ATTEMPTS = MAX_ATTEMPTS;
export const MFA_LOCKOUT_MS = LOCKOUT_MS;
