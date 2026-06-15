/**
 * Migration 018: Add missing employee columns (safe, additive)
 *
 * These columns are actively written/read by models/Employee.js
 * (Employee.create() / Employee.update()) and the reports feature
 * (routes/reports.js, routes/employee-file.js), but they are absent from the
 * `employees` CREATE TABLE in database/init.js. They exist in the production
 * (Koyeb) database via historical migrations that are no longer present in this
 * repo (numbered migrations start at 003; database_migrations.txt was deleted).
 *
 * A database freshly built from this repo alone would therefore lack them,
 * causing "column does not exist" errors on employee creation and reports.
 *
 * All columns are VARCHAR, matching how the app stores them:
 *   - init.js (note near line ~1118) documents passport_issue_date,
 *     passport_expiry_date, residency_issue_date and graduation_year as VARCHAR
 *     strings (NOT DATE).
 *   - job_title is treated as free text (e.g. NULLIF(job_title, '') in
 *     routes/reports.js) and falls back to occupation VARCHAR(100).
 *   - passport_number / passport_issue_place / university_gpa are inserted raw
 *     by Employee.create() with no numeric coercion, so VARCHAR is the safe,
 *     permissive type (a non-numeric GPA like "ممتاز" must not break inserts).
 * Lengths mirror comparable existing employees columns.
 *
 * Idempotent: uses ADD COLUMN IF NOT EXISTS, so it is a no-op on the production
 * database where these columns already exist. It does not modify any data.
 *
 * Run with: node database/migrations/018-add-missing-employee-columns.js
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS job_title VARCHAR(200),
      ADD COLUMN IF NOT EXISTS passport_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS passport_issue_date VARCHAR(50),
      ADD COLUMN IF NOT EXISTS passport_expiry_date VARCHAR(50),
      ADD COLUMN IF NOT EXISTS passport_issue_place VARCHAR(200),
      ADD COLUMN IF NOT EXISTS residency_issue_date VARCHAR(50),
      ADD COLUMN IF NOT EXISTS graduation_year VARCHAR(50),
      ADD COLUMN IF NOT EXISTS university_gpa VARCHAR(50)
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 018 (additive columns).');
  return { success: false, message: 'Rollback not supported' };
}

// Standalone execution: node database/migrations/018-add-missing-employee-columns.js
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 018 standalone...');
  up(sql)
    .then(() => { console.log('Migration 018 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 018 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
