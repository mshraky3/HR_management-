/**
 * Migration 022: Fix employees.status CHECK constraint
 *
 * `employees_status_check` (defined at table creation in init.js) only allows
 * the generic 'terminated' status. But the employee year-review "leaving" flow
 * (services/employeeTransitionService.js ARCHIVED_STATUSES), the manual
 * PUT /:id/status route (routes/employees.js validStatuses), the archive
 * labels (routes/archive.js), and archiveLifecycleService.js VALID_STATUSES
 * have all used the more specific 'terminated_article_80' /
 * 'terminated_article_77' values for a while — the DB constraint was never
 * updated to match. Any attempt to set one of those two statuses hits a
 * 23514 check-violation (discovered testing the year-review "leaving" path
 * with reason "إنهاء المادة 77"/"إنهاء المادة 80").
 *
 * This widens the constraint to the same status set already treated as valid
 * everywhere else in the app code. 'terminated' is kept alongside the two
 * article-specific values (rather than replaced) in case any existing row
 * still holds the old generic value.
 *
 * Idempotent: drops the constraint before re-adding it, so re-running is a
 * clean no-op.
 *
 * Run with: node database/migrations/022-fix-employee-status-check.js
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_status_check`;
  await db`
    ALTER TABLE employees ADD CONSTRAINT employees_status_check
      CHECK (status IN (
        'active', 'pending',
        'terminated', 'terminated_article_80', 'terminated_article_77',
        'resigned', 'contract_ended', 'non_renewal', 'other'
      ))
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 022 (would silently re-break archiving employees under Article 77/80).');
  return { success: false, message: 'Rollback not supported' };
}

// Standalone execution: node database/migrations/022-fix-employee-status-check.js
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 022 standalone...');
  up(sql)
    .then(() => { console.log('Migration 022 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 022 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
