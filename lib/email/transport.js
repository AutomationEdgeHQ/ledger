import nodemailer from 'nodemailer';
import { getConfig } from '../config.js';

let _cachedTransport = null;
let _cachedSig = null;

function readSmtpConfig() {
  return {
    host: getConfig('SMTP_HOST'),
    port: parseInt(getConfig('SMTP_PORT') || '587', 10),
    user: getConfig('SMTP_USER'),
    pass: getConfig('SMTP_PASS'),
    from: getConfig('SMTP_FROM'),
  };
}

/**
 * True only when host + from are both configured. Auth (user/pass) is optional
 * — some relays (postfix on localhost) accept unauthenticated submission.
 */
export function isEmailConfigured() {
  const { host, from } = readSmtpConfig();
  return Boolean(host && from);
}

function getTransport() {
  const cfg = readSmtpConfig();
  const sig = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.pass}`;
  if (_cachedTransport && _cachedSig === sig) return _cachedTransport;

  const opts = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
  };
  if (cfg.user && cfg.pass) opts.auth = { user: cfg.user, pass: cfg.pass };

  _cachedTransport = nodemailer.createTransport(opts);
  _cachedSig = sig;
  return _cachedTransport;
}

/**
 * Send an email. Throws if SMTP isn't configured — callers should gate on
 * isEmailConfigured() and degrade gracefully.
 *
 * @param {object} args
 * @param {string} args.to
 * @param {string} args.subject
 * @param {string} args.text
 * @param {string} [args.html]
 */
export async function sendEmail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    throw new Error('SMTP is not configured — set SMTP_HOST and SMTP_FROM');
  }
  const { from } = readSmtpConfig();
  const transport = getTransport();
  await transport.sendMail({ from, to, subject, text, html });
}
