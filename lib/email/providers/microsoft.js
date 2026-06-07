/**
 * Microsoft 365 Mail + Calendar provider via Microsoft Graph.
 *
 * Uses the Graph REST API directly via fetch — no MS Graph SDK, keeping the
 * Docker image lean.
 *
 * `account` is the safe-shaped row from listAccounts() / the OAuth callback:
 *   { id, provider: 'microsoft', email, displayName, ... }
 * Access tokens are resolved (and refreshed if needed) via getValidAccessToken.
 *
 * Thread note: Graph doesn't have a first-class "thread" endpoint. We use
 * `conversationId` (which maps to our `threadId`) to group messages.
 */

import { getValidAccessToken } from '../tokens.js';
import { apiFetch } from './_base.js';

const GRAPH = 'https://graph.microsoft.com/v1.0/me';

// Fields to select on message list/fetch — enough for triage without pulling body.
const MSG_SELECT_LIGHT = [
  'id', 'subject', 'from', 'toRecipients', 'receivedDateTime',
  'isRead', 'bodyPreview', 'conversationId', 'hasAttachments', 'categories',
].join(',');

// Add body for full thread reads.
const MSG_SELECT_FULL = MSG_SELECT_LIGHT + ',body';

function parseEmailAddr(addr) {
  if (!addr) return '';
  const ea = addr.emailAddress ?? addr;
  const { name, address } = ea;
  return name ? `${name} <${address}>` : (address || '');
}

function normalizeMessage(msg, includeBody = false) {
  return {
    providerMessageId: msg.id,
    threadId: msg.conversationId,
    from: parseEmailAddr(msg.from),
    to: (msg.toRecipients || []).map(r => parseEmailAddr(r)),
    subject: msg.subject || '(no subject)',
    snippet: msg.bodyPreview || '',
    bodyText: includeBody ? (msg.body?.content ?? null) : null,
    receivedAt: msg.receivedDateTime ? new Date(msg.receivedDateTime).getTime() : 0,
    isRead: Boolean(msg.isRead),
    labels: msg.categories || [],
  };
}

/**
 * List inbox messages since `since` (Date or ms). Returns lightweight metadata
 * without body — call getThread for full content.
 */
export async function listInbox(account, { since, maxResults = 50 } = {}) {
  const tok = await getValidAccessToken(account.id);
  let filter = '';
  if (since) {
    filter = `&$filter=receivedDateTime ge ${new Date(since).toISOString()}`;
  }
  const url = `${GRAPH}/mailFolders/Inbox/messages?$select=${MSG_SELECT_LIGHT}&$top=${maxResults}&$orderby=receivedDateTime DESC${filter}`;
  const data = await apiFetch(url, tok);
  return (data.value || []).map(m => normalizeMessage(m, false));
}

/**
 * Fetch all messages in a conversation (threadId = conversationId), sorted
 * oldest-first, with full body.
 */
export async function getThread(account, threadId) {
  const tok = await getValidAccessToken(account.id);
  // Graph escapes single quotes in filter values by doubling them.
  const escaped = threadId.replace(/'/g, "''");
  const url = `${GRAPH}/messages?$filter=conversationId eq '${escaped}'&$select=${MSG_SELECT_FULL}&$orderby=receivedDateTime asc&$top=50`;
  const data = await apiFetch(url, tok);
  const messages = (data.value || []).map(m => normalizeMessage(m, true));
  return {
    threadId,
    subject: messages[0]?.subject || '',
    messages,
  };
}

/**
 * Create a draft. If `replyToMessageId` is set, Graph creates a pre-populated
 * reply draft attached to the same conversation; otherwise a blank new message.
 */
export async function createDraft(account, { to, subject, body, replyToMessageId } = {}) {
  const tok = await getValidAccessToken(account.id);

  if (replyToMessageId) {
    const draft = await apiFetch(`${GRAPH}/messages/${replyToMessageId}/createReply`, tok, {
      method: 'POST',
      body: JSON.stringify({
        message: { body: { contentType: 'text', content: body } },
      }),
    });
    return { draftId: draft.id, messageId: draft.id };
  }

  const toArr = Array.isArray(to) ? to : [to];
  const draft = await apiFetch(`${GRAPH}/messages`, tok, {
    method: 'POST',
    body: JSON.stringify({
      subject,
      body: { contentType: 'text', content: body },
      toRecipients: toArr.map(addr => ({ emailAddress: { address: addr } })),
    }),
  });
  return { draftId: draft.id, messageId: draft.id };
}

/**
 * Send immediately. If `replyToMessageId` is set, sends an inline reply and
 * saves to Sent Items. For new messages, uses sendMail (no message ID returned).
 */
export async function sendMessage(account, { to, subject, body, replyToMessageId } = {}) {
  const tok = await getValidAccessToken(account.id);

  if (replyToMessageId) {
    await apiFetch(`${GRAPH}/messages/${replyToMessageId}/reply`, tok, {
      method: 'POST',
      body: JSON.stringify({
        message: { body: { contentType: 'text', content: body } },
      }),
    });
    return { messageId: replyToMessageId };
  }

  const toArr = Array.isArray(to) ? to : [to];
  await apiFetch(`${GRAPH}/sendMail`, tok, {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject,
        body: { contentType: 'text', content: body },
        toRecipients: toArr.map(addr => ({ emailAddress: { address: addr } })),
      },
      saveToSentItems: true,
    }),
  });
  // Graph sendMail returns 202 with no body; no message ID available.
  return { messageId: null };
}

