/**
 * Migration 021: Employee year transition
 *
 * Adds the schema needed for branches to review the previous year's employees
 * and decide who continues into the new academic year:
 *
 *   A. `employee_year_transitions` — one row per (employee, year) recording the
 *      continue/leave decision, the leaving reason, and a snapshot of what data
 *      was missing at decision time.
 *   B. `employee_review_confirmations` — the per-branch "I finished 100% of the
 *      employee updates for this year" record.
 *   C. Backfill `employees.academic_year` for everyone currently active/pending.
 *
 * Why (A) is a separate table rather than columns on `employees`: beneficiaries
 * get a fresh row per term, so their decision can live on the row itself.
 * Employees are ONE row per person, mutated in place across years —
 * `employees.status_change_reason` is a single column the NEXT status change
 * overwrites, so today the reason someone left last year is destroyed the
 * moment this year's transition runs. A per-year table is the only way "why did
 * X leave in 25-26" survives into 26-27 and beyond.
 *
 * Why (C) is here: `Employee.create()` has never populated `academic_year`, and
 * the only other writer (`renewEmployee`) requires documents that have never
 * existed for anyone (see the service/route comments), so it has never
 * successfully run either. Every one of the 687 employees currently has
 * `academic_year IS NULL`. Without backfilling the year for people who are
 * already here, "who was with us in 25-26" is unanswerable and the new review
 * has nothing to compare against.
 *
 * Safety notes:
 *   - `UNIQUE(employee_id, year_label)` on both new tables makes the whole flow
 *     idempotent: deciding or confirming twice is an upsert, not a duplicate.
 *   - Two separate actor columns everywhere (`decided_by_user_id` → users,
 *     `decided_by_branch_id` → branches) because branch managers are rows in
 *     `branches`, not `users`, and must never be written into a users(id) FK.
 *   - The backfill only touches rows that are currently NULL, so it cannot
 *     overwrite anything and is safe to re-run.
 *
 * Idempotent: every statement is guarded (IF NOT EXISTS / pg_constraint
 * lookups), so re-running is a clean no-op.
 *
 * Run with: node database/migrations/021-employee-year-transition.js
 */

import sql from '../../config/database.js';

/** Add a constraint only if a constraint of that name does not already exist. */
const addConstraintIfMissing = async (db, name, ddl) => {
  await db.unsafe(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${name}') THEN
        ${ddl};
      END IF;
    END $$;
  `);
};

export async function up(db = sql) {
  // ==========================================================================
  // A. Per-year employee decision record
  // ==========================================================================
  await db`
    CREATE TABLE IF NOT EXISTS employee_year_transitions (
      id SERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      branch_id   INTEGER NOT NULL REFERENCES branches(id)  ON DELETE CASCADE,
      year_label VARCHAR(20) NOT NULL,
      previous_year_label VARCHAR(20),
      decision VARCHAR(20) NOT NULL,
      leaving_status VARCHAR(50),
      leaving_reason TEXT,
      data_reviewed BOOLEAN NOT NULL DEFAULT false,
      missing_fields JSONB,
      missing_documents JSONB,
      decided_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      decided_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      decided_by_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      decided_by_label VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (employee_id, year_label)
    )
  `;

  await addConstraintIfMissing(
    db,
    'eyt_decision_check',
    `ALTER TABLE employee_year_transitions ADD CONSTRAINT eyt_decision_check
       CHECK (decision IN ('continuing', 'leaving'))`
  );
  await addConstraintIfMissing(
    db,
    'eyt_leaving_needs_status',
    `ALTER TABLE employee_year_transitions ADD CONSTRAINT eyt_leaving_needs_status
       CHECK (decision <> 'leaving' OR leaving_status IS NOT NULL)`
  );

  await db`
    CREATE INDEX IF NOT EXISTS idx_eyt_branch_year
      ON employee_year_transitions (branch_id, year_label)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_eyt_employee
      ON employee_year_transitions (employee_id)
  `;

  // ==========================================================================
  // B. Per-branch confirmation
  // ==========================================================================
  await db`
    CREATE TABLE IF NOT EXISTS employee_review_confirmations (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      year_label VARCHAR(20) NOT NULL,
      previous_year_label VARCHAR(20),
      confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      confirmed_by_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      confirmed_by_label VARCHAR(255),
      confirmation_count INTEGER NOT NULL DEFAULT 1,
      total_continuing INTEGER NOT NULL DEFAULT 0,
      total_leaving INTEGER NOT NULL DEFAULT 0,
      total_new_hires INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (branch_id, year_label)
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_erc_year
      ON employee_review_confirmations (year_label)
  `;

  // ==========================================================================
  // C. Backfill academic_year for everyone currently with us
  // ==========================================================================
  await db`
    UPDATE employees
    SET academic_year = '25-26'
    WHERE academic_year IS NULL
      AND status IN ('active', 'pending')
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 021 (adds tables and backfills data).');
  return { success: false, message: 'Rollback not supported' };
}

// Standalone execution: node database/migrations/021-employee-year-transition.js
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 021 standalone...');
  up(sql)
    .then(() => { console.log('Migration 021 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 021 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
