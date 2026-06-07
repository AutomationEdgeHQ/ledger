import { sqliteTable, text, integer, uniqueIndex, index } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  firstName: text('first_name'),
  lastName: text('last_name'),
  nickname: text('nickname'),
  subscribedToSystemMessages: integer('subscribed_to_system_messages').notNull().default(1),
  mfaEnabled: integer('mfa_enabled').notNull().default(0),
  mfaSecret: text('mfa_secret'),
  mfaRecoveryCodes: text('mfa_recovery_codes'),
  mfaSetupAt: integer('mfa_setup_at'),
  mfaFailedAttempts: integer('mfa_failed_attempts').notNull().default(0),
  mfaLockedUntil: integer('mfa_locked_until'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const mfaEmailCodes = sqliteTable(
  'mfa_email_codes',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    codeHash: text('code_hash').notNull(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    mfaEmailCodesUserLookup: index('mfa_email_codes_user_lookup').on(t.userId, t.expiresAt),
  })
);

export const passwordResetTokens = sqliteTable(
  'password_reset_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at').notNull(),
    usedAt: integer('used_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    passwordResetTokensUserLookup: index('password_reset_tokens_user_lookup').on(t.userId, t.expiresAt),
  })
);

export const chats = sqliteTable('chats', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull().default('New Chat'),
  starred: integer('starred').notNull().default(0),
  chatMode: text('chat_mode').notNull().default('agent'),
  codeWorkspaceId: text('code_workspace_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id'),
    userId: text('user_id').notNull(),
    role: text('role').notNull(),
    content: text('content').notNull(),
    payload: text('payload'),
    read: integer('read').notNull().default(0),
    deliveredAt: integer('delivered_at'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    inboxLookup: index('messages_inbox_lookup').on(t.userId, t.read, t.createdAt),
  })
);

