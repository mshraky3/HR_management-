/**
 * Auth service: login lockout, login events and email one-time codes (OTP).
 *
 * Both account kinds go through the same code:
 *   kind 'user'   -> table users,    OTP table user_otp_tokens   (fk user_id)
 *   kind 'branch' -> table branches, OTP table branch_otp_tokens (fk branch_id)
 *
 * Security properties (see migration 025):
 *  - the OTP step is only reachable with a signed otp_session token that proves the
 *    password step succeeded (utils/jwt.js signOtpSession);
 *  - each OTP guess consumes one attempt atomically (UPDATE ... RETURNING), so
 *    parallel guesses cannot beat the attempt cap;
 *  - repeated wrong passwords lock the account for a few minutes.
 */

import crypto from 'crypto';
import sql from '../config/database.js';
import { log } from '../utils/logger.js';
import { sendOTPEmail } from '../utils/emailService.js';
import { clientIp } from '../middleware/rateLimit.js';

export const OTP_EXPIRY_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;
export const LOGIN_LOCK_THRESHOLD = 6;
export const LOGIN_LOCK_MINUTES = 10;

const KINDS = {
  user: { table: 'users', otpTable: 'user_otp_tokens', fk: 'user_id' },
  branch: { table: 'branches', otpTable: 'branch_otp_tokens', fk: 'branch_id' }
};

function kindConfig(kind) {
  const cfg = KINDS[kind];
  if (!cfg) throw new Error(`Unknown account kind: ${kind}`);
  return cfg;
}

export function generateOTP() {
  return crypto.randomInt(100000, 1000000).toString();
}

