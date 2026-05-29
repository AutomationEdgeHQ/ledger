import { randomBytes } from 'crypto';
import { hashSync, genSaltSync, compareSync } from 'bcrypt-ts';

const CODE_COUNT = 10;
const CODE_BYTES = 5;

function formatCode(buf) {
  const hex = buf.toString('hex').toUpperCase();
  return `${hex.slice(0, 5)}-${hex.slice(5, 10)}`;
}

/**
 * Generate 10 fresh recovery codes. Returns the plaintext codes (shown to the
 * user ONCE) and their bcrypt hashes (stored in users.mfaRecoveryCodes as JSON).
 * @returns {{ codes: string[], hashes: string[] }}
 */
export function generateRecoveryCodes() {
  const codes = [];
  const hashes = [];
  const salt = genSaltSync(8);
  for (let i = 0; i < CODE_COUNT; i++) {
    const code = formatCode(randomBytes(CODE_BYTES));
    codes.push(code);
    hashes.push(hashSync(code, salt));
  }
  return { codes, hashes };
}

/**
 * Serialize hashes for storage in users.mfaRecoveryCodes (JSON string).
 */
export function serializeRecoveryHashes(hashes) {
  return JSON.stringify(hashes);
}

export function deserializeRecoveryHashes(json) {
  if (!json) return [];
  try {
    const arr = JSON.parse(json);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Verify a user-supplied recovery code against the stored hashes.
 * On match, returns the remaining hashes (with the consumed one removed)
 * so the caller can persist them. On miss, returns null.
 *
 * @param {string[]} hashes - The stored bcrypt hashes
 * @param {string} candidate - User input
 * @returns {string[]|null} Updated hash array on success, null on failure
 */
export function consumeRecoveryCode(hashes, candidate) {
  if (!candidate || !Array.isArray(hashes)) return null;
  const normalized = candidate.trim().toUpperCase();
  for (let i = 0; i < hashes.length; i++) {
    if (compareSync(normalized, hashes[i])) {
      return [...hashes.slice(0, i), ...hashes.slice(i + 1)];
    }
  }
  return null;
}

export const RECOVERY_CODE_COUNT = CODE_COUNT;
