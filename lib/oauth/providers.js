/**
 * OAuth provider presets.
 *
 * Nested by provider → packages. Each provider shares authorize/token URLs;
 * each package defines the scopes for a specific integration.
 */
export const OAUTH_PROVIDERS = {
  google: {
    name: 'Google',
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    packages: {
      gmail: {
        name: 'Gmail',
        scopes: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.send',
      },
      calendar: {
        name: 'Google Calendar',
        scopes: 'https://www.googleapis.com/auth/calendar',
      },
      drive: {
        name: 'Google Drive',
        scopes: 'https://www.googleapis.com/auth/drive',
      },
      sheets: {
        name: 'Google Sheets',
        scopes: 'https://www.googleapis.com/auth/spreadsheets',
      },
      youtube: {
        name: 'YouTube',
        scopes: 'https://www.googleapis.com/auth/youtube',
      },
    },
  },
  microsoft: {
    name: 'Microsoft',
    // Tenant-templated. `{tenant}` is substituted with MS_OAUTH_TENANT_ID for
    // single-tenant firm apps (the quirk discovered for Teams); falls back to
    // `common` when no tenant is configured. See msEndpoints() below.
    authorizeUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    packages: {
      outlook: {
        name: 'Outlook Mail',
        scopes: 'offline_access openid email User.Read Mail.ReadWrite Mail.Send',
      },
      calendar: {
        name: 'Outlook Calendar',
        scopes: 'offline_access openid email User.Read Calendars.Read',
      },
    },
  },
};

/**
 * Build tenant-aware Microsoft authorize/token endpoints.
 * Single-tenant firm apps must hit /{tenantId}/ rather than /common/ — the
 * same quirk that caused the Teams 401 loop on first install. Falls back to
 * `common` when the firm hasn't configured a tenant.
 * @param {string} [tenantId]
 * @returns {{ authorizeUrl: string, tokenUrl: string }}
 */
export function msEndpoints(tenantId) {
  const tenant = tenantId && tenantId.trim() ? tenantId.trim() : 'common';
  return {
    authorizeUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}
