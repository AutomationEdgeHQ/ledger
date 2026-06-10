'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { CopyIcon, CheckIcon, TrashIcon, StarIcon, StarFilledIcon, SpinnerIcon } from './icons.js';
import { StatusBadge } from './settings-shared.js';
import {
  getEmailProviderStatus,
  getMyEmailAccounts,
  initiateEmailAccountLink,
  unlinkEmailAccount,
  setDefaultEmailAccount,
  setEmailAccountStatus,
  getEmailAppConfig,
  updateApiKeySetting,
} from '../actions.js';

const PROVIDER_LABEL = { google: 'Google', microsoft: 'Microsoft' };

const inputClass =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground';

function Banner({ message }) {
  if (!message) return null;
  return (
    <div
      className={`rounded-lg border p-3 text-sm ${
        message.type === 'error'
          ? 'border-destructive/30 bg-destructive/5 text-destructive'
          : 'border-green-500/30 bg-green-500/5 text-green-500'
      }`}
    >
      {message.text}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile › Email — per-user mailbox linking (multi-account)
// ─────────────────────────────────────────────────────────────────────────────

export function ProfileEmailPage() {
  const [providers, setProviders] = useState({ google: false, microsoft: false });
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(null); // provider id while popup open
  const [error, setError] = useState(null);
  const [confirmUnlink, setConfirmUnlink] = useState(null);
  const popupRef = useRef(null);

  const reloadAccounts = useCallback(async () => {
    const list = await getMyEmailAccounts();
    setAccounts(Array.isArray(list) ? list : []);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [status, list] = await Promise.all([getEmailProviderStatus(), getMyEmailAccounts()]);
        setProviders(status || { google: false, microsoft: false });
        setAccounts(Array.isArray(list) ? list : []);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Receive the popup's postMessage result (same pattern as the agent-secret OAuth flow).
  const handleMessage = useCallback(
    (event) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data;
      if (data?.type === 'oauth-success') {
        setConnecting(null);
        reloadAccounts();
      } else if (data?.type === 'oauth-error') {
        setConnecting(null);
        setError(data.detail || 'Authorization failed.');
      }
    },
    [reloadAccounts]
  );

  useEffect(() => {
    if (!connecting) return;
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [connecting, handleMessage]);

  const handleConnect = async (provider) => {
    setError(null);
    setConnecting(provider);
    const result = await initiateEmailAccountLink({ provider });
    if (result?.error) {
      setError(result.error);
      setConnecting(null);
      return;
    }
    popupRef.current = window.open(result.url, 'oauth-popup', 'width=600,height=700');
  };

  const handleUnlink = async (id) => {
    if (confirmUnlink !== id) {
      setConfirmUnlink(id);
      setTimeout(() => setConfirmUnlink((c) => (c === id ? null : c)), 3000);
      return;
    }
    setConfirmUnlink(null);
    await unlinkEmailAccount(id);
    await reloadAccounts();
  };

  const handleSetDefault = async (id) => {
    await setDefaultEmailAccount(id);
    await reloadAccounts();
  };

  const handleTogglePause = async (acct) => {
    const next = acct.status === 'paused' ? 'active' : 'paused';
    await setEmailAccountStatus(acct.id, next);
    await reloadAccounts();
  };

  if (loading) {
    return <div className="h-48 animate-pulse rounded-md bg-border/50" />;
  }

  const noProviders = !providers.google && !providers.microsoft;

  return (
    <div className="max-w-xl space-y-6">
      <EmailSubNav active="accounts" />
      <div>
        <h2 className="text-base font-medium">Email accounts</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Connect your Gmail / Microsoft 365 mailboxes so the assistant can triage and draft on your
          behalf. You can link more than one of each.
        </p>
      </div>

      <Banner message={error ? { type: 'error', text: error } : null} />

      {noProviders && (
        <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 text-sm text-yellow-600">
          Email isn&apos;t set up for this workspace yet. An admin needs to add the firm&apos;s Google
          and/or Microsoft OAuth app under Settings → Event Handler before mailboxes can be linked.
        </div>
      )}

      {/* Connect buttons */}
      {!noProviders && (
        <div className="flex flex-wrap gap-2">
          {providers.google && (
            <button
              type="button"
              onClick={() => handleConnect('google')}
              disabled={!!connecting}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-border hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {connecting === 'google' ? <SpinnerIcon size={14} className="animate-spin" /> : null}
              Connect Google
            </button>
          )}
          {providers.microsoft && (
            <button
              type="button"
              onClick={() => handleConnect('microsoft')}
              disabled={!!connecting}
              className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium border border-border hover:bg-accent disabled:opacity-50 transition-colors"
            >
              {connecting === 'microsoft' ? <SpinnerIcon size={14} className="animate-spin" /> : null}
              Connect Microsoft
            </button>
          )}
        </div>
      )}

      {connecting && (
        <p className="text-xs text-muted-foreground">
          Complete the sign-in in the popup window. This page updates automatically when you&apos;re done.
        </p>
      )}

      {/* Linked accounts */}
      {accounts.length > 0 && (
        <div className="rounded-lg border bg-card divide-y divide-border">
          {accounts.map((a) => (
            <div key={a.id} className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{a.email}</span>
                  {a.isDefault && (
                    <span className="text-[10px] uppercase tracking-wide rounded bg-foreground/10 px-1.5 py-0.5 text-muted-foreground">
                      Default
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                  <span>{PROVIDER_LABEL[a.provider] || a.provider}</span>
                  <span>·</span>
                  {a.status === 'reauth_required' ? (
                    <span className="text-destructive">Reconnect required</span>
                  ) : a.status === 'paused' ? (
                    <span className="text-yellow-600">Paused</span>
                  ) : (
                    <span className="text-green-600">Active</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0 self-start sm:self-auto">
                {a.status === 'reauth_required' ? (
                  <button
                    type="button"
                    onClick={() => handleConnect(a.provider)}
                    disabled={!!connecting}
                    className="rounded-md px-2.5 py-1.5 text-xs font-medium border border-border hover:bg-accent disabled:opacity-50 transition-colors"
                  >
                    Reconnect
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => handleSetDefault(a.id)}
                      title={a.isDefault ? 'Default account' : 'Make default'}
                      disabled={a.isDefault}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-foreground disabled:opacity-60 transition-colors"
                    >
                      {a.isDefault ? <StarFilledIcon size={14} /> : <StarIcon size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTogglePause(a)}
                      className="rounded-md px-2.5 py-1.5 text-xs border border-border text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {a.status === 'paused' ? 'Resume' : 'Pause'}
                    </button>
                  </>
                )}
                <button
                  type="button"
                  onClick={() => handleUnlink(a.id)}
                  title={confirmUnlink === a.id ? 'Click again to confirm' : 'Disconnect'}
                  className={`rounded-md p-1.5 border transition-colors ${
                    confirmUnlink === a.id
                      ? 'border-destructive text-destructive bg-destructive/10'
                      : 'border-border text-muted-foreground hover:text-destructive hover:border-destructive'
                  }`}
                >
                  <TrashIcon size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Admin › Event Handler › Google / Microsoft — per-firm OAuth app credentials
// ─────────────────────────────────────────────────────────────────────────────

function EmailProviderAdmin({ provider }) {
  const isMs = provider === 'microsoft';
  const label = PROVIDER_LABEL[provider];

  const [loading, setLoading] = useState(true);
  const [redirectUri, setRedirectUri] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [clientSecretSet, setClientSecretSet] = useState(false);
  const [tenantId, setTenantId] = useState('');
  const [scopes, setScopes] = useState('');
  const [scopesDefault, setScopesDefault] = useState('');
  const [copied, setCopied] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const cfg = await getEmailAppConfig();
        const p = cfg[provider] || {};
        setRedirectUri(cfg.redirectUri || '');
        setClientId(p.clientId || '');
        setClientSecretSet(!!p.clientSecretSet);
        setTenantId(p.tenantId || '');
        setScopes(p.scopes || p.scopesDefault || '');
        setScopesDefault(p.scopesDefault || '');
      } finally {
        setLoading(false);
      }
    })();
  }, [provider]);

  const copyRedirect = () => {
    navigator.clipboard.writeText(redirectUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      const prefix = isMs ? 'MS_OAUTH' : 'GOOGLE_OAUTH';
      const writes = [
        updateApiKeySetting(`${prefix}_CLIENT_ID`, clientId.trim()),
        updateApiKeySetting(`${prefix}_SCOPES`, scopes.trim()),
      ];
      if (isMs) writes.push(updateApiKeySetting('MS_OAUTH_TENANT_ID', tenantId.trim()));
      // Only overwrite the secret when the admin actually typed a new one.
      if (clientSecret.trim()) writes.push(updateApiKeySetting(`${prefix}_CLIENT_SECRET`, clientSecret.trim()));

      const results = await Promise.all(writes);
      const failed = results.find((r) => r?.error);
      if (failed) {
        setMessage({ type: 'error', text: failed.error });
      } else {
        if (clientSecret.trim()) setClientSecretSet(true);
        setClientSecret('');
        setMessage({ type: 'success', text: `${label} email settings saved.` });
      }
    } catch {
      setMessage({ type: 'error', text: 'Failed to save settings.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="h-48 animate-pulse rounded-md bg-border/50" />;

  return (
    <div className="max-w-xl space-y-5">
      <div>
        <h2 className="text-base font-medium">{label} email</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Paste this firm&apos;s own {label} OAuth app credentials. Users then link their own mailboxes
          from their profile. Register the app <strong>inside your {isMs ? 'tenant' : 'Workspace org'}</strong>
          {isMs ? '' : ' with consent screen User Type = Internal'} — that keeps you exempt from Google CASA
          / app verification.
        </p>
      </div>

      <Banner message={message} />

      <div className="space-y-2">
        <label className="text-sm font-medium">Redirect URI</label>
        <div className="flex gap-2">
          <input type="text" value={redirectUri} readOnly className={`${inputClass} text-muted-foreground bg-muted`} />
          <button
            type="button"
            onClick={copyRedirect}
            className="rounded-md px-2.5 py-1.5 text-xs border border-border text-muted-foreground hover:text-foreground transition-colors shrink-0"
            title="Copy"
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon size={14} />}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">Add this exact URL as an authorized redirect URI in the {label} app.</p>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Client ID</label>
        <input type="text" value={clientId} onChange={(e) => setClientId(e.target.value)} className={inputClass} placeholder={`${label} OAuth client ID`} />
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium flex items-center gap-2">
          Client Secret
          {clientSecretSet && <StatusBadge isSet={true} />}
        </label>
        <input
          type="password"
          value={clientSecret}
          onChange={(e) => setClientSecret(e.target.value)}
          className={inputClass}
          placeholder={clientSecretSet ? '•••••••• (leave blank to keep current)' : `${label} OAuth client secret`}
        />
      </div>

      {isMs && (
        <div className="space-y-2">
          <label className="text-sm font-medium">Directory (Tenant) ID</label>
          <input type="text" value={tenantId} onChange={(e) => setTenantId(e.target.value)} className={inputClass} placeholder="Single-tenant Directory (Tenant) ID" />
          <p className="text-xs text-muted-foreground">Required for single-tenant apps (same as the Teams setup).</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-sm font-medium">Scopes</label>
        <textarea value={scopes} onChange={(e) => setScopes(e.target.value)} rows={3} className={`${inputClass} font-mono resize-y`} placeholder={scopesDefault} />
        <p className="text-xs text-muted-foreground">
          Space-separated. Identity scopes are appended automatically. Requesting a scope your {label} app
          doesn&apos;t grant will fail at consent.
        </p>
      </div>

      <button
        type="button"
        onClick={handleSave}
        disabled={saving || !clientId.trim()}
        className="rounded-md px-4 py-2 text-sm font-medium bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
    </div>
  );
}

export function EventHandlerGooglePage() {
  return <EmailProviderAdmin provider="google" />;
}

export function EventHandlerMicrosoftPage() {
  return <EmailProviderAdmin provider="microsoft" />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared sub-nav for all email sub-pages
// ─────────────────────────────────────────────────────────────────────────────

function EmailSubNav({ active }) {
  const links = [
    { id: 'accounts', label: 'Accounts', href: '/profile/email' },
    { id: 'inbox',    label: 'Inbox',    href: '/profile/email/inbox' },
    { id: 'guardrails', label: 'Guardrails', href: '/profile/email/guardrails' },
  ];
  return (
    <div className="flex gap-1 border-b border-border mb-6">
      {links.map(l => (
        <a
          key={l.id}
          href={l.href}
          className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
            l.id === active
              ? 'border-foreground text-foreground'
              : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
          }`}
        >
          {l.label}
        </a>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile › Email › Inbox — classified message feed + reply UI (M4)
// ─────────────────────────────────────────────────────────────────────────────

import {
  runEmailPipeline,
  getEmailFeed,
  getEmailMessageBody,
  sendEmailReply,
  approveEmailAction,
  correctEmailMessage,
  getEmailGuardrails,
  upsertEmailGuardrail,
  deleteEmailGuardrail,
  sendEmailBriefing,
} from '../actions.js';

const CATEGORY_COLOR = {
  'VIP':           'bg-yellow-500/15 text-yellow-600 border-yellow-500/30',
  'Important':     'bg-blue-500/15 text-blue-600 border-blue-500/30',
  'Action-needed': 'bg-orange-500/15 text-orange-600 border-orange-500/30',
  'Sales':         'bg-gray-500/15 text-muted-foreground border-border',
  'Junk':          'bg-red-500/15 text-red-600 border-red-500/30',
  'Unsubscribe':   'bg-purple-500/15 text-purple-600 border-purple-500/30',
  'Other':         'bg-gray-500/15 text-muted-foreground border-border',
};

const ALL_CATEGORIES = ['VIP','Important','Action-needed','Sales','Junk','Unsubscribe','Other'];

function CategoryBadge({ category, onClick }) {
  const cls = CATEGORY_COLOR[category] || 'bg-gray-500/15 text-muted-foreground border-border';
  return (
    <span
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls} ${onClick ? 'cursor-pointer hover:opacity-80' : ''}`}
    >
      {category || 'Unclassified'}
    </span>
  );
}

function MessageRow({ msg, onBodyRequest, onReply, onCorrect, onApprove }) {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState(null);
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const headers = msg.headers || {};
  const from = headers.from || '';
  const fromShort = from.replace(/<[^>]+>/, '').trim() || from;
  const date = msg.receivedAt ? new Date(msg.receivedAt).toLocaleString(undefined, { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' }) : '';

  async function expand() {
    setExpanded(e => !e);
    if (!body && !expanded) {
      const res = await onBodyRequest(msg.id);
      setBody(res?.body || '(body not available)');
    }
  }

  async function handleSend() {
    if (!replyText.trim()) return;
    setSending(true); setError(null);
    const res = await onReply(msg.id, replyText);
    setSending(false);
    if (res?.error) { setError(res.error); return; }
    setDone(true); setReplyOpen(false); setReplyText('');
  }

  async function handleCorrect(cat) {
    setCorrecting(false);
    await onCorrect(msg.id, cat);
  }

  if (done) return null;

  return (
    <div className="border-b border-border last:border-0 py-3">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={expand}>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{fromShort}</span>
            {msg.classification && <CategoryBadge category={msg.classification} onClick={(e) => { e.stopPropagation(); setCorrecting(c => !c); }} />}
            <span className="text-xs text-muted-foreground ml-auto shrink-0">{date}</span>
          </div>
          <div className="text-sm font-medium mt-0.5">{headers.subject || '(no subject)'}</div>
          <div className="text-xs text-muted-foreground mt-0.5 truncate">{headers.snippet || ''}</div>
        </div>
      </div>

      {/* Category correction dropdown */}
      {correcting && (
        <div className="mt-2 flex flex-wrap gap-1">
          <span className="text-xs text-muted-foreground mr-1 self-center">Correct to:</span>
          {ALL_CATEGORIES.filter(c => c !== msg.classification).map(cat => (
            <button key={cat} onClick={() => handleCorrect(cat)}
              className="text-xs px-2 py-0.5 rounded-full border border-border hover:bg-accent">
              {cat}
            </button>
          ))}
          <button onClick={() => setCorrecting(false)} className="text-xs px-2 py-0.5 text-muted-foreground hover:text-foreground">✕</button>
        </div>
      )}

      {/* Expanded body */}
      {expanded && (
        <div className="mt-2 rounded-md bg-muted/50 p-3 text-xs font-mono whitespace-pre-wrap max-h-64 overflow-y-auto">
          {body === null ? 'Loading…' : body}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-2 flex gap-2">
        <button onClick={() => { setReplyOpen(r => !r); setExpanded(true); if (!body) expand(); }}
          className="text-xs px-3 py-1 rounded-md border border-border hover:bg-accent">
          ↩ Reply
        </button>
        {error && <span className="text-xs text-destructive">{error}</span>}
        {msg.status === 'actioned' && (
          <span className="text-xs text-muted-foreground">{msg.classification === 'VIP' || msg.classification === 'Important' ? '★ Flagged' : '✓ Actioned'}</span>
        )}
      </div>

      {/* Inline reply composer */}
      {replyOpen && (
        <div className="mt-3 space-y-2">
          <textarea
            value={replyText}
            onChange={e => setReplyText(e.target.value)}
            placeholder="Type your reply…"
            rows={4}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-foreground resize-none"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSend}
              disabled={sending || !replyText.trim()}
              className="text-xs px-4 py-1.5 rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-50"
            >
              {sending ? 'Sending…' : 'Send'}
            </button>
            <button onClick={() => setReplyOpen(false)} className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function EmailInboxPage() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [briefing, setBriefing] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  const [filter, setFilter] = useState('all'); // all | pending | VIP | Important | Action-needed
  const [banner, setBanner] = useState(null);

  async function loadFeed() {
    setLoading(true);
    const status = filter === 'all' || ALL_CATEGORIES.includes(filter) ? undefined : filter;
    const msgs = await getEmailFeed({ limit: 100, status });
    const filtered = filter !== 'all' && ALL_CATEGORIES.includes(filter)
      ? msgs.filter(m => m.classification === filter)
      : msgs;
    setMessages(filtered);
    setLoading(false);
  }

  useEffect(() => { loadFeed(); }, [filter]);

  async function handleSync() {
    setSyncing(true); setBanner(null);
    const res = await runEmailPipeline();
    setSyncing(false);
    setLastSync(new Date());
    if (res?.error) { setBanner({ type: 'error', text: res.error }); return; }
    const synced = res?.sync?.total ?? 0;
    const classified = res?.classify?.classified ?? 0;
    setBanner({ type: 'success', text: `Synced ${synced} new message${synced !== 1 ? 's' : ''}, classified ${classified}.` });
    loadFeed();
  }

  async function handleSendBriefing() {
    setBriefing(true); setBanner(null);
    const res = await sendEmailBriefing();
    setBriefing(false);
    if (res?.error) { setBanner({ type: 'error', text: res.error }); return; }
    setBanner({ type: 'success', text: 'Briefing sent to your email.' });
  }

  const counts = {};
  messages.forEach(m => { const c = m.classification || 'Other'; counts[c] = (counts[c] || 0) + 1; });

  return (
    <div className="space-y-4">
      <EmailSubNav active="inbox" />
      {/* Header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap gap-y-2">
        <div>
          <h3 className="text-sm font-semibold">Inbox</h3>
          {lastSync && <p className="text-xs text-muted-foreground">Last sync: {lastSync.toLocaleTimeString()}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleSendBriefing}
            disabled={briefing || syncing}
            className="text-xs px-3 py-1.5 rounded-md border border-border hover:bg-accent disabled:opacity-50"
          >
            {briefing ? '✉ Sending…' : '✉ Send briefing'}
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs px-4 py-1.5 rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-50 flex items-center gap-1.5"
          >
            {syncing ? '⟳ Syncing…' : '⟳ Sync Now'}
          </button>
        </div>
      </div>

      {banner && (
        <div className={`rounded-lg border p-3 text-sm ${banner.type === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-green-500/30 bg-green-500/5 text-green-500'}`}>
          {banner.text}
        </div>
      )}

      {/* Filter pills */}
      <div className="flex flex-wrap gap-1.5">
        {['all','VIP','Important','Action-needed','Sales','Junk'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${filter === f ? 'bg-foreground text-background border-foreground' : 'border-border hover:bg-accent'}`}>
            {f === 'all' ? `All (${messages.length})` : `${f}${counts[f] ? ` (${counts[f]})` : ''}`}
          </button>
        ))}
      </div>

      {/* Message list */}
      {loading ? (
        <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
      ) : messages.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">
          {filter === 'all' ? 'No emails yet — click Sync Now to fetch your inbox.' : `No ${filter} emails.`}
        </p>
      ) : (
        <div>
          {messages.map(msg => (
            <MessageRow
              key={msg.id}
              msg={msg}
              onBodyRequest={(id) => getEmailMessageBody(id)}
              onReply={async (id, body) => {
                const res = await sendEmailReply({ messageId: id, body });
                if (!res?.error) { setBanner({ type: 'success', text: 'Reply sent.' }); loadFeed(); }
                return res;
              }}
              onCorrect={async (id, cat) => {
                await correctEmailMessage({ messageId: id, correctedCategory: cat });
                loadFeed();
              }}
              onApprove={async (actionId) => {
                const res = await approveEmailAction(actionId);
                if (!res?.error) loadFeed();
                return res;
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Profile › Email › Guardrails — per-category automation control
// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = ['VIP', 'Important', 'Action-needed', 'Sales', 'Junk', 'Unsubscribe', 'Other'];

const CATEGORY_ACTION_LABEL = {
  'VIP':           'mark important',
  'Important':     'mark important',
  'Action-needed': 'draft reply',
  'Sales':         'archive',
  'Junk':          'trash',
  'Unsubscribe':   'flag for review',
  'Other':         'archive',
};

const MODE_OPTIONS = [
  { value: 'shadow',       label: 'Observe only',       desc: 'Records what it would do — never touches your inbox.' },
  { value: 'manual',       label: 'Approve first',       desc: 'Creates a draft or queues the action; you approve before anything happens.' },
  { value: 'pending_auto', label: 'Act with undo window', desc: 'Executes automatically after a short delay you can cancel.' },
  { value: 'off',          label: 'Skip',                desc: 'Ignores this category entirely.' },
];

const UNDO_OPTIONS = [
  { value: 30,  label: '30 sec' },
  { value: 60,  label: '1 min' },
  { value: 120, label: '2 min' },
  { value: 300, label: '5 min' },
];

const SYSTEM_DEFAULT = { mode: 'shadow', confidenceThreshold: 80, undoWindowSec: 60 };

function modeLabel(mode) {
  return MODE_OPTIONS.find(m => m.value === mode)?.label ?? mode;
}

function GuardrailRow({ scope, scopeValue, label, rule, systemDefault, onSave, onDelete }) {
  const effective = rule ?? systemDefault;
  const [mode, setMode] = useState(effective.mode);
  const [threshold, setThreshold] = useState(effective.confidenceThreshold ?? 80);
  const [undoSec, setUndoSec] = useState(effective.undoWindowSec ?? 60);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDefault = !rule;
  const dirty = mode !== effective.mode || threshold !== (effective.confidenceThreshold ?? 80) || undoSec !== (effective.undoWindowSec ?? 60);

  async function handleSave() {
    setSaving(true);
    await onSave({ scope, scopeValue, mode, confidenceThreshold: threshold, undoWindowSec: undoSec });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleDelete() {
    if (!rule) return;
    await onDelete(rule.id);
  }

  return (
    <div className="py-4 border-b border-border last:border-0">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{label}</span>
            {isDefault && (
              <span className="text-[10px] uppercase tracking-wide rounded bg-foreground/10 px-1.5 py-0.5 text-muted-foreground">
                using default
              </span>
            )}
          </div>
          {scope === 'category' && (
            <p className="text-xs text-muted-foreground mt-0.5">Agent action: {CATEGORY_ACTION_LABEL[scopeValue] || 'archive'}</p>
          )}
          {scope === 'global' && (
            <p className="text-xs text-muted-foreground mt-0.5">Applies to all categories unless overridden below</p>
          )}
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={handleDelete}
            title="Reset to default"
            className="shrink-0 rounded-md p-1.5 border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
          >
            <TrashIcon size={12} />
          </button>
        )}
      </div>

      <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
        {/* Mode */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Mode</label>
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground"
          >
            {MODE_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className="text-xs text-muted-foreground">{MODE_OPTIONS.find(o => o.value === mode)?.desc}</p>
        </div>

        {/* Confidence threshold */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">Min. confidence: {threshold}%</label>
          <input
            type="range"
            min={50} max={99} step={5}
            value={threshold}
            onChange={e => setThreshold(Number(e.target.value))}
            className="w-full accent-foreground"
          />
          <p className="text-xs text-muted-foreground">Lower = act on more messages; higher = only act when very sure.</p>
        </div>

        {/* Undo window (only relevant for pending_auto) */}
        <div className="space-y-1">
          <label className={`text-xs font-medium ${mode === 'pending_auto' ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
            Undo window
          </label>
          <select
            value={undoSec}
            onChange={e => setUndoSec(Number(e.target.value))}
            disabled={mode !== 'pending_auto'}
            className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-foreground disabled:opacity-40"
          >
            {UNDO_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
          <p className={`text-xs ${mode === 'pending_auto' ? 'text-muted-foreground' : 'text-muted-foreground/40'}`}>
            How long you have to cancel before the action executes.
          </p>
        </div>
      </div>

      {dirty && (
        <div className="mt-3">
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="text-xs px-4 py-1.5 rounded-md bg-foreground text-background hover:opacity-80 disabled:opacity-50"
          >
            {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
          </button>
        </div>
      )}
      {!dirty && saved && (
        <p className="mt-2 text-xs text-green-600">Saved ✓</p>
      )}
    </div>
  );
}

export function EmailGuardrailsPage() {
  const [rules, setRules] = useState(null); // null = loading
  const [banner, setBanner] = useState(null);

  async function loadRules() {
    const data = await getEmailGuardrails();
    setRules(Array.isArray(data) ? data : []);
  }

  useEffect(() => { loadRules(); }, []);

  async function handleSave({ scope, scopeValue, mode, confidenceThreshold, undoWindowSec }) {
    const res = await upsertEmailGuardrail({ scope, scopeValue, mode, confidenceThreshold, undoWindowSec });
    if (res?.error) {
      setBanner({ type: 'error', text: res.error });
    } else {
      await loadRules();
    }
  }

  async function handleDelete(id) {
    const res = await deleteEmailGuardrail(id);
    if (res?.error) {
      setBanner({ type: 'error', text: res.error });
    } else {
      await loadRules();
    }
  }

  if (rules === null) {
    return <div className="h-48 animate-pulse rounded-md bg-border/50" />;
  }

  const byKey = {};
  for (const r of rules) {
    byKey[`${r.scope}:${r.scopeValue ?? ''}`] = r;
  }
  const globalRule = byKey['global:'] ?? null;

  return (
    <div className="max-w-2xl space-y-6">
      <EmailSubNav active="guardrails" />
      <div>
        <h2 className="text-base font-medium">Email guardrails</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Control how autonomously the assistant handles each type of email. Start with{' '}
          <strong>Observe only</strong> to build confidence, then graduate to{' '}
          <strong>Act with undo window</strong> for categories you trust.
        </p>
      </div>

      {banner && (
        <div className={`rounded-lg border p-3 text-sm ${banner.type === 'error' ? 'border-destructive/30 bg-destructive/5 text-destructive' : 'border-green-500/30 bg-green-500/5 text-green-500'}`}>
          {banner.text}
        </div>
      )}

      {/* Global default */}
      <div className="rounded-lg border bg-card px-4">
        <GuardrailRow
          scope="global"
          scopeValue={null}
          label="Global default"
          rule={globalRule}
          systemDefault={SYSTEM_DEFAULT}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      </div>

      {/* Per-category overrides */}
      <div>
        <h3 className="text-sm font-medium mb-3">Per-category overrides</h3>
        <p className="text-xs text-muted-foreground mb-4">
          Leave a category on <em>using default</em> to inherit the global setting. Set a per-category mode to override it for that specific type.
        </p>
        <div className="rounded-lg border bg-card px-4">
          {CATEGORIES.map(cat => (
            <GuardrailRow
              key={cat}
              scope="category"
              scopeValue={cat}
              label={cat}
              rule={byKey[`category:${cat}`] ?? null}
              systemDefault={globalRule ?? SYSTEM_DEFAULT}
              onSave={handleSave}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
