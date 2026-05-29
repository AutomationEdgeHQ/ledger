import nodemailer from 'nodemailer';
import { getConfig } from '../config.js';

/**
 * Two-tier email transport.
 *
 *   Tier 1 — SYSTEM:   MFA codes, password reset, account notifications.
 *                      Always sent from a platform identity. One reputation
 *                      shared across every firm bot.
 *
 *   Tier 2 — OUTBOUND: Surveys, business outreach, daily briefs, etc.
 *                      Sent from the firm's verified domain. Per-send
 *                      from-address override supported so per-partner
 *                      sending can use the partner's address as long as it
 *                      lives under the firm's verified Postmark domain.
 *
 * Outbound falls back to system config if OUTBOUND_SMTP_HOST isn't set —
 * convenient for single-firm bots like Jay's where one Postmark account
 * is doing both jobs.
 */

function readTierConfig(prefix) {
  return {
    host: getConfig(`${prefix}_SMTP_HOST`),
    port: parseInt(getConfig(`${prefix}_SMTP_PORT`) || '587', 10),
    user: getConfig(`${prefix}_SMTP_USER`),
    pass: getConfig(`${prefix}_SMTP_PASS`),
    from: getConfig(`${prefix}_SMTP_FROM`),
  };
}

function readSystemConfig() {
  return readTierConfig('SYSTEM');
}

function readOutboundConfig() {
  const raw = readTierConfig('OUTBOUND');
  if (raw.host) return raw;
  // Fallback: inherit system transport but allow OUTBOUND_SMTP_FROM to win
  // if it's set. Useful for single-firm bots where one Postmark account is
  // doing both jobs and we just want a different from-address on outbound.
  const sys = readSystemConfig();
  return {
    ...sys,
    from: raw.from || sys.from,
  };
}

const _transports = new Map();
function getTransport(cfg) {
  const sig = `${cfg.host}|${cfg.port}|${cfg.user}|${cfg.pass}`;
  const cached = _transports.get(sig);
  if (cached) return cached;
  const opts = {
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
  };
  if (cfg.user && cfg.pass) opts.auth = { user: cfg.user, pass: cfg.pass };
  const transport = nodemailer.createTransport(opts);
  _transports.set(sig, transport);
  return transport;
}

/**
 * True only when the system tier has host + from set. Auth (user/pass) is
 * optional — some relays accept unauthenticated submission.
 */
export function isSystemEmailConfigured() {
  const { host, from } = readSystemConfig();
  return Boolean(host && from);
}

/**
 * True when the outbound tier is usable, either via its own config OR via
 * fallback to the system config.
 */
export function isOutboundEmailConfigured() {
  const { host, from } = readOutboundConfig();
  return Boolean(host && from);
}

/**
 * Send a system-tier email (MFA, password reset, account notifications).
 * Throws if the system tier isn't configured — callers should gate on
 * isSystemEmailConfigured() and degrade gracefully.
 *
 * @param {object} args
 * @param {string} args.to
 * @param {string} args.subject
 * @param {string} args.text
 * @param {string} [args.html]
 */
export async function sendSystemEmail({ to, subject, text, html }) {
  const cfg = readSystemConfig();
  if (!cfg.host || !cfg.from) {
    throw new Error('System SMTP is not configured — set SYSTEM_SMTP_HOST and SYSTEM_SMTP_FROM');
  }
  const transport = getTransport(cfg);
  await transport.sendMail({ from: cfg.from, to, subject, text, html });
}

/**
 * Send an outbound business email (surveys, outreach, etc.). The from
 * address defaults to OUTBOUND_SMTP_FROM but can be overridden per-send so
 * survey code can pick the partner who owns the recipient relationship.
 *
 * Falls back to system-tier transport if the outbound tier isn't separately
 * configured.
 *
 * @param {object} args
 * @param {string} args.to
 * @param {string} args.subject
 * @param {string} args.text
 * @param {string} [args.html]
 * @param {string} [args.from] - Overrides OUTBOUND_SMTP_FROM for this send.
 *                               Must be under a verified sending domain.
 */
export async function sendOutboundEmail({ to, subject, text, html, from }) {
  const cfg = readOutboundConfig();
  if (!cfg.host || !cfg.from) {
    throw new Error('Outbound SMTP is not configured — set OUTBOUND_SMTP_HOST and OUTBOUND_SMTP_FROM (or rely on system-tier fallback)');
  }
  const transport = getTransport(cfg);
  await transport.sendMail({ from: from || cfg.from, to, subject, text, html });
}
