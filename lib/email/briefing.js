/**
 * Daily briefing generator.
 *
 * Produces a compact text digest covering:
 *   - Inbox summary (counts by category, actioned items)
 *   - Pending manual approvals (items awaiting the user)
 *   - Today's calendar (from linked email accounts)
 *   - Pending_auto items in the undo queue
 *
 * Designed to be called once per day (or on demand) and delivered via
 * the agent-job-dm skill or a CRONS.json scheduled task.
 */

import { listForUser as listMessages } from '../db/email-messages.js';
import { listForUser as listActions } from '../db/email-actions.js';
import { listAccounts } from '../db/user-email-accounts.js';
import { forAccount } from './providers/index.js';
import { getConfig } from '../config.js';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Generate the briefing text for a user.
 *
 * @param {string} userId
 * @param {{ daysBack?, includeCalendar? }} opts
 * @returns {Promise<string>} markdown-ish text ready for DM delivery
 */
export async function generateBriefing(userId, { daysBack = 1, includeCalendar = true } = {}) {
  const since = Date.now() - daysBack * DAY_MS;
  const productName = getConfig('PRODUCT_NAME') || 'Email Agent';
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  const lines = [`**${productName} — Daily Briefing**`, `_${dateStr}_`, ''];

  // ── Inbox summary ──────────────────────────────────────────────────────────
  const recent = listMessages(userId, { limit: 200, since });
  const byCat = {};
  let pendingClassify = 0;
  for (const m of recent) {
    if (m.status === 'pending') { pendingClassify++; continue; }
    const cat = m.classification || 'Other';
    byCat[cat] = (byCat[cat] || 0) + 1;
  }

  const ORDER = ['VIP', 'Important', 'Action-needed', 'Sales', 'Junk', 'Unsubscribe', 'Other'];
  const inboxLines = ORDER.filter(c => byCat[c]).map(c => `  • ${c}: ${byCat[c]}`);

  if (inboxLines.length) {
    lines.push('**📬 Inbox (last 24h)**');
    lines.push(...inboxLines);
    if (pendingClassify) lines.push(`  • Pending classification: ${pendingClassify}`);
  } else {
    lines.push('**📬 Inbox** — No new messages in the last 24h.');
  }
  lines.push('');

  // ── Pending approvals ──────────────────────────────────────────────────────
  const actions = listActions(userId, { limit: 50 });
  const pendingManual = actions.filter(a => a.mode === 'manual' && !a.wasCorrected);
  const pendingAuto = actions.filter(a => a.mode === 'pending_auto');

  if (pendingManual.length) {
    lines.push(`**⏳ Awaiting your review (${pendingManual.length})**`);
    pendingManual.slice(0, 5).forEach(a => {
      const p = a.payload ? JSON.parse(a.payload) : {};
      lines.push(`  • ${p.actionType || a.actionType} — ${p.subject || 'message'} from ${p.from || 'unknown'}`);
    });
    if (pendingManual.length > 5) lines.push(`  _…and ${pendingManual.length - 5} more_`);
    lines.push('');
  }

  if (pendingAuto.length) {
    lines.push(`**⏱ In undo queue: ${pendingAuto.length} action${pendingAuto.length !== 1 ? 's' : ''} pending execution**`);
    lines.push('');
  }

  // ── Calendar ───────────────────────────────────────────────────────────────
  if (includeCalendar) {
    const accounts = listAccounts(userId).filter(a => a.status === 'active');
    const calEvents = [];

    for (const account of accounts.slice(0, 2)) { // cap at 2 accounts to avoid slowness
      try {
        const mail = forAccount(account);
        const events = await mail.listCalendar({
          startDate: new Date(),
          endDate: new Date(Date.now() + DAY_MS),
        });
        calEvents.push(...events);
      } catch {
        // calendar fetch fails silently — briefing still delivers
      }
    }

    // Dedupe by eventId
    const seen = new Set();
    const unique = calEvents.filter(e => seen.has(e.eventId) ? false : seen.add(e.eventId));
    unique.sort((a, b) => a.startAt - b.startAt);

    if (unique.length) {
      lines.push('**📅 Today\'s calendar**');
      unique.slice(0, 8).forEach(e => {
        const t = new Date(e.startAt).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
        const online = e.isOnlineMeeting ? ' 🔗' : '';
        lines.push(`  • ${t} — ${e.subject}${online}`);
        if (e.onlineMeetingUrl) lines.push(`    ${e.onlineMeetingUrl}`);
      });
      if (unique.length > 8) lines.push(`  _…and ${unique.length - 8} more events_`);
    } else {
      lines.push('**📅 Calendar** — No events today.');
    }
    lines.push('');
  }

  lines.push('_Reply **!email inbox** to open your inbox feed._');
  return lines.join('\n');
}