/**
 * Apply a category label to a message. Merges with existing categories so
 * nothing is removed.
 */
export async function applyLabel(account, messageId, label) {
  const tok = await getValidAccessToken(account.id);
  const msg = await apiFetch(`${GRAPH}/messages/${messageId}?$select=categories`, tok);
  const existing = msg.categories || [];
  if (!existing.includes(label)) {
    await apiFetch(`${GRAPH}/messages/${messageId}`, tok, {
      method: 'PATCH',
      body: JSON.stringify({ categories: [...existing, label] }),
    });
  }
}

/**
 * Move a message to a folder. `folder` is a well-known name
 * ('archive', 'junkemail', 'deleteditems', 'inbox') or a folder ID.
 */
export async function moveToFolder(account, messageId, folder) {
  const tok = await getValidAccessToken(account.id);
  await apiFetch(`${GRAPH}/messages/${messageId}/move`, tok, {
    method: 'POST',
    body: JSON.stringify({ destinationId: folder }),
  });
}

/** Move to the Archive folder. */
export async function archiveMessage(account, messageId) {
  return moveToFolder(account, messageId, 'archive');
}

/** Move to Deleted Items. */
export async function trashMessage(account, messageId) {
  return moveToFolder(account, messageId, 'deleteditems');
}

/**
 * List calendar events within a date range using calendarView (includes
 * recurring event instances, unlike /events). Defaults to now → +2 days.
 */
export async function listCalendar(account, { startDate, endDate } = {}) {
  const tok = await getValidAccessToken(account.id);
  const startDateTime = (startDate ? new Date(startDate) : new Date()).toISOString();
  const endDateTime = endDate
    ? new Date(endDate).toISOString()
    : new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();

  const params = new URLSearchParams({
    startDateTime,
    endDateTime,
    $select: 'id,subject,start,end,location,organizer,attendees,isOnlineMeeting,onlineMeetingUrl,bodyPreview',
    $orderby: 'start/dateTime',
    $top: '50',
  });
  const data = await apiFetch(`${GRAPH}/calendarView?${params}`, tok);
  return (data.value || []).map(e => {
    // Graph returns times as local strings with a separate timeZone field.
    // Append 'Z' only if already UTC; otherwise parse as-is (JS handles ISO).
    const toMs = dt => dt ? new Date(dt).getTime() : 0;
    return {
      eventId: e.id,
      subject: e.subject || '',
      startAt: toMs(e.start?.dateTime),
      endAt: toMs(e.end?.dateTime),
      location: e.location?.displayName || null,
      organizer: e.organizer?.emailAddress?.address || '',
      attendees: (e.attendees || []).map(a => a.emailAddress?.address).filter(Boolean),
      isOnlineMeeting: Boolean(e.isOnlineMeeting),
      onlineMeetingUrl: e.onlineMeetingUrl || null,
      bodyPreview: e.bodyPreview || null,
    };
  });
}
