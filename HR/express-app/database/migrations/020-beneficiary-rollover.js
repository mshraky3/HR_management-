/**
 * Migration 020: New-year beneficiary rollover
 *
 * Adds the schema needed for branches to review last year's beneficiaries and
 * carry them into the new academic year:
 *
 *   A. Continuity columns on `beneficiaries` — the per-beneficiary
 *      continue / don't-continue decision, and the link from a carried row back
 *      to the row it came from.
 *   B. `beneficiary_review_confirmations` — the per-branch "I finished 100% of
 *      the beneficiary updates for this term" record.
 *   C. Term-scoping of the bus registration / driver licence unique keys.
 *
 * Why (C) is here: `bus_registration_data.registration_number`,
 * `.chassis_number` and `driver_license_data.license_number` were GLOBALLY
 * unique. A bus is a physical vehicle that is re-registered every term, and
 * `bus_transportation` rows are term-scoped, so those constraints made it
 * impossible to have the same vehicle in two terms — carrying buses into the
 * new year hit 23505 every time. Scoping the uniqueness to the term is the fix.
 *
 * Safety notes:
 *   - The `term_id` backfill cannot leave NULLs: `bus_id` is NOT NULL with a
 *     CASCADE FK, so every child row has exactly one parent bus to read from.
 *   - The new composite uniques are strictly WEAKER than the global ones they
 *     replace, so existing data cannot violate them.
 *   - Dropping a UNIQUE constraint drops only its backing index; the separate
 *     non-unique lookup indexes created in init.js survive untouched.
 *   - `carry_review_status` defaults to 'reviewed' on purpose: every row that
 *     already exists, and every row created through the normal add form, is
 *     "already reviewed". Only rows the rollover explicitly inserts as
 *     'pending' demand a branch's attention — no retroactive backlog.
 *   - Two separate actor columns (`continuity_decided_by` → users,
 *     `continuity_decided_by_branch_id` → branches) because branch managers are
 *     rows in `branches`, not `users`, and must never be written into a
 *     users(id) FK.
 *
 * Idempotent: every statement is guarded (IF NOT EXISTS / pg_constraint
 * lookups), so re-running is a clean no-op.
 *
 * Run with: node database/migrations/020-beneficiary-rollover.js
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
  // A. Continuity columns on beneficiaries
  // ==========================================================================
  await db`
    ALTER TABLE beneficiaries
      ADD COLUMN IF NOT EXISTS continuity_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS non_continuation_reason TEXT,
      ADD COLUMN IF NOT EXISTS continuity_decided_at TIMESTAMP,
      ADD COLUMN IF NOT EXISTS continuity_decided_by INTEGER,
      ADD COLUMN IF NOT EXISTS continuity_decided_by_branch_id INTEGER,
      ADD COLUMN IF NOT EXISTS carried_from_beneficiary_id INTEGER,
      ADD COLUMN IF NOT EXISTS carry_review_status VARCHAR(20) NOT NULL DEFAULT 'reviewed'
  `;

  await addConstraintIfMissing(
    db,
    'beneficiaries_continuity_status_check',
    `ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_continuity_status_check
       CHECK (continuity_status IS NULL OR continuity_status IN ('continuing', 'not_continuing'))`
  );
  await addConstraintIfMissing(
    db,
    'beneficiaries_carry_review_status_check',
    `ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_carry_review_status_check
       CHECK (carry_review_status IN ('pending', 'reviewed'))`
  );
  await addConstraintIfMissing(
    db,
    'beneficiaries_continuity_decided_by_fkey',
    `ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_continuity_decided_by_fkey
       FOREIGN KEY (continuity_decided_by) REFERENCES users(id) ON DELETE SET NULL`
  );
  await addConstraintIfMissing(
    db,
    'beneficiaries_continuity_branch_fkey',
    `ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_continuity_branch_fkey
       FOREIGN KEY (continuity_decided_by_branch_id) REFERENCES branches(id) ON DELETE SET NULL`
  );
  await addConstraintIfMissing(
    db,
    'beneficiaries_carried_from_fkey',
    `ALTER TABLE beneficiaries ADD CONSTRAINT beneficiaries_carried_from_fkey
       FOREIGN KEY (carried_from_beneficiary_id) REFERENCES beneficiaries(id) ON DELETE SET NULL`
  );

  // One target row per source row — this partial unique index is the
  // idempotency backbone that makes re-running the review safe.
  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_beneficiaries_carried_from_unique
      ON beneficiaries (carried_from_beneficiary_id)
      WHERE carried_from_beneficiary_id IS NOT NULL
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_beneficiaries_continuity
      ON beneficiaries (branch_id, term_id, continuity_status)
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_beneficiaries_carry_review
      ON beneficiaries (branch_id, term_id)
      WHERE carry_review_status = 'pending'
  `;

  // ==========================================================================
  // B. Per-branch confirmation record
  // ==========================================================================
  await db`
    CREATE TABLE IF NOT EXISTS beneficiary_review_confirmations (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      term_id INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
      source_term_id INTEGER REFERENCES terms(id) ON DELETE SET NULL,
      confirmed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      confirmed_by_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      confirmed_by_branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
      confirmed_by_label VARCHAR(255),
      confirmation_count INTEGER NOT NULL DEFAULT 1,
      total_continuing INTEGER NOT NULL DEFAULT 0,
      total_not_continuing INTEGER NOT NULL DEFAULT 0,
      total_new INTEGER NOT NULL DEFAULT 0,
      note TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (branch_id, term_id)
    )
  `;
  await db`
    CREATE INDEX IF NOT EXISTS idx_beneficiary_review_confirmations_term
      ON beneficiary_review_confirmations (term_id)
  `;

  // ==========================================================================
  // C. Term-scope the bus registration / driver licence unique keys
  // ==========================================================================
  await db`ALTER TABLE bus_registration_data ADD COLUMN IF NOT EXISTS term_id INTEGER`;
  await db`
    UPDATE bus_registration_data brd
       SET term_id = bt.term_id
      FROM bus_transportation bt
     WHERE bt.id = brd.bus_id
       AND brd.term_id IS DISTINCT FROM bt.term_id
  `;
  await db`ALTER TABLE bus_registration_data ALTER COLUMN term_id SET NOT NULL`;
  await addConstraintIfMissing(
    db,
    'bus_registration_data_term_fkey',
    `ALTER TABLE bus_registration_data ADD CONSTRAINT bus_registration_data_term_fkey
       FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE RESTRICT`
  );
  await db`ALTER TABLE bus_registration_data DROP CONSTRAINT IF EXISTS bus_registration_data_registration_number_key`;
  await db`ALTER TABLE bus_registration_data DROP CONSTRAINT IF EXISTS bus_registration_data_chassis_number_key`;
  await addConstraintIfMissing(
    db,
    'bus_registration_data_term_registration_unique',
    `ALTER TABLE bus_registration_data ADD CONSTRAINT bus_registration_data_term_registration_unique
       UNIQUE (term_id, registration_number)`
  );
  await addConstraintIfMissing(
    db,
    'bus_registration_data_term_chassis_unique',
    `ALTER TABLE bus_registration_data ADD CONSTRAINT bus_registration_data_term_chassis_unique
       UNIQUE (term_id, chassis_number)`
  );

  await db`ALTER TABLE driver_license_data ADD COLUMN IF NOT EXISTS term_id INTEGER`;
  await db`
    UPDATE driver_license_data dld
       SET term_id = bt.term_id
      FROM bus_transportation bt
     WHERE bt.id = dld.bus_id
       AND dld.term_id IS DISTINCT FROM bt.term_id
  `;
  await db`ALTER TABLE driver_license_data ALTER COLUMN term_id SET NOT NULL`;
  await addConstraintIfMissing(
    db,
    'driver_license_data_term_fkey',
    `ALTER TABLE driver_license_data ADD CONSTRAINT driver_license_data_term_fkey
       FOREIGN KEY (term_id) REFERENCES terms(id) ON DELETE RESTRICT`
  );
  await db`ALTER TABLE driver_license_data DROP CONSTRAINT IF EXISTS driver_license_data_license_number_key`;
  await addConstraintIfMissing(
    db,
    'driver_license_data_term_license_unique',
    `ALTER TABLE driver_license_data ADD CONSTRAINT driver_license_data_term_license_unique
       UNIQUE (term_id, license_number)`
  );
}

export async function down() {
  console.warn('Rollback not supported for migration 020 (drops unique constraints and adds data columns).');
  return { success: false, message: 'Rollback not supported' };
}

// Standalone execution: node database/migrations/020-beneficiary-rollover.js
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 020 standalone...');
  up(sql)
    .then(() => { console.log('Migration 020 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 020 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
