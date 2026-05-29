import { randomInt } from 'crypto';
import { createEmailCode, consumeEmailCode } from '../db/mfa-email-codes.js';
import { sendSystemEmail, isSystemEmailConfigured } from '../email/transport.js';

function generateNumericCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * Send a 6-digit code to the user's email and persist its hash. Returns
 * true if sent. Throws if system SMTP isn't configured — caller should gate.
 */
export async function sendEmailCode(user) {
  if (!isSystemEmailConfigured()) {
    throw new Error('Email backup factor is unavailable: system SMTP not configured');
  }
  const code = generateNumericCode();
  createEmailCode(user.id, code);

  const productName = process.env.PRODUCT_NAME || 'ThePopeBot';

  await sendSystemEmail({
    to: user.email,
    subject: `Your ${productName} sign-in code`,
    text: `Your sign-in code is: ${code}\n\nThis code expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    html: `<p>Your <strong>${productName}</strong> sign-in code is:</p><p style="font-size:24px;letter-spacing:4px;font-family:monospace;">${code}</p><p>This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`,
  });
  return true;
}

/**
 * Verify and atomically consume a code the user typed in.
 */
export function verifyEmailCode(userId, code) {
  if (!userId || !code) return false;
  const normalized = String(code).replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  return consumeEmailCode(userId, normalized);
}
