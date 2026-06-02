/**
 * Resolve the identity (email + display name) of a freshly-authorized mailbox
 * from its access token. Used by the OAuth callback to know which account was
 * just linked, before we have any provider abstraction in place.
 *
 * Relies on the identity scopes the link flow always appends:
 *   Google    → `openid email`        (OpenID userinfo endpoint)
 *   Microsoft → `openid email User.Read` (Graph /me)
 */

const GOOGLE_USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';
const MS_GRAPH_ME = 'https://graph.microsoft.com/v1.0/me';

/**
 * @param {'google'|'microsoft'} provider
 * @param {string} accessToken
 * @returns {Promise<{ email: string, displayName: string|null }>}
 */
export async function fetchAccountIdentity(provider, accessToken) {
  if (provider === 'google') return fetchGoogleIdentity(accessToken);
  if (provider === 'microsoft') return fetchMicrosoftIdentity(accessToken);
  throw new Error(`Unknown email provider: ${provider}`);
}

async function fetchGoogleIdentity(accessToken) {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Google userinfo failed (${res.status}). Ensure the "openid email" scopes are granted.`);
  }
  const data = await res.json();
  const email = data.email;
  if (!email) throw new Error('Google userinfo returned no email address.');
  return { email, displayName: data.name || null };
}

async function fetchMicrosoftIdentity(accessToken) {
  const res = await fetch(MS_GRAPH_ME, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Microsoft Graph /me failed (${res.status}). Ensure the "User.Read" scope is granted.`);
  }
  const data = await res.json();
  // Work/school mailboxes expose `mail`; some accounts only have userPrincipalName.
  const email = data.mail || data.userPrincipalName;
  if (!email) throw new Error('Microsoft Graph returned no mail/userPrincipalName.');
  return { email, displayName: data.displayName || null };
}
