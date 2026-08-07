/**
 * Migration 024: Widen beneficiaries.age CHECK constraint from 50 to 60
 *
 * `beneficiaries_age_check` (defined at table creation in init.js) capped age
 * at 50. That cap is fine for a single term but breaks the year rollover: a
 * beneficiary who is 50 in 25-26 and continues into 26-27 is 51, and there was
 * no way to record that. The UI's age dropdown stopped at 50 too, so the branch
 * could only leave the stale value in place — quietly wrong data — while a
 * direct API call hit a 23514 check-violation.
 *
 * These are care centres serving adults as well as children, so 60 is the new
 * ceiling: it clears the current maximum (50) with room for several more
 * rollovers before this needs revisiting.
 *
 * Idempotent: drops the constraint before re-adding it, so re-running is a
 * clean no-op. Widening only — no existing row can violate the new bound.
 *
 * Run with: node database/migrations/024-widen-beneficiary-age-check.js
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`ALTER TABLE beneficiaries DROP CONSTRAINT IF EXISTS beneficiaries_age_check`;
  await db`
    ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_age_check
      CHECK (age BETWEEN 1 AND 60)
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 024 (would reject beneficiaries already recorded above age 50).');
  return { success: false, message: 'Rollback not supported' };
}

// Standalone execution: node database/migrations/024-widen-beneficiary-age-check.js
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 024 standalone...');
  up(sql)
    .then(() => { console.log('Migration 024 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 024 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