/**
 * Convert the markdown-ish briefing text to a minimal HTML email.
 * Handles **bold**, _italic_, bullet lists, and blank-line paragraphs.
 */
function briefingToHtml(text) {
  const productName = getConfig('PRODUCT_NAME') || 'Email Agent';
  const lines = text.split('\n');
  const htmlLines = lines.map(line => {
    let h = line
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    h = h.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    h = h.replace(/_(.+?)_/g, '<em>$1</em>');
    if (h.startsWith('  • ') || h.startsWith('  • ')) {
      return `<li style="margin:2px 0">${h.replace(/^\s*•\s*/, '')}</li>`;
    }
    if (h === '') return '<br>';
    return `<p style="margin:4px 0">${h}</p>`;
  });

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;font-size:14px;color:#222;max-width:600px;margin:0 auto;padding:20px">
${htmlLines.join('\n')}
<hr style="border:none;border-top:1px solid #eee;margin:24px 0">
<p style="font-size:12px;color:#888">Sent by ${productName}</p>
</body></html>`;
}

/**
 * Send the daily briefing via the user's own linked email account (default
 * account, or first active account). Sends to the account's own address so it
 * lands in their inbox from themselves — no SMTP credentials required.
 *
 * @param {string} userId
 * @returns {Promise<{ sent: boolean, sentFrom?: string, error?: string }>}
 */
export async function sendBriefingEmail(userId) {
  const accounts = listAccounts(userId).filter(a => a.status === 'active');
  if (!accounts.length) return { sent: false, error: 'No active linked email accounts' };

  // Prefer the default account; fall back to first active
  const account = accounts.find(a => a.isDefault) ?? accounts[0];
  const mail = forAccount(account);

  const productName = getConfig('PRODUCT_NAME') || 'Email Agent';
  const text = await generateBriefing(userId);
  const html = briefingToHtml(text);
  const dateStr = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  try {
    await mail.sendMessage({
      to: [account.email],
      subject: `${productName} — Daily Briefing, ${dateStr}`,
      body: text,
    });
    return { sent: true, sentFrom: account.email };
  } catch (err) {
    return { sent: false, error: err.message };
  }
}

/**
 * Send daily briefing emails for all users with active email accounts.
 * Safe to call from a cron — silently skips users where SMTP isn't configured.
 */
export async function sendDailyBriefingForAllUsers() {
  const { getDb } = await import('../db/index.js');
  const { userEmailAccounts } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');

  const db = getDb();
  const rows = db.select({ userId: userEmailAccounts.userId })
    .from(userEmailAccounts)
    .where(eq(userEmailAccounts.status, 'active'))
    .all();
  const userIds = [...new Set(rows.map(r => r.userId))];

  const results = {};
  for (const userId of userIds) {
    results[userId] = await sendBriefingEmail(userId);
  }
  return results;
}

/**
 * Run the pipeline + deliver briefing for ALL users with active email accounts.
 * Intended to be called by the pipeline cron.
 */
export async function runPipelineAndBriefAllUsers() {
  const { getDb } = await import('../db/index.js');
  const { userEmailAccounts } = await import('../db/schema.js');
  const { eq } = await import('drizzle-orm');
  const { runPipeline } = await import('./pipeline.js');

  const db = getDb();
  // Get distinct userIds with at least one active account
  const rows = db.select({ userId: userEmailAccounts.userId })
    .from(userEmailAccounts)
    .where(eq(userEmailAccounts.status, 'active'))
    .all();
  const userIds = [...new Set(rows.map(r => r.userId))];

  const results = {};
  for (const userId of userIds) {
    results[userId] = await runPipeline(userId);
  }
  return results;
}
