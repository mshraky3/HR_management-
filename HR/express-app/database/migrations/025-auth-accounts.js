/**
 * Migration 025: login hardening + account lifecycle columns
 *
 * - users / branches: failed_attempts + locked_until (login lockout),
 *   last_login_at (shown in account management), token_version (bump to sign
 *   an account out everywhere), must_change_password (temporary passwords).
 * - login_events: one row per login / OTP outcome so the head office can see
 *   who logged in and when (user_logins only keeps one row per branch per day).
 *
 * Additive and idempotent: safe to run twice, and old code ignores the columns.
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  for (const table of ['users', 'branches']) {
    await db.unsafe(`
      ALTER TABLE ${table}
        ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS token_version INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS must_change_password BOOLEAN NOT NULL DEFAULT false
    `);
  }

  await db`
    CREATE TABLE IF NOT EXISTS login_events (
      id BIGSERIAL PRIMARY KEY,
      account_kind VARCHAR(10) NOT NULL CHECK (account_kind IN ('user', 'branch')),
      account_id INTEGER,
      username VARCHAR(255),
      event VARCHAR(30) NOT NULL,
      ip_address VARCHAR(64),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_login_events_account ON login_events (account_kind, account_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_login_events_created ON login_events (created_at DESC)`;

  // Last sign-in of existing accounts, from the per-day records the app already kept (user_logins).
  await db`
    UPDATE branches b SET last_login_at = x.last_seen
    FROM (
      SELECT branch_id, MAX(COALESCE(login_time, login_date::timestamp)) AS last_seen
      FROM user_logins WHERE branch_id IS NOT NULL GROUP BY branch_id
    ) x
    WHERE x.branch_id = b.id AND b.last_login_at IS NULL
  `;
  await db`
    UPDATE users u SET last_login_at = x.last_seen
    FROM (
      SELECT user_id, MAX(COALESCE(login_time, login_date::timestamp)) AS last_seen
      FROM user_logins WHERE user_id IS NOT NULL GROUP BY user_id
    ) x
    WHERE x.user_id = u.id AND u.last_login_at IS NULL
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 025 (additive columns/table; leave in place).');
  return { success: false, message: 'Rollback not supported' };
}

const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 025 standalone...');
  up(sql)
    .then(() => { console.log('Migration 025 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 025 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
