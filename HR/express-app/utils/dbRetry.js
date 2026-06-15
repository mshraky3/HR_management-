/**
 * Database retry helper
 *
 * The production database is a scale-to-zero Postgres (Koyeb) that suspends when
 * idle. The first request after an idle period has to wake the instance, and that
 * cold start can exceed the driver's connect_timeout — surfacing as
 * `write CONNECT_TIMEOUT ...:5432` and a 500 to the user.
 *
 * `withDbRetry` re-runs a read operation a few times when it fails with a
 * transient connection error. The very act of the first (failed) attempt wakes the
 * database, so a short backoff is usually enough for the retry to succeed.
 *
 * Only use this for idempotent reads. Do NOT wrap writes that are not safe to repeat.
 */
import { log } from './logger.js';

// postgres.js error codes + Node socket errors that indicate a connection-level
// failure (as opposed to a real query/data error, which must not be retried).
const TRANSIENT_CODES = new Set([
  'CONNECT_TIMEOUT',
  'CONNECTION_CLOSED',
  'CONNECTION_ENDED',
  'CONNECTION_DESTROYED',
  'ECONNRESET',
  'ETIMEDOUT',
  'ECONNREFUSED',
  'EPIPE',
  'EAI_AGAIN',
  // Postgres connection-class SQLSTATEs
  '08000', '08001', '08003', '08004', '08006', '08007',
  '57P01', // admin_shutdown
  '57P03', // cannot_connect_now (server still starting)
]);

const TRANSIENT_MESSAGE_FRAGMENTS = [
  'CONNECT_TIMEOUT',
  'Connection terminated',
  'terminating connection',
  'connection closed',
  'socket hang up',
  'read ECONNRESET',
  'write ECONNRESET',
];

export function isTransientDbError(error) {
  if (!error) return false;
  const code = error.code != null ? String(error.code) : '';
  if (code && TRANSIENT_CODES.has(code)) return true;
  const message = String(error.message || '');
  return TRANSIENT_MESSAGE_FRAGMENTS.some((fragment) => message.includes(fragment));
}

/**
 * Run an async function, retrying on transient DB connection errors.
 * @param {() => Promise<T>} fn - factory that performs the DB work (must create fresh queries each call)
 * @param {{ retries?: number, baseDelayMs?: number, label?: string }} [options]
 * @returns {Promise<T>}
 * @template T
 */
export async function withDbRetry(fn, { retries = 3, baseDelayMs = 700, label = 'db-op' } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isTransientDbError(error)) {
        throw error;
      }
      const delay = baseDelayMs * attempt; // 700ms, 1400ms, ...
      log.warn(
        `Transient DB error on "${label}" (attempt ${attempt}/${retries}); retrying in ${delay}ms`,
        { error: error.message, code: error.code }
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}
