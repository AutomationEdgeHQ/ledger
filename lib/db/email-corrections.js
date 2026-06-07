import { randomUUID } from 'crypto';
import { and, eq, desc } from 'drizzle-orm';
import { getDb } from './index.js';
import { emailCorrections } from './schema.js';

function now() { return Date.now(); }

/**
 * Record a user correction. Called whenever a user overrides an agent action.
 * These corrections become few-shot examples in the classifier prompt.
 */
export function addCorrection({ actionId, userId, originalAction, correctedAction, userNote, category, sender }) {
  const db = getDb();
  const id = randomUUID();
  db.insert(emailCorrections).values({
    id,
    actionId,
    userId,
    originalAction: JSON.stringify(originalAction),
    correctedAction: JSON.stringify(correctedAction),
    userNote: userNote ?? null,
    category: category ?? null,
    sender: sender ?? null,
    createdAt: now(),
  }).run();
  return id;
}

/**
 * Retrieve recent corrections for a user, optionally filtered by category and/or
 * sender. Used by the classifier to build few-shot examples.
 *
 * Returns up to `limit` corrections, newest-first, with parsed action objects.
 */
export function getRecentCorrections(userId, { limit = 10, category, sender } = {}) {
  const db = getDb();
  const conditions = [eq(emailCorrections.userId, userId)];
  if (category) conditions.push(eq(emailCorrections.category, category));
  if (sender) conditions.push(eq(emailCorrections.sender, sender));

  const rows = db
    .select()
    .from(emailCorrections)
    .where(and(...conditions))
    .orderBy(desc(emailCorrections.createdAt))
    .limit(limit)
    .all();

  return rows.map(r => ({
    ...r,
    originalAction: JSON.parse(r.originalAction),
    correctedAction: JSON.parse(r.correctedAction),
  }));
}
