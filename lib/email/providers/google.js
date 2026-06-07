/**
 * Gmail + Google Calendar provider.
 *
 * Uses the Gmail REST API and Google Calendar API directly via fetch —
 * no googleapis SDK, keeping the Docker image lean.
 *
 * `account` is the safe-shaped row from listAccounts() / the OAuth callback:
 *   { id, provider: 'google', email, displayName, ... }
 * Access tokens are resolved (and refreshed if needed) via getValidAccessToken.
 */

import { getValidAccessToken } from '../tokens.js';
import { apiFetch, toGmailDate, base64url, buildRfc2822, extractGmailBody, gmailHeader } from './_base.js';

const GMAIL = 'https://gmail.googleapis.com/gmail/v1/users/me';
const GCAL  = 'https://www.googleapis.com/calendar/v3';

const META_HEADERS = 'metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date&metadataHeaders=Message-ID&metadataHeaders=References';

function normalizeMessage(msg, includeBody = false) {
  const h = msg.payload?.headers || [];
  return {
    providerMessageId: msg.id,
    threadId: msg.threadId,
    from: gmailHeader(h, 'from') || '',
    to: (gmailHeader(h, 'to') || '').split(',').map(s => s.trim()).filter(Boolean),
    subject: gmailHeader(h, 'subject') || '(no subject)',
    snippet: msg.snippet || '',
    bodyText: includeBody ? extractGmailBody(msg.payload) : null,
    receivedAt: msg.internalDate ? Number(msg.internalDate) : 0,
    isRead: !(msg.labelIds || []).includes('UNREAD'),
    labels: msg.labelIds || [],
  };
}

/**
 * List inbox messages since `since` (Date or ms). Returns lightweight metadata
 * without body — call getThread for full content.
 */
export async function listInbox(account, { since, maxResults = 50 } = {}) {
  const tok = await getValidAccessToken(account.id);
  let q = 'in:inbox';
  if (since) q += ` after:${toGmailDate(since)}`;

  const list = await apiFetch(
    `${GMAIL}/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`,
    tok
  );
  if (!list.messages?.length) return [];

  // Fetch metadata for each message in parallel (message list returns IDs only)
  const messages = await Promise.all(
    list.messages.map(({ id }) =>
      apiFetch(`${GMAIL}/messages/${id}?format=metadata&${META_HEADERS}`, tok)
    )
  );
  return messages.map(m => normalizeMessage(m, false));
}

/** Fetch a full thread including all message bodies. */
export async function getThread(account, threadId) {
  const tok = await getValidAccessToken(account.id);
  const thread = await apiFetch(`${GMAIL}/threads/${threadId}?format=full`, tok);
  const messages = (thread.messages || []).map(m => normalizeMessage(m, true));
  return {
    threadId: thread.id,
    subject: messages[0]?.subject || '',
    messages,
  };
}

/** Create a draft, optionally as a reply in an existing thread. */
export async function createDraft(account, { threadId, to, subject, body, replyToMessageId } = {}) {
  const tok = await getValidAccessToken(account.id);
  let inReplyTo = null, references = null;

  if (replyToMessageId) {
    const orig = await apiFetch(`${GMAIL}/messages/${replyToMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, tok);
    const h = orig.payload?.headers || [];
    inReplyTo = gmailHeader(h, 'message-id');
    const refs = gmailHeader(h, 'references');
    references = [refs, inReplyTo].filter(Boolean).join(' ');
  }

  const raw = buildRfc2822({ from: account.email, to, subject, body, inReplyTo, references });
  const payload = { message: { raw: base64url(raw) } };
  if (threadId) payload.message.threadId = threadId;

  const draft = await apiFetch(`${GMAIL}/drafts`, tok, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { draftId: draft.id, messageId: draft.message?.id ?? null };
}

/** Send a message immediately, optionally as a reply in an existing thread. */
export async function sendMessage(account, { threadId, to, subject, body, replyToMessageId } = {}) {
  const tok = await getValidAccessToken(account.id);
  let inReplyTo = null, references = null;

  if (replyToMessageId) {
    const orig = await apiFetch(`${GMAIL}/messages/${replyToMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`, tok);
    const h = orig.payload?.headers || [];
    inReplyTo = gmailHeader(h, 'message-id');
    const refs = gmailHeader(h, 'references');
    references = [refs, inReplyTo].filter(Boolean).join(' ');
  }

  const raw = buildRfc2822({ from: account.email, to, subject, body, inReplyTo, references });
  const payload = { raw: base64url(raw) };
  if (threadId) payload.threadId = threadId;

  const sent = await apiFetch(`${GMAIL}/messages/send`, tok, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return { messageId: sent.id };
}

/**
 * Add a label to a message. `label` is a Gmail label ID (e.g. 'STARRED',
 * a custom label ID, or a system label like 'IMPORTANT').
 */
export async function applyLabel(account, messageId, label) {
  const tok = await getValidAccessToken(account.id);
  await apiFetch(`${GMAIL}/messages/${messageId}/modify`, tok, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: [label], removeLabelIds: [] }),
  });
}

/**
 * Move a message to a Gmail label/folder. Removes INBOX and adds `folder`.
 * `folder` is a Gmail label ID — use 'SPAM', 'TRASH', or a custom label ID.
 */
export async function moveToFolder(account, messageId, folder) {
  const tok = await getValidAccessToken(account.id);
  await apiFetch(`${GMAIL}/messages/${messageId}/modify`, tok, {
    method: 'POST',
    body: JSON.stringify({ addLabelIds: [folder], removeLabelIds: ['INBOX'] }),
  });
}

/** Archive (remove from INBOX, no label added). */
export async function archiveMessage(account, messageId) {
  const tok = await getValidAccessToken(account.id);
  await apiFetch(`${GMAIL}/messages/${messageId}/modify`, tok, {
    method: 'POST',
    body: JSON.stringify({ removeLabelIds: ['INBOX'] }),
  });
}

/** Move to trash. */
export async function trashMessage(account, messageId) {
  const tok = await getValidAccessToken(account.id);
  await apiFetch(`${GMAIL}/messages/${messageId}/trash`, tok, {
    method: 'POST',
    body: '{}',
  });
}

/**
 * List calendar events within a date range (defaults: now → +2 days).
 * Uses the primary calendar only.
 */
export async function listCalendar(account, { startDate, endDate } = {}) {
  const tok = await getValidAccessToken(account.id);
  const timeMin = (startDate ? new Date(startDate) : new Date()).toISOString();
  const timeMax = endDate
    ? new Date(endDate).toISOString()
    : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    timeMin,
    timeMax,
    orderBy: 'startTime',
    singleEvents: 'true',
    maxResults: '50',
    fields: 'items(id,summary,start,end,location,organizer,attendees,isOnlineMeeting,onlineMeetingEntryPoints,description)',
  });
  const data = await apiFetch(`${GCAL}/calendars/primary/events?${params}`, tok);
  return (data.items || []).map(e => ({
    eventId: e.id,
    subject: e.summary || '',
    startAt: new Date(e.start?.dateTime || e.start?.date).getTime(),
    endAt: new Date(e.end?.dateTime || e.end?.date).getTime(),
    location: e.location || null,
    organizer: e.organizer?.email || '',
    attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
    isOnlineMeeting: !!(e.isOnlineMeeting || e.onlineMeetingEntryPoints?.length),
    onlineMeetingUrl: e.onlineMeetingEntryPoints?.[0]?.uri ?? null,
    bodyPreview: e.description ? e.description.slice(0, 300) : null,
  }));
}
