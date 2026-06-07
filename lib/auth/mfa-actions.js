'use server';

import { auth, signOut, unstable_update } from './index.js';
import {
  getUserMfaInternals,
  getUserMfaState,
  enableUserMfa,
  disableUserMfa,
  updateUserRecoveryCodes,
  getUserByEmail,
  verifyPassword,
} from '../db/users.js';
import {
  generateSecret,
  getProvisioningUri,
  getQrDataUrl,
  verifyToken,
} from '../mfa/totp.js';
import {
  generateRecoveryCodes,
  consumeRecoveryCode,
} from '../mfa/recovery-codes.js';
import {
  getLockoutState,
  recordFailedAttempt,
  clearFailedAttempts,
} from '../mfa/rate-limit.js';
import { sendEmailCode, verifyEmailCode } from '../mfa/email-code.js';
import { isEmailConfigured } from '../email/transport.js';

const PENDING_SETUP = new Map();
const SETUP_TTL_MS = 10 * 60 * 1000;

function gcPendingSetup() {
  const now = Date.now();
  for (const [userId, payload] of PENDING_SETUP.entries()) {
    if (now - payload.createdAt > SETUP_TTL_MS) PENDING_SETUP.delete(userId);
  }
}

/**
 * Begin MFA enrollment. Generates a fresh TOTP secret and recovery codes,
 * stashes them in a short-lived in-memory map keyed by userId. Caller scans
 * the QR, enters a code, then confirms via confirmMfaSetup() which commits
 * the secret + codes to DB.
 */
export async function startMfaSetup() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not signed in' };
  gcPendingSetup();

  const secret = generateSecret();
  const { codes, hashes } = generateRecoveryCodes();
  PENDING_SETUP.set(session.user.id, { secret, hashes, codes, createdAt: Date.now() });

  const qrDataUrl = await getQrDataUrl(secret, session.user.email);
  const provisioningUri = getProvisioningUri(secret, session.user.email);
  return {
    success: true,
    secret,
    qrDataUrl,
    provisioningUri,
    recoveryCodes: codes,
  };
}

/**
 * Confirm MFA enrollment. Verifies the first TOTP code against the pending
 * secret; on success, commits to the user row.
 */
export async function confirmMfaSetup(code) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not signed in' };
  const pending = PENDING_SETUP.get(session.user.id);
  if (!pending) return { error: 'Setup session expired — start again' };

  if (!verifyToken(pending.secret, code)) {
    return { error: 'That code did not match. Check the time on your device and try again.' };
  }

  enableUserMfa(session.user.id, {
    secret: pending.secret,
    recoveryHashes: pending.hashes,
  });
  PENDING_SETUP.delete(session.user.id);
  // Owner is just enrolling — they're already signed in and trusted in this
  // session, so mark MFA completed for the current JWT.
  await unstable_update({ mfaCompleted: true });
  return { success: true };
}

/**
 * Disable MFA on the current user's own account. Requires the password as
 * a re-auth check so a stolen session token alone can't strip MFA.
 */
export async function disableOwnMfa(currentPassword) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not signed in' };
  if (!currentPassword) return { error: 'Current password is required' };
  const user = getUserByEmail(session.user.email);
  if (!user) return { error: 'User not found' };
  const ok = await verifyPassword(user, currentPassword);
  if (!ok) return { error: 'Incorrect password' };
  disableUserMfa(session.user.id);
  return { success: true };
}

/**
 * Send a 6-digit code to the signed-in user's email for use as a backup
 * second factor. Gated on SMTP being configured.
 */
export async function requestEmailMfaCode() {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not signed in' };
  if (!isEmailConfigured()) return { error: 'Email backup is not available' };
  const user = getUserByEmail(session.user.email);
  if (!user) return { error: 'User not found' };
  const internals = getUserMfaInternals(session.user.id);
  const lock = getLockoutState(internals || {});
  if (lock.locked) return { error: 'Too many attempts', unlockAt: lock.unlockAt };
  try {
    await sendEmailCode(user);
    return { success: true };
  } catch (err) {
    return { error: err.message || 'Could not send code' };
  }
}

/**
 * Verify the second factor and complete the session.
 *
 * @param {{ kind: 'totp'|'email'|'recovery', code: string }} args
 */
export async function completeMfaChallenge({ kind, code }) {
  const session = await auth();
  if (!session?.user?.id) return { error: 'Not signed in' };
  const internals = getUserMfaInternals(session.user.id);
  if (!internals) return { error: 'User not found' };
  if (!internals.mfaEnabled) {
    // Edge case: admin disabled the user's MFA mid-session
    await unstable_update({ mfaCompleted: true });
    return { success: true };
  }
  const lock = getLockoutState(internals);
  if (lock.locked) return { error: 'Too many attempts', unlockAt: lock.unlockAt };

  let valid = false;
  let consumedRecoveryHashes = null;

  if (kind === 'totp') {
    valid = verifyToken(internals.secret, code);
  } else if (kind === 'email') {
    valid = verifyEmailCode(session.user.id, code);
  } else if (kind === 'recovery') {
    const next = consumeRecoveryCode(internals.recoveryHashes, code);
    if (next) {
      consumedRecoveryHashes = next;
      valid = true;
    }
  } else {
    return { error: 'Unknown verification method' };
  }

  if (!valid) {
    const r = recordFailedAttempt(session.user.id);
    if (r.locked) {
      // Lockout reached — drop the session so the next attempt requires
      // re-entering the password too.
      await signOut({ redirect: false });
      return { error: 'Too many attempts — please sign in again later', unlockAt: r.unlockAt };
    }
    return { error: 'Invalid code' };
  }

  if (consumedRecoveryHashes) {
    updateUserRecoveryCodes(session.user.id, consumedRecoveryHashes);
  }
  clearFailedAttempts(session.user.id);
  await unstable_update({ mfaCompleted: true });
  return {
    success: true,
    recoveryCodesRemaining: consumedRecoveryHashes ? consumedRecoveryHashes.length : null,
  };
}

/**
 * Public read of the current user's MFA state for settings UI.
 * Never returns secret material.
 */
export async function getOwnMfaState() {
  const session = await auth();
  if (!session?.user?.id) return null;
  return getUserMfaState(session.user.id);
}

/**
 * Whether email backup is currently usable (SMTP set).
 */
export async function isEmailBackupAvailable() {
  return isEmailConfigured();
}
