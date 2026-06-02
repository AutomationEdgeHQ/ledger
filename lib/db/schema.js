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
