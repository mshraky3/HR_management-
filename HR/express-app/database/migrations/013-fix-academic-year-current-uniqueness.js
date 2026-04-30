/**
 * Migration: Fix academic_years is_current uniqueness
 *
 * Adds a partial unique index so only one academic year per branch_type
 * can have is_current = true at a time. Prevents non-deterministic results
 * in AcademicYear.getCurrentYear() when multiple rows match.
 *
 * Run with: node database/migrations/013-fix-academic-year-current-uniqueness.js
 */

import sql from '../../config/database.js';

export async function up(db) {
  // Remove any duplicate is_current = true rows first (keep the most recent year_start)
  await db`
    UPDATE academic_years
    SET is_current = false
    WHERE id IN (
      SELECT id FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY branch_type ORDER BY year_start DESC) AS rn
        FROM academic_years
        WHERE is_current = true
      ) ranked
      WHERE rn > 1
    )
  `;

  // Add partial unique index: only one row per branch_type may have is_current = true
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_academic_years_one_current_per_type
    ON academic_years (branch_type)
    WHERE is_current = true
  `;
}

// Standalone execution
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 013 standalone...');
  up(sql)
    .then(() => console.log('Migration 013 completed.'))
    .catch(err => { console.error('Migration 013 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
