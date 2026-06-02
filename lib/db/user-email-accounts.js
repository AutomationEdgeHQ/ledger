import { randomUUID } from 'crypto';
import { and, eq, asc } from 'drizzle-orm';
import { getDb } from './index.js';
import { userEmailAccounts } from './schema.js';
import { encrypt, decrypt } from './crypto.js';

function now() {
  return Date.now();
}

/**
 * Shape a DB row for client/UI use — never includes decrypted tokens, and
 * reports token presence as booleans only.
 */
function toSafe(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.userId,
    provider: row.provider,
    email: row.email,
    displayName: row.displayName,
    scopes: row.scopes,
    isDefault: !!row.isDefault,
    status: row.status,
    hasRefreshToken: !!row.refreshTokenEnc,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** List a user's linked accounts (safe shape, no tokens). */
export function listAccounts(userId) {
  const db = getDb();
  const rows = db
    .select()
    .from(userEmailAccounts)
    .where(eq(userEmailAccounts.userId, userId))
    .orderBy(asc(userEmailAccounts.createdAt))
    .all();
  return rows.map(toSafe);
}

/** Raw row by id (internal — includes encrypted token columns). */
function getRow(id) {
  const db = getDb();
  return db.select().from(userEmailAccounts).where(eq(userEmailAccounts.id, id)).get();
}

function getRowByIdentity(userId, provider, email) {
  const db = getDb();
  return db
    .select()
    .from(userEmailAccounts)
    .where(
      and(
        eq(userEmailAccounts.userId, userId),
        eq(userEmailAccounts.provider, provider),
        eq(userEmailAccounts.email, email)
      )
    )
    .get();
}

/**
 * Link (or re-link) a mailbox. Upserts on (userId, provider, email) so that
 * re-authorizing an existing account refreshes its tokens in place rather than
 * erroring on the unique index. Tokens are encrypted on the way in.
 * The first account a user links becomes their default.
 * @returns {object} safe-shaped row
 */
export function linkAccount({
  userId,
  provider,
  email,
  displayName,
  refreshToken,
  accessToken,
  accessTokenExpiresAt,
  scopes,
}) {
  const db = getDb();
  const ts = now();
  const refreshTokenEnc = refreshToken ? encrypt(refreshToken) : null;
  const accessTokenEnc = accessToken ? encrypt(accessToken) : null;

  const existing = getRowByIdentity(userId, provider, email);
  if (existing) {
    db.update(userEmailAccounts)
      .set({
        displayName: displayName ?? existing.displayName,
        // Google omits a refresh_token on re-consent unless prompted — keep the
        // prior one if the exchange didn't return a new one.
        refreshTokenEnc: refreshTokenEnc ?? existing.refreshTokenEnc,
        accessTokenEnc,
        accessTokenExpiresAt: accessTokenExpiresAt ?? null,
        scopes: scopes ?? existing.scopes,
        status: 'active',
        updatedAt: ts,
      })
      .where(eq(userEmailAccounts.id, existing.id))
      .run();
    return toSafe(getRow(existing.id));
  }

  const isFirst = listAccounts(userId).length === 0;
  const row = {
    id: randomUUID(),
    userId,
    provider,
    email,
    displayName: displayName ?? null,
    refreshTokenEnc,
    accessTokenEnc,
    accessTokenExpiresAt: accessTokenExpiresAt ?? null,
    scopes: scopes ?? null,
    isDefault: isFirst ? 1 : 0,
    status: 'active',
    createdAt: ts,
    updatedAt: ts,
  };
  db.insert(userEmailAccounts).values(row).run();
  return toSafe(row);
}

/**
 * Return decrypted tokens for an account (for provider API calls / refresh).
 * @returns {{ refreshToken: string|null, accessToken: string|null, accessTokenExpiresAt: number|null, provider: string, email: string, scopes: string|null }|null}
 */
export function getDecryptedTokens(id) {
  const row = getRow(id);
  if (!row) return null;
  return {
    provider: row.provider,
    email: row.email,
    scopes: row.scopes,
    refreshToken: row.refreshTokenEnc ? decrypt(row.refreshTokenEnc) : null,
    accessToken: row.accessTokenEnc ? decrypt(row.accessTokenEnc) : null,
    accessTokenExpiresAt: row.accessTokenExpiresAt,
  };
}

/** Persist a refreshed access token (and optionally a rotated refresh token). */
export function updateTokens(id, { accessToken, accessTokenExpiresAt, refreshToken } = {}) {
  const db = getDb();
  const set = { updatedAt: now() };
  if (accessToken !== undefined) set.accessTokenEnc = accessToken ? encrypt(accessToken) : null;
  if (accessTokenExpiresAt !== undefined) set.accessTokenExpiresAt = accessTokenExpiresAt;
  if (refreshToken) set.refreshTokenEnc = encrypt(refreshToken);
  db.update(userEmailAccounts).set(set).where(eq(userEmailAccounts.id, id)).run();
}

/** Update lifecycle status: 'active' | 'paused' | 'reauth_required'. */
export function setStatus(id, status) {
  const db = getDb();
  db.update(userEmailAccounts)
    .set({ status, updatedAt: now() })
    .where(eq(userEmailAccounts.id, id))
    .run();
}

/** Make one account the user's default, clearing the flag on their others. */
export function setDefault(userId, id) {
  const db = getDb();
  const ts = now();
  db.update(userEmailAccounts)
    .set({ isDefault: 0, updatedAt: ts })
    .where(eq(userEmailAccounts.userId, userId))
    .run();
  db.update(userEmailAccounts)
    .set({ isDefault: 1, updatedAt: ts })
    .where(and(eq(userEmailAccounts.userId, userId), eq(userEmailAccounts.id, id)))
    .run();
}

/** Unlink an account, scoped to its owner so users can't delete others' rows. */
export function unlink(userId, id) {
  const db = getDb();
  db.delete(userEmailAccounts)
    .where(and(eq(userEmailAccounts.userId, userId), eq(userEmailAccounts.id, id)))
    .run();
}
