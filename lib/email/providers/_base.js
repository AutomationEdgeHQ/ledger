/**
 * Shared utilities for email providers. Not a class — just helpers so both
 * google.js and microsoft.js don't duplicate fetch-wrapping and MIME parsing.
 *
 * Provider interface (both google.js and microsoft.js export these):
 *
 *   listInbox(account, { since?, maxResults? })
 *     → Message[]
 *
 *   getThread(account, threadId)
 *     → { threadId, subject, messages: Message[] }
 *
 *   createDraft(account, { to, subject, body, threadId?, replyToMessageId? })
 *     → { draftId, messageId }
 *
 *   sendMessage(account, { to, subject, body, threadId?, replyToMessageId? })
 *     → { messageId }
 *
 *   applyLabel(account, messageId, label)
 *     → void  (Gmail: label ID; Graph: category string)
 *
 *   moveToFolder(account, messageId, folder)
 *     → void  (Gmail: label ID; Graph: well-known name or folder ID)
 *
 *   archiveMessage(account, messageId) → void
 *   trashMessage(account, messageId)   → void
 *
 *   listCalendar(account, { startDate?, endDate? })
 *     → CalendarEvent[]
 *
 * Message {
 *   providerMessageId: string,
 *   threadId: string,         // Gmail threadId | Graph conversationId
 *   from: string,             // "Display Name <email>"
 *   to: string[],
 *   subject: string,
 *   snippet: string,
 *   bodyText: string|null,    // null from listInbox; populated from getThread
 *   receivedAt: number,       // ms epoch
 *   isRead: boolean,
 *   labels: string[],         // Gmail label IDs | Graph categories
 * }
 *
 * CalendarEvent {
 *   eventId: string,
 *   subject: string,
 *   startAt: number,          // ms epoch
 *   endAt: number,
 *   location: string|null,
 *   organizer: string,        // email address
 *   attendees: string[],      // email addresses
 *   isOnlineMeeting: boolean,
 *   onlineMeetingUrl: string|null,
 *   bodyPreview: string|null,
 * }
 */

/**
 * Thin fetch wrapper that attaches the Bearer token and throws on non-2xx.
 * Returns null for 204 No Content.
 */
export async function apiFetch(url, accessToken, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${options.method || 'GET'} ${url} → ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return null;
  return res.json();
}

/** Convert a Date to Gmail's after: filter format — YYYY/MM/DD. */
export function toGmailDate(date) {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

/** Base64url-encode a string (for Gmail raw message payload). */
export function base64url(str) {
  return Buffer.from(str)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build a minimal RFC 2822 message for Gmail send/createDraft.
 * @param {{ from, to, subject, body, inReplyTo?, references? }} opts
 */
export function buildRfc2822({ from, to, subject, body, inReplyTo, references }) {
  const toStr = Array.isArray(to) ? to.join(', ') : to;
  const lines = [
    `From: ${from}`,
    `To: ${toStr}`,
    `Subject: ${subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=utf-8',
  ];
  if (inReplyTo) lines.push(`In-Reply-To: ${inReplyTo}`);
  if (references) lines.push(`References: ${references}`);
  return lines.join('\r\n') + '\r\n\r\n' + body;
}

/**
 * Recursively extract text/plain body from a Gmail message payload.
 * Returns null if no text part is found.
 */
export function extractGmailBody(payload) {
  if (!payload) return null;
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64').toString('utf8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      const text = extractGmailBody(part);
      if (text) return text;
    }
  }
  return null;
}

/** Find a Gmail message header by name (case-insensitive). */
export function gmailHeader(headers, name) {
  const h = headers?.find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value ?? null;
}
