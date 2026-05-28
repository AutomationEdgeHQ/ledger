/**
 * Public status reader. Returns information safe to expose without auth.
 *
 * What's included: product name, version, uptime, channel-configured booleans.
 * What's NOT included: user counts, conversation data, secret values,
 * hostnames, or anything that could leak operational detail beyond
 * "the bot is running and these channels are wired."
 *
 * Server-side only.
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { getConfigSecret } from '../db/config.js';

let cachedVersion = null;

async function getVersion() {
  if (cachedVersion) return cachedVersion;
  try {
    const pkgPath = join(process.cwd(), 'node_modules', 'thepopebot', 'package.json');
    const raw = await readFile(pkgPath, 'utf8');
    cachedVersion = JSON.parse(raw).version;
  } catch {
    cachedVersion = 'unknown';
  }
  return cachedVersion;
}

function isSecretSet(key) {
  try {
    return !!getConfigSecret(key);
  } catch {
    return false;
  }
}

/**
 * Returns the public status object.
 * @param {object} branding - result of getBranding()
 */
export async function getStatus(branding) {
  const version = await getVersion();
  const uptimeSeconds = Math.floor(process.uptime());

  return {
    productName: branding.productName,
    operational: true,
    version,
    uptimeSeconds,
    uptimeHuman: formatUptime(uptimeSeconds),
    channels: {
      slack: isSecretSet('SLACK_BOT_TOKEN'),
      teams: isSecretSet('TEAMS_APP_ID'),
      telegram: isSecretSet('TELEGRAM_BOT_TOKEN'),
    },
    checkedAt: new Date().toISOString(),
  };
}

function formatUptime(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    const m = minutes % 60;
    return m > 0 ? `${hours}h ${m}m` : `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  const h = hours % 24;
  return h > 0 ? `${days}d ${h}h` : `${days}d`;
}
