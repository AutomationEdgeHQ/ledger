import { randomUUID } from 'crypto';
import { hashSync, genSaltSync, compare } from 'bcrypt-ts';
import { eq, sql } from 'drizzle-orm';
import { getDb } from './index.js';
import { users } from './schema.js';
import { encrypt, decrypt } from './crypto.js';

/**
 * Get the total number of users.
 * Used to detect first-time setup (no users = needs setup).
 * @returns {number}
 */
export function getUserCount() {
  const db = getDb();
  const result = db.select({ count: sql`count(*)` }).from(users).get();
  return result?.count ?? 0;
}

/**
 * Find a user by email address.
 * @param {string} email
 * @returns {object|undefined}
 */
export function getUserByEmail(email) {
  const db = getDb();
  return db.select().from(users).where(eq(users.email, email.toLowerCase())).get();
}

/**
 * Create a new user with a hashed password.
 * @param {string} email
 * @param {string} password - Plain text password (will be hashed)
 * @param {string} [role='user'] - User role; admins must be set explicitly.
 * @returns {object} The created user (without password_hash)
 */
export async function createUser(email, password, role = 'user') {
  const db = getDb();
  const now = Date.now();
  const passwordHash = hashSync(password, genSaltSync(10));

  const user = {
    id: randomUUID(),
    email: email.toLowerCase(),
    passwordHash: passwordHash,
    role,
    createdAt: now,
    updatedAt: now,
  };

  db.insert(users).values(user).run();

  return { id: user.id, email: user.email, role: user.role };
}

/**
 * Atomically create the first user (admin) if no users exist.
 * Uses a transaction to prevent race conditions — only one caller wins.
 * @param {string} email
 * @param {string} password - Plain text password (will be hashed)
 * @returns {object|null} The created user, or null if users already exist
 */
export function createFirstUser(email, password) {
  const db = getDb();
  return db.transaction((tx) => {
    const count = tx.select({ count: sql`count(*)` }).from(users).get();
    if (count?.count > 0) return null;

    const now = Date.now();
    const passwordHash = hashSync(password, genSaltSync(10));
    const user = {
      id: randomUUID(),
      email: email.toLowerCase(),
      passwordHash: passwordHash,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    };
    tx.insert(users).values(user).run();
    return { id: user.id, email: user.email, role: user.role };
  });
}

/**
 * Update a user's password by email.
 * @param {string} email
 * @param {string} newPassword - Plain text password (will be hashed)
 * @returns {boolean} True if user was found and updated
 */
export function updateUserPassword(email, newPassword) {
  const db = getDb();
  const passwordHash = hashSync(newPassword, genSaltSync(10));
  const result = db.update(users)
    .set({ passwordHash, updatedAt: Date.now() })
    .where(eq(users.email, email.toLowerCase()))
    .run();
  return result.changes > 0;
}

const PUBLIC_USER_FIELDS = {
  id: users.id,
  email: users.email,
  role: users.role,
  firstName: users.firstName,
  lastName: users.lastName,
  nickname: users.nickname,
  mfaEnabled: users.mfaEnabled,
  createdAt: users.createdAt,
  updatedAt: users.updatedAt,
};

/**
 * Get all users (excluding password hashes).
 * @returns {Array<object>}
 */
export function getAllUsers() {
  const db = getDb();
  return db.select(PUBLIC_USER_FIELDS).from(users).all();
}

/**
 * Get a single user by ID (excluding password hash).
 * @param {string} id
 * @returns {object|undefined}
 */
export function getUserById(id) {
  const db = getDb();
  return db.select(PUBLIC_USER_FIELDS).from(users).where(eq(users.id, id)).get();
}

/**
 * Update a user's profile fields (first/last name, nickname) by ID.
 * @param {string} id
 * @param {{ firstName?: string|null, lastName?: string|null, nickname?: string|null }} fields
 * @returns {boolean} True if updated
 */
export function updateUserProfile(id, fields) {
  const db = getDb();
  const update = { updatedAt: Date.now() };
  if (fields.firstName !== undefined) update.firstName = fields.firstName || null;
  if (fields.lastName !== undefined) update.lastName = fields.lastName || null;
  if (fields.nickname !== undefined) update.nickname = fields.nickname || null;
  const result = db.update(users).set(update).where(eq(users.id, id)).run();
  return result.changes > 0;
}

/**
 * Delete a user by ID.
 * @param {string} id
 * @returns {boolean} True if a user was deleted
 */
export function deleteUser(id) {
  const db = getDb();
  const result = db.delete(users).where(eq(users.id, id)).run();
  return result.changes > 0;
}

/**
 * Update a user's email by ID.
 * @param {string} id
 * @param {string} newEmail
 * @returns {boolean} True if updated
 */
export function updateUserEmail(id, newEmail) {
  const db = getDb();
  const result = db.update(users)
    .set({ email: newEmail.toLowerCase(), updatedAt: Date.now() })
    .where(eq(users.id, id))
    .run();
  return result.changes > 0;
}

/**
 * Update a user's role by ID.
 * @param {string} id
 * @param {string} role
 * @returns {boolean} True if updated
 */
