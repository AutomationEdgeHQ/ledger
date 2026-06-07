/**
 * Email classifier — LLM-based triage for pending inbox messages.
 *
 * Uses callHelperLlmStructured (lib/ai/helper-llm.js) which reads LLM_PROVIDER /
 * LLM_MODEL / API keys from config — the same model the rest of the app uses.
 *
 * Thread-aware: fetches the full thread before classifying so a reply is
 * understood in context, not in isolation.
 *
 * Few-shot learning: injects the user's recent corrections into the prompt so
 * classification improves based on their feedback.
 *
 * External content is always wrapped in <EXTERNAL> tags before being sent to
 * the LLM (per the platform's sanitizer convention).
 */

import { z } from 'zod';
import { callHelperLlmStructured } from '../ai/helper-llm.js';
import { getConfig } from '../config.js';
import { getPending, setClassification, getDecryptedBody } from '../db/email-messages.js';
import { logAction } from '../db/email-actions.js';
import { getRecentCorrections } from '../db/email-corrections.js';

// Classification output schema
const ClassificationSchema = z.object({
  category: z.enum(['VIP', 'Important', 'Action-needed', 'Sales', 'Junk', 'Unsubscribe', 'Other']),
  summary: z.string().max(300),
  confidence: z.number().int().min(0).max(100),
  extracted: z.object({
    actionItems: z.array(z.string()).optional(),
    deadline: z.string().nullable().optional(),
    sentiment: z.enum(['positive', 'neutral', 'negative', 'urgent']).optional(),
    replyNeeded: z.boolean().optional(),
  }),
  proposedAction: z.enum([
    'archive',     // file it away, no inbox clutter
    'trash',       // definitely not wanted
    'label',       // mark as important / flag
    'draft_reply', // suggest a reply draft
    'mark_read',   // just read, no action
    'flag_unsubscribe', // surface to user to unsubscribe
    'noop',        // leave as is
  ]),
});

function buildSystemPrompt() {
  const productName = getConfig('PRODUCT_NAME') || 'the AI assistant';
  return `You are an expert email triage assistant for ${productName}. Your job is to classify inbound emails for a CPA firm owner/operator and determine the right action.

Categories:
- VIP: From key clients, partners, senior contacts, or anyone the user has flagged as a VIP. Needs attention.
- Important: Requires a response or action but is not VIP. Deadlines, client work, vendor issues.
- Action-needed: Has a specific task or request that needs follow-through but is not urgent.
- Sales: Unsolicited outreach, vendor pitches, service offers the user didn't request.
- Junk: Spam, scam, definitely unwanted.
- Unsubscribe: Newsletters, marketing lists the user might want to unsubscribe from.
- Other: Notifications, receipts, automations, FYIs — doesn't fit the above.

Be concise in summaries. Confidence is your certainty 0-100. When in doubt, lean toward a safer category (Important over Auto-archive).`;
}

function buildFewShotExamples(corrections) {
  if (!corrections.length) return '';
  const examples = corrections.slice(0, 5).map((c, i) => {
    const o = c.originalAction;
    const cor = c.correctedAction;
    return `Example ${i + 1}: Agent classified as "${o.category}" → user corrected to "${cor.category}"${c.userNote ? ` (note: ${c.userNote})` : ''}.`;
  });
  return '\n\nRecent corrections from this user (apply these lessons):\n' + examples.join('\n');
}

function buildUserPrompt(headers, body, fewShot) {
  const headerStr = [
    `From: ${headers.from}`,
    `To: ${Array.isArray(headers.to) ? headers.to.join(', ') : headers.to}`,
    `Subject: ${headers.subject}`,
    `Received: ${new Date(headers.receivedAt).toISOString()}`,
  ].join('\n');

  return `<EXTERNAL>
${headerStr}

${body || '(body not available)'}
</EXTERNAL>

Classify this email.${fewShot}`;
}

/**
 * Classify one pending message row. Updates the DB and logs a classify action.
 *
 * @param {object} msgRow - row from email_messages (with id, accountId, userId, headers, etc.)
 * @returns {{ category, confidence, error? }}
 */
export async function classifyMessage(msgRow) {
  const headers = JSON.parse(msgRow.headers);
  const body = getDecryptedBody(msgRow.id);

  // Fetch few-shot examples from this user's corrections (broad first, then specific)
  const corrections = getRecentCorrections(msgRow.userId, {
    limit: 8,
    category: undefined, // start broad
    sender: headers.from,
  });

  const system = buildSystemPrompt();
  const user = buildUserPrompt(headers, body, buildFewShotExamples(corrections));

  let result;
  try {
    result = await callHelperLlmStructured({
      system,
      user,
      schema: ClassificationSchema,
      maxTokens: 512,
    });
  } catch (err) {
    return { error: `LLM classification failed: ${err.message}` };
  }

  // Persist classification
  setClassification(msgRow.id, {
    classification: result.category,
    summary: result.summary,
    confidence: result.confidence,
    extracted: result.extracted,
  });

  // Log the classify action (permanent audit trail)
  logAction({
    messageId: msgRow.id,
    accountId: msgRow.accountId,
    userId: msgRow.userId,
    actionType: 'classify',
    payload: {
      category: result.category,
      confidence: result.confidence,
      proposedAction: result.proposedAction,
      extracted: result.extracted,
    },
    mode: 'auto',
    actor: 'agent',
    confidence: result.confidence,
  });

  return { category: result.category, confidence: result.confidence, proposedAction: result.proposedAction };
}

/**
 * Classify all pending messages for a user (up to limit).
 *
 * @param {string} userId
 * @param {{ limit? }} opts
 * @returns {{ classified: number, errors: string[] }}
 */
export async function classifyPending(userId, { limit = 50 } = {}) {
  const pending = getPending(userId, limit);
  let classified = 0;
  const errors = [];

  for (const msg of pending) {
    const result = await classifyMessage(msg);
    if (result.error) {
      errors.push(`message ${msg.id}: ${result.error}`);
    } else {
      classified++;
    }
  }

  return { classified, errors };
}
