/**
 * Per-account access-token lifecycle for linked mailboxes.
 *
 * Tokens are minted against the FIRM's own OAuth app (the same client creds the
 * admin pasted into the panel), so refresh reads those creds from config. On
 * refresh failure (e.g. Microsoft's ~90-day refresh-token rotation, or a
 * revoked grant) the account is flagged `reauth_required` so the UI can prompt
 * the user to reconnect.
 */

import { getConfig } from '../config.js';
import { OAUTH_PROVIDERS, msEndpoints } from '../oauth/providers.js';
import { refreshOAuthToken } from '../oauth/helper.js';
import { getDecryptedTokens, updateTokens, setStatus } from '../db/user-email-accounts.js';

// Refresh a little early so a token doesn't expire mid-request.
const EXPIRY_BUFFER_MS = 60_000;

function firmCreds(provider) {
  if (provider === 'google') {
    return {
      clientId: getConfig('GOOGLE_OAUTH_CLIENT_ID'),
      clientSecret: getConfig('GOOGLE_OAUTH_CLIENT_SECRET'),
      tokenUrl: OAUTH_PROVIDERS.google.tokenUrl,
    };
  }
  if (provider === 'microsoft') {
    return {
      clientId: getConfig('MS_OAUTH_CLIENT_ID'),
      clientSecret: getConfig('MS_OAUTH_CLIENT_SECRET'),
      tokenUrl: msEndpoints(getConfig('MS_OAUTH_TENANT_ID') || '').tokenUrl,
    };
  }
  throw new Error(`Unknown email provider: ${provider}`);
}

/**
 * Return a valid access token for a linked account, refreshing if needed.
 * @param {string} accountId
 * @returns {Promise<string>}
 * @throws if no refresh token / refresh fails (account marked reauth_required)
 */
export async function getValidAccessToken(accountId) {
  const tok = getDecryptedTokens(accountId);
  if (!tok) throw new Error('Email account not found');

  const stillValid =
    tok.accessToken && tok.accessTokenExpiresAt && tok.accessTokenExpiresAt - EXPIRY_BUFFER_MS > Date.now();
  if (stillValid) return tok.accessToken;

  if (!tok.refreshToken) {
    setStatus(accountId, 'reauth_required');
    throw new Error('No refresh token — account must be reconnected');
  }

  try {
    const { clientId, clientSecret, tokenUrl } = firmCreds(tok.provider);
    const data = await refreshOAuthToken({ refreshToken: tok.refreshToken, clientId, clientSecret, tokenUrl });
    updateTokens(accountId, {
      accessToken: data.access_token,
      accessTokenExpiresAt: data.expires_in ? Date.now() + data.expires_in * 1000 : null,
      // Providers may rotate the refresh token; persist it if so.
      refreshToken: data.refresh_token || undefined,
    });
    return data.access_token;
  } catch (err) {
    setStatus(accountId, 'reauth_required');
    throw new Error(`Token refresh failed — reconnect required: ${err.message}`);
  }
}