export function updateUserRole(id, role) {
  const db = getDb();
  const result = db.update(users)
    .set({ role, updatedAt: Date.now() })
    .where(eq(users.id, id))
    .run();
  return result.changes > 0;
}

/**
 * Update a user's password by ID.
 * @param {string} id
 * @param {string} newPassword - Plain text password (will be hashed)
 * @returns {boolean} True if updated
 */
export function updateUserPasswordById(id, newPassword) {
  const db = getDb();
  const passwordHash = hashSync(newPassword, genSaltSync(10));
  const result = db.update(users)
    .set({ passwordHash, updatedAt: Date.now() })
    .where(eq(users.id, id))
    .run();
  return result.changes > 0;
}

/**
 * Verify a password against a user's stored hash.
 * @param {object} user - User object with password_hash field
 * @param {string} password - Plain text password to verify
 * @returns {Promise<boolean>}
 */
export async function verifyPassword(user, password) {
  return compare(password, user.passwordHash);
}

/**
 * Get MFA state without the secret. Safe to expose to UI.
 * @param {string} id
 * @returns {{ mfaEnabled: boolean, mfaSetupAt: number|null,
 *             mfaFailedAttempts: number, mfaLockedUntil: number|null,
 *             recoveryCodesRemaining: number }|null}
 */
export function getUserMfaState(id) {
  const db = getDb();
  const row = db.select({
    mfaEnabled: users.mfaEnabled,
    mfaSetupAt: users.mfaSetupAt,
    mfaFailedAttempts: users.mfaFailedAttempts,
    mfaLockedUntil: users.mfaLockedUntil,
    mfaRecoveryCodes: users.mfaRecoveryCodes,
  }).from(users).where(eq(users.id, id)).get();
  if (!row) return null;
  let remaining = 0;
  try {
    const arr = row.mfaRecoveryCodes ? JSON.parse(row.mfaRecoveryCodes) : [];
    remaining = Array.isArray(arr) ? arr.length : 0;
  } catch {}
  return {
    mfaEnabled: row.mfaEnabled === 1,
    mfaSetupAt: row.mfaSetupAt,
    mfaFailedAttempts: row.mfaFailedAttempts,
    mfaLockedUntil: row.mfaLockedUntil,
    recoveryCodesRemaining: remaining,
  };
}

/**
 * Internal helper for the auth flow — returns the encrypted MFA secret and
 * recovery-code hashes for verification. Never expose this to the UI.
 * @param {string} id
 */
export function getUserMfaInternals(id) {
  const db = getDb();
  const row = db.select({
    mfaEnabled: users.mfaEnabled,
    mfaSecret: users.mfaSecret,
    mfaRecoveryCodes: users.mfaRecoveryCodes,
    mfaLockedUntil: users.mfaLockedUntil,
    mfaFailedAttempts: users.mfaFailedAttempts,
  }).from(users).where(eq(users.id, id)).get();
  if (!row) return null;
  let decryptedSecret = null;
  if (row.mfaSecret) {
    try { decryptedSecret = decrypt(row.mfaSecret); } catch {}
  }
  let recoveryHashes = [];
  try {
    const arr = row.mfaRecoveryCodes ? JSON.parse(row.mfaRecoveryCodes) : [];
    if (Array.isArray(arr)) recoveryHashes = arr;
  } catch {}
  return {
    mfaEnabled: row.mfaEnabled === 1,
    secret: decryptedSecret,
    recoveryHashes,
    mfaLockedUntil: row.mfaLockedUntil,
    mfaFailedAttempts: row.mfaFailedAttempts,
  };
}

/**
 * Enable MFA for a user. Encrypts the TOTP secret at rest and stores the
 * pre-hashed recovery codes.
 * @param {string} id
 * @param {{ secret: string, recoveryHashes: string[] }} payload
 */
export function enableUserMfa(id, { secret, recoveryHashes }) {
  const db = getDb();
  const now = Date.now();
  const result = db.update(users).set({
    mfaEnabled: 1,
    mfaSecret: encrypt(secret),
    mfaRecoveryCodes: JSON.stringify(recoveryHashes),
    mfaSetupAt: now,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    updatedAt: now,
  }).where(eq(users.id, id)).run();
  return result.changes > 0;
}

/**
 * Clear all MFA state for a user. Used by self-disable, admin reset, and CLI
 * break-glass. Audit-log the caller separately.
 * @param {string} id
 */
export function disableUserMfa(id) {
  const db = getDb();
  const result = db.update(users).set({
    mfaEnabled: 0,
    mfaSecret: null,
    mfaRecoveryCodes: null,
    mfaSetupAt: null,
    mfaFailedAttempts: 0,
    mfaLockedUntil: null,
    updatedAt: Date.now(),
  }).where(eq(users.id, id)).run();
  return result.changes > 0;
}

/**
 * Replace the recovery-code hashes (e.g. after one is consumed).
 * @param {string} id
 * @param {string[]} hashes
 */
export function updateUserRecoveryCodes(id, hashes) {
  const db = getDb();
  db.update(users).set({
    mfaRecoveryCodes: JSON.stringify(hashes),
    updatedAt: Date.now(),
  }).where(eq(users.id, id)).run();
}
