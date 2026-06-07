import { TOTP, Secret } from 'otpauth';
import QRCode from 'qrcode';

function getIssuer() {
  return process.env.PRODUCT_NAME || 'ThePopeBot';
}

/**
 * Generate a new TOTP secret. Caller is responsible for storing the encrypted
 * base32 string in users.mfaSecret.
 * @returns {string} base32 secret
 */
export function generateSecret() {
  return new Secret({ size: 20 }).base32;
}

function makeTotp(secret, accountName) {
  return new TOTP({
    issuer: getIssuer(),
    label: accountName,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: Secret.fromBase32(secret),
  });
}

/**
 * Build the otpauth:// URI for an authenticator app to scan.
 */
export function getProvisioningUri(secret, accountName) {
  return makeTotp(secret, accountName).toString();
}

/**
 * Render the otpauth URI as a base64-encoded PNG data URL for an <img>.
 */
export async function getQrDataUrl(secret, accountName) {
  const uri = getProvisioningUri(secret, accountName);
  return QRCode.toDataURL(uri, { margin: 1, width: 256 });
}

/**
 * Validate a 6-digit code against the secret. Accepts one period of drift
 * in either direction (±30s) to absorb clock skew.
 * @param {string} secret - base32
 * @param {string} token - 6 digits
 * @returns {boolean}
 */
export function verifyToken(secret, token) {
  if (!secret || !token) return false;
  const normalized = token.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(normalized)) return false;
  const totp = makeTotp(secret, 'verify');
  const delta = totp.validate({ token: normalized, window: 1 });
  return delta !== null;
}