function hashOTP(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

export function maskEmail(email) {
  if (!email) return '';
  const [local, domain] = email.split('@');
  const visible = local.length <= 3 ? local[0] : local.slice(0, 3);
  return `${visible}***@${domain}`;
}

// --- login events ----------------------------------------------------------

export async function logLoginEvent(kind, accountId, username, event, req) {
  try {
    await sql`
      INSERT INTO login_events (account_kind, account_id, username, event, ip_address, user_agent)
      VALUES (${kind}, ${accountId ?? null}, ${username ? String(username).slice(0, 255) : null}, ${event},
              ${req ? String(clientIp(req)).slice(0, 64) : null}, ${req?.get?.('user-agent') || null})
    `;
  } catch (err) {
    // Auditing must never break a login.
    log.warn('Could not record login event', { error: err.message, event });
  }
}

// --- lockout ---------------------------------------------------------------

/** Minutes left on an active lock, or 0. `row` needs locked_until. */
export function lockMinutesRemaining(row) {
  if (!row?.locked_until) return 0;
  const ms = new Date(row.locked_until).getTime() - Date.now();
  return ms > 0 ? Math.ceil(ms / 60000) : 0;
}

export function lockedResponse(minutes) {
  return {
    success: false,
    locked: true,
    message: `تم إيقاف تسجيل الدخول مؤقتاً بسبب كثرة المحاولات الخاطئة. حاول مرة أخرى بعد ${minutes} دقيقة.`
  };
}

/** Records a wrong password; returns { failed_attempts, locked_until }. */
export async function registerLoginFailure(kind, accountId) {
  const { table } = kindConfig(kind);
  const [row] = await sql.unsafe(`
    UPDATE ${table} t SET
      failed_attempts = n.cnt,
      locked_until = CASE WHEN n.cnt >= $2 THEN NOW() + ($3 || ' minutes')::interval ELSE NULL END
    FROM (
      SELECT id,
             CASE WHEN locked_until IS NOT NULL AND locked_until < NOW() THEN 1 ELSE failed_attempts + 1 END AS cnt
      FROM ${table} WHERE id = $1 FOR UPDATE
    ) n
    WHERE t.id = n.id
    RETURNING t.failed_attempts, t.locked_until
  `, [accountId, LOGIN_LOCK_THRESHOLD, String(LOGIN_LOCK_MINUTES)]);
  return row || { failed_attempts: 0, locked_until: null };
}

export async function registerLoginSuccess(kind, accountId) {
  const { table } = kindConfig(kind);
  await sql.unsafe(
    `UPDATE ${table} SET failed_attempts = 0, locked_until = NULL, last_login_at = NOW() WHERE id = $1`,
    [accountId]
  );
}

// --- OTP tables (created on demand, once per process) -----------------------

const otpTableReady = {};
function ensureOtpTable(kind) {
  if (otpTableReady[kind]) return otpTableReady[kind];
  const { otpTable, fk } = kindConfig(kind);
  const parent = kind === 'user' ? 'users' : 'branches';
  otpTableReady[kind] = (async () => {
    await sql.unsafe(`
      CREATE TABLE IF NOT EXISTS ${otpTable} (
        id SERIAL PRIMARY KEY,
        ${fk} INTEGER NOT NULL REFERENCES ${parent}(id) ON DELETE CASCADE,
        otp_hash VARCHAR(128) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        attempts INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_${otpTable}_${fk} ON ${otpTable}(${fk})`);
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_${otpTable}_expires ON ${otpTable}(expires_at)`);
  })().catch((err) => {
    otpTableReady[kind] = null;
    throw err;
  });
  return otpTableReady[kind];
}

/**
 * Creates and e-mails a fresh code.
 * @returns {{ ok: true } | { ok: false, reason: 'cooldown', waitSeconds: number } | { ok: false, reason: 'email_failed' }}
 */
export async function sendOtp(kind, accountId, email, displayName) {
  const { otpTable, fk } = kindConfig(kind);
  await ensureOtpTable(kind);

  const [recent] = await sql.unsafe(
    `SELECT EXTRACT(EPOCH FROM (NOW() - created_at)) AS elapsed FROM ${otpTable} WHERE ${fk} = $1 ORDER BY created_at DESC LIMIT 1`,
    [accountId]
  );
  if (recent && Number(recent.elapsed) < OTP_RESEND_COOLDOWN_SECONDS) {
    return { ok: false, reason: 'cooldown', waitSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - Number(recent.elapsed)) };
  }

  await sql.unsafe(`DELETE FROM ${otpTable} WHERE ${fk} = $1`, [accountId]);
  const code = generateOTP();
  await sql.unsafe(
    `INSERT INTO ${otpTable} (${fk}, otp_hash, expires_at) VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)`,
    [accountId, hashOTP(code), String(OTP_EXPIRY_MINUTES)]
  );

  const emailResult = await sendOTPEmail(email, code, displayName);
  if (!emailResult.success) {
    log.error('Failed to send OTP email', { kind, accountId, error: emailResult.error });
    return { ok: false, reason: 'email_failed' };
  }
  return { ok: true };
}

/**
 * Checks a code. Every call that reaches the comparison has already consumed an
 * attempt (atomic UPDATE ... RETURNING), so concurrent guesses cannot exceed the cap.
 * @returns {{ ok: true } | { ok: false, reason: 'none'|'expired'|'locked'|'wrong', remaining?: number }}
 */
export async function verifyOtp(kind, accountId, code) {
  const { otpTable, fk } = kindConfig(kind);
  await ensureOtpTable(kind);

  const [claimed] = await sql.unsafe(`
    UPDATE ${otpTable} SET attempts = COALESCE(attempts, 0) + 1
    WHERE id = (SELECT id FROM ${otpTable} WHERE ${fk} = $1 ORDER BY created_at DESC LIMIT 1)
      AND COALESCE(attempts, 0) < $2
      AND expires_at > NOW()
    RETURNING id, otp_hash, attempts
  `, [accountId, OTP_MAX_ATTEMPTS]);

  if (!claimed) {
    const [latest] = await sql.unsafe(
      `SELECT COALESCE(attempts, 0) AS attempts, (expires_at <= NOW()) AS is_expired FROM ${otpTable} WHERE ${fk} = $1 ORDER BY created_at DESC LIMIT 1`,
      [accountId]
    );
    if (!latest) return { ok: false, reason: 'none' };
    await sql.unsafe(`DELETE FROM ${otpTable} WHERE ${fk} = $1`, [accountId]);
    return { ok: false, reason: latest.is_expired ? 'expired' : 'locked' };
  }

  const given = Buffer.from(hashOTP(code));
  const stored = Buffer.from(String(claimed.otp_hash));
  const matches = given.length === stored.length && crypto.timingSafeEqual(given, stored);
  if (!matches) {
    return { ok: false, reason: 'wrong', remaining: Math.max(0, OTP_MAX_ATTEMPTS - claimed.attempts) };
  }

  await sql.unsafe(`DELETE FROM ${otpTable} WHERE ${fk} = $1`, [accountId]);
  return { ok: true };
}

/** One row per branch per day, kept for the branch activity reports. */
export async function trackBranchDailyLogin(branchId, userId, req) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const [existing] = await sql`
      SELECT id FROM user_logins WHERE branch_id = ${branchId} AND login_date = ${today} LIMIT 1
    `;
    if (!existing) {
      await sql`
        INSERT INTO user_logins (user_id, branch_id, login_date, ip_address, user_agent)
        VALUES (${userId ?? null}, ${branchId}, ${today}, ${String(clientIp(req)).slice(0, 50)}, ${req.get('user-agent') || null})
      `;
    }
  } catch (err) {
    log.warn('Error tracking login', { error: err.message });
  }
}
