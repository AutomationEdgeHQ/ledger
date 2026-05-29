'use server';

import { getUserByEmail, updateUserPasswordById } from '../db/users.js';
import {
  createResetToken,
  consumeResetToken,
  invalidateUserResetTokens,
} from '../db/password-reset-tokens.js';
import { sendEmail, isEmailConfigured } from '../email/transport.js';
import { getConfig } from '../config.js';

function buildResetUrl(token) {
  const base = (getConfig('APP_URL') || process.env.APP_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/reset-password?token=${encodeURIComponent(token)}`;
}

/**
 * Whether the forgot-password feature is available. Both SMTP and APP_URL
 * must be set — the email needs a working link.
 */
export async function isPasswordResetAvailable() {
  if (!isEmailConfigured()) return false;
  const url = getConfig('APP_URL') || process.env.APP_URL;
  return Boolean(url);
}

/**
 * Begin a password reset.
 *
 * SECURITY: Responds identically whether the email exists or not. The only
 * way to learn an account exists is to actually receive an email — which
 * proves you control the address.
 */
export async function requestPasswordReset(email) {
  if (!email || typeof email !== 'string') {
    return { success: true };
  }

  if (!(await isPasswordResetAvailable())) {
    return { error: 'Password reset is not available — contact your administrator' };
  }

  const user = getUserByEmail(email);
  if (!user) {
    // Constant-time-ish: no DB write, no email, but same shape of response.
    return { success: true };
  }

  const { token } = createResetToken(user.id);
  const resetUrl = buildResetUrl(token);
  if (!resetUrl) {
    return { error: 'Password reset is not available — APP_URL is not configured' };
  }

  const productName = process.env.PRODUCT_NAME || 'ThePopeBot';
  try {
    await sendEmail({
      to: user.email,
      subject: `Reset your ${productName} password`,
      text: `A password reset was requested for your ${productName} account. To choose a new password, follow this link (valid for 1 hour):\n\n${resetUrl}\n\nIf you didn't request this, you can ignore this email — nothing will change.`,
      html: `<p>A password reset was requested for your <strong>${productName}</strong> account.</p><p>To choose a new password, follow this link (valid for 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email — nothing will change.</p>`,
    });
  } catch {
    // Swallow — never disclose delivery state to the caller.
  }

  return { success: true };
}

/**
 * Complete a password reset. Verifies the token, sets the new password,
 * and invalidates any other outstanding tokens for the same user.
 */
export async function confirmPasswordReset(token, newPassword) {
  if (!token) return { error: 'Reset link is missing or expired' };
  if (!newPassword || newPassword.length < 8) {
    return { error: 'Password must be at least 8 characters' };
  }

  const userId = consumeResetToken(token);
  if (!userId) {
    return { error: 'This reset link is invalid or has already been used' };
  }

  const updated = updateUserPasswordById(userId, newPassword);
  if (!updated) {
    return { error: 'Could not reset password — please request a new link' };
  }
  invalidateUserResetTokens(userId);
  return { success: true };
}
