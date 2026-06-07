import { randomUUID } from 'crypto';
import { and, eq } from 'drizzle-orm';
import { getDb } from './index.js';
import { emailGuardrails } from './schema.js';

function now() { return Date.now(); }

// System-wide default when no guardrail is configured. Shadow mode means
// the agent records what it would do but never touches the inbox without
// explicit user configuration — safe for any new user.
const SYSTEM_DEFAULT = {
  mode: 'shadow',
  confidenceThreshold: 80,
  undoWindowSec: 60,
};

/**
 * Resolve the effective guardrail for a (userId, category, sender) triple.
 *
 * Scope hierarchy (most specific wins):
 *   category_sender  →  sender  →  category  →  global  →  system default
 *
 * @returns {{ mode, confidenceThreshold, undoWindowSec, guardrailId? }}
 */
export function getEffectiveGuardrail(userId, category, sender) {
  const db = getDb();
  const rows = db
    .select()
    .from(emailGuardrails)
    .where(eq(emailGuardrails.userId, userId))
    .all();

  if (!rows.length) return { ...SYSTEM_DEFAULT };

  // Build a lookup by scope+scopeValue for fast resolution
  const byKey = {};
  for (const r of rows) {
    byKey[`${r.scope}:${r.scopeValue ?? ''}`] = r;
  }

  const pick = (row) => ({
    mode: row.mode,
    confidenceThreshold: row.confidenceThreshold,
    undoWindowSec: row.undoWindowSec,
    guardrailId: row.id,
  });

  // 1. Most specific: category + sender
  const catSenderKey = `category_sender:${category}:${sender}`;
  if (byKey[catSenderKey]) return pick(byKey[catSenderKey]);

  // 2. Sender only
  const senderKey = `sender:${sender}`;
  if (byKey[senderKey]) return pick(byKey[senderKey]);

  // 3. Category only
  const catKey = `category:${category}`;
  if (byKey[catKey]) return pick(byKey[catKey]);

  // 4. Global (user-level default)
  const globalKey = 'global:';
  if (byKey[globalKey]) return pick(byKey[globalKey]);

  return { ...SYSTEM_DEFAULT };
}

/**
 * Set or update a guardrail rule. Upserts on (userId, scope, scopeValue).
 *
 * @param {string} userId
 * @param {'global'|'category'|'sender'|'category_sender'} scope
 * @param {string|null} scopeValue
 * @param {{ mode, confidenceThreshold?, undoWindowSec? }} opts
 */
export function upsertGuardrail(userId, scope, scopeValue, { mode, confidenceThreshold, undoWindowSec } = {}) {
  const db = getDb();
  const existing = db
    .select()
    .from(emailGuardrails)
    .where(
      and(
        eq(emailGuardrails.userId, userId),
        eq(emailGuardrails.scope, scope),
        eq(emailGuardrails.scopeValue, scopeValue ?? null)
      )
    )
    .get();

  const ts = now();
  if (existing) {
    const update = { updatedAt: ts };
    if (mode !== undefined) update.mode = mode;
    if (confidenceThreshold !== undefined) update.confidenceThreshold = confidenceThreshold;
    if (undoWindowSec !== undefined) update.undoWindowSec = undoWindowSec;
    db.update(emailGuardrails).set(update).where(eq(emailGuardrails.id, existing.id)).run();
    return existing.id;
  }

  const id = randomUUID();
  db.insert(emailGuardrails).values({
    id,
    userId,
    scope,
    scopeValue: scopeValue ?? null,
    category: scope === 'category' || scope === 'category_sender' ? (scopeValue?.split(':')[0] ?? null) : null,
    mode: mode ?? 'shadow',
    confidenceThreshold: confidenceThreshold ?? 80,
    undoWindowSec: undoWindowSec ?? 60,
    exampleCount: 0,
    createdAt: ts,
    updatedAt: ts,
  }).run();
  return id;
}

/** Increment the example count (correct auto-actions build toward graduation). */
export function incrementExampleCount(id) {
  const db = getDb();
  const row = db.select({ exampleCount: emailGuardrails.exampleCount })
    .from(emailGuardrails).where(eq(emailGuardrails.id, id)).get();
  if (!row) return;
  db.update(emailGuardrails)
    .set({ exampleCount: (row.exampleCount || 0) + 1, updatedAt: now() })
    .where(eq(emailGuardrails.id, id))
    .run();
}

/** Record a correction and reset graduation progress. */
export function recordCorrection(id) {
  const db = getDb();
  db.update(emailGuardrails)
    .set({ lastCorrectionAt: now(), exampleCount: 0, updatedAt: now() })
    .where(eq(emailGuardrails.id, id))
    .run();
}

/** List all guardrails for a user (for the UI). */
export function listForUser(userId) {
  const db = getDb();
  return db.select().from(emailGuardrails).where(eq(emailGuardrails.userId, userId)).all();
}
