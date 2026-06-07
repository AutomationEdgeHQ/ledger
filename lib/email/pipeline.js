/**
 * Email pipeline orchestrator.
 *
 * Runs the full cycle for a user:
 *   1. Sync inboxes (fetch new messages from providers)
 *   2. Classify pending messages (LLM triage)
 *   3. Process decisions (guardrail engine — shadow/manual/queue)
 *   4. Drain undo queue (execute pending_auto actions past their window)
 *
 * Each step is independent and error-tolerant: a failure in one step
 * doesn't abort the others. All results are returned for logging/monitoring.
 *
 * Intended callers:
 *   - A jay-bot CRONS.json `type:"command"` entry hitting a ledger CLI/endpoint (M5)
 *   - Direct import for testing / one-off runs
 *   - Eventually: a ledger-internal scheduler
 */

import { syncAllAccounts } from './inbox-sync.js';
import { classifyPending } from './classifier.js';
import { processDecisions, drainUndoQueue } from './decide.js';

/**
 * Run the full email pipeline for a user.
 *
 * @param {string} userId
 * @returns {{ sync, classify, decide, drain, durationMs }}
 */
export async function runPipeline(userId) {
  const start = Date.now();
  const results = {};

  try {
    results.sync = await syncAllAccounts(userId);
  } catch (err) {
    results.sync = { total: 0, errors: [err.message] };
  }

  try {
    results.classify = await classifyPending(userId);
  } catch (err) {
    results.classify = { classified: 0, errors: [err.message] };
  }

  try {
    results.decide = await processDecisions(userId);
  } catch (err) {
    results.decide = { decided: 0, errors: [err.message] };
  }

  try {
    results.drain = await drainUndoQueue(userId);
  } catch (err) {
    results.drain = { executed: 0, errors: [err.message] };
  }

  results.durationMs = Date.now() - start;
  return results;
}

/**
 * Collect all errors across all pipeline steps for logging.
 */
export function collectErrors(results) {
  return [
    ...(results.sync?.errors || []),
    ...(results.classify?.errors || []),
    ...(results.decide?.errors || []),
    ...(results.drain?.errors || []),
  ];
}