export const codeWorkspaces = sqliteTable('code_workspaces', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  containerName: text('container_name').unique(),
  repo: text('repo'),
  branch: text('branch'),
  featureBranch: text('feature_branch'),
  title: text('title').notNull().default('Code Workspace'),
  lastInteractiveCommit: text('last_interactive_commit'),
  codingAgent: text('coding_agent'),
  scope: text('scope'),
  starred: integer('starred').notNull().default(0),
  hasChanges: integer('has_changes').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const clusters = sqliteTable('clusters', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  name: text('name').notNull().default('New Cluster'),
  systemPrompt: text('system_prompt').notNull().default(''),
  folders: text('folders'),
  enabled: integer('enabled').notNull().default(0),
  starred: integer('starred').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const clusterRoles = sqliteTable('cluster_roles', {
  id: text('id').primaryKey(),
  clusterId: text('cluster_id').notNull(),
  roleName: text('role_name').notNull(),
  role: text('role').notNull().default(''),
  prompt: text('prompt').notNull().default('Execute your role.'),
  triggerConfig: text('trigger_config'),
  maxConcurrency: integer('max_concurrency').notNull().default(1),
  cleanupWorkerDir: integer('cleanup_worker_dir').notNull().default(0),
  planMode: integer('plan_mode').notNull().default(0),
  folders: text('folders'),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const settings = sqliteTable('settings', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  key: text('key').notNull(),
  value: text('value').notNull(),
  createdBy: text('created_by'),
  lastUsedAt: integer('last_used_at'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const userChannels = sqliteTable(
  'user_channels',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    channel: text('channel').notNull(),
    channelChatId: text('channel_chat_id'),
    code: text('code'),
    codeExpiresAt: integer('code_expires_at'),
    verifiedAt: integer('verified_at'),
    activeThreadId: text('active_thread_id'),
    systemMessagesEnabled: integer('system_messages_enabled').notNull().default(1),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    userChannelUnique: uniqueIndex('user_channels_user_channel_unique').on(t.userId, t.channel),
    channelChatIdUnique: uniqueIndex('user_channels_channel_chat_id_unique').on(t.channel, t.channelChatId),
    codeLookup: index('user_channels_code_lookup').on(t.code),
  })
);

// Email agent: linked mailboxes. Unlike user_channels (one row per channel
// type), a user may link MANY accounts — multiple Gmail + multiple M365 — so
// the uniqueness is (userId, provider, email), not (userId, provider).
// Tokens are stored encrypted (AES-256-GCM via lib/db/crypto.js); never plain.
export const userEmailAccounts = sqliteTable(
  'user_email_accounts',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    provider: text('provider').notNull(), // 'google' | 'microsoft'
    email: text('email').notNull(),
    displayName: text('display_name'),
    refreshTokenEnc: text('refresh_token_enc'),
    accessTokenEnc: text('access_token_enc'),
    accessTokenExpiresAt: integer('access_token_expires_at'),
    scopes: text('scopes'),
    isDefault: integer('is_default').notNull().default(0),
    status: text('status').notNull().default('active'), // 'active' | 'paused' | 'reauth_required'
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    accountUnique: uniqueIndex('user_email_accounts_user_provider_email_unique').on(
      t.userId,
      t.provider,
      t.email
    ),
    userLookup: index('user_email_accounts_user_lookup').on(t.userId),
  })
);

// ── Email agent: inbox messages ─────────────────────────────────────────────
// One row per inbound message. bodyEnc is purged (set null) once the message
// is actioned + cleared — headers + classification are kept as the audit trail.
// Tokens encrypted via lib/db/crypto.js; never stored in plain text.
export const emailMessages = sqliteTable(
  'email_messages',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(), // user_email_accounts.id
    userId: text('user_id').notNull(),        // for direct user-scoped queries
    providerMessageId: text('provider_message_id').notNull(),
    threadId: text('thread_id').notNull(),
    // JSON: { from, to, subject, receivedAt, labels } — never purged
    headers: text('headers').notNull(),
    bodyEnc: text('body_enc'), // AES-GCM encrypted; nulled on clear
    receivedAt: integer('received_at').notNull(),
    // LLM classification results
    classification: text('classification'), // 'VIP'|'Important'|'Action-needed'|'Sales'|'Junk'|'Unsubscribe'|'Other'
    summary: text('summary'),
    confidence: integer('confidence'),       // 0-100
    extracted: text('extracted'),            // JSON: { actionItems, deadline, sentiment, replyNeeded }
    // Lifecycle
    status: text('status').notNull().default('pending'), // pending|classified|actioned|cleared
    clearedAt: integer('cleared_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    // Idempotency: a message seen twice is the same row
    msgUnique: uniqueIndex('email_messages_account_provider_id_unique').on(
      t.accountId,
      t.providerMessageId
    ),
    // Queue lookup: "give me all pending messages for this user"
    statusQueue: index('email_messages_user_status_idx').on(t.userId, t.status, t.receivedAt),
    // Thread assembly
    threadLookup: index('email_messages_thread_idx').on(t.accountId, t.threadId),
  })
);

// ── Email agent: action log (permanent) ─────────────────────────────────────
// Immutable audit trail. Rows are never deleted — wasCorrected + correctedToActionId
// link to the replacement when a user corrects an action.
export const emailActions = sqliteTable(
  'email_actions',
  {
    id: text('id').primaryKey(),
    messageId: text('message_id').notNull(),  // email_messages.id
    accountId: text('account_id').notNull(),
    userId: text('user_id').notNull(),
    // Type of action: 'classify' | 'archive' | 'trash' | 'label' |
    //   'draft_reply' | 'send_reply' | 'move' | 'mark_read' |
    //   'flag_unsubscribe' | 'noop'
    actionType: text('action_type').notNull(),
    payload: text('payload'),   // JSON: action-specific details
    // How this action was taken
    mode: text('mode').notNull(), // 'shadow'|'manual'|'pending_auto'|'auto'|'off'
    actor: text('actor').notNull().default('agent'), // 'agent'|'user'
    confidence: integer('confidence'),
    // Correction trail
    wasCorrected: integer('was_corrected').notNull().default(0),
    correctedToActionId: text('corrected_to_action_id'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    msgLookup:  index('email_actions_message_idx').on(t.messageId),
    userRecent: index('email_actions_user_created_idx').on(t.userId, t.createdAt),
    // Drain query: find pending_auto actions past their undo window
    pendingAuto: index('email_actions_pending_auto_idx').on(t.mode, t.createdAt),
  })
);

// ── Email agent: per-user guardrails ─────────────────────────────────────────
// Controls whether the agent shadows, drafts, or auto-acts for a given
// (user, category, sender) combination. Most-specific scope wins at runtime.
// scope hierarchy: global < category < sender < category_sender
export const emailGuardrails = sqliteTable(
  'email_guardrails',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').notNull(),
    // Scope determines what this rule applies to
    scope: text('scope').notNull(), // 'global'|'category'|'sender'|'category_sender'
    scopeValue: text('scope_value'), // category name | sender email | "category:sender"
    category: text('category'),
    mode: text('mode').notNull().default('shadow'), // 'shadow'|'auto'|'manual'|'off'
    confidenceThreshold: integer('confidence_threshold').notNull().default(80),
    undoWindowSec: integer('undo_window_sec').notNull().default(60),
    // Graduation tracking (how many correct auto-actions before promoting)
    exampleCount: integer('example_count').notNull().default(0),
    graduatedAt: integer('graduated_at'),
    lastCorrectionAt: integer('last_correction_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => ({
    // One rule per scope context per user
    guardrailUnique: uniqueIndex('email_guardrails_user_scope_unique').on(
      t.userId,
      t.scope,
      t.scopeValue
    ),
    userLookup: index('email_guardrails_user_idx').on(t.userId),
  })
);

// ── Email agent: user corrections (few-shot training signal) ─────────────────
// Written whenever a user overrides an agent action. Fed back into the
// classifier prompt as few-shot examples to improve accuracy over time.
export const emailCorrections = sqliteTable(
  'email_corrections',
  {
    id: text('id').primaryKey(),
    actionId: text('action_id').notNull(), // email_actions.id
    userId: text('user_id').notNull(),
    originalAction: text('original_action').notNull(), // JSON
    correctedAction: text('corrected_action').notNull(), // JSON
    userNote: text('user_note'),
    category: text('category'),
    sender: text('sender'),
    createdAt: integer('created_at').notNull(),
  },
  (t) => ({
    userRecent:    index('email_corrections_user_created_idx').on(t.userId, t.createdAt),
    // Retrieve few-shot examples by category + sender for the classifier
    fewShotLookup: index('email_corrections_user_cat_sender_idx').on(
      t.userId,
      t.category,
      t.sender
    ),
  })
);
