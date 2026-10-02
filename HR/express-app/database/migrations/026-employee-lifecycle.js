/**
 * Migration 026: employee lifecycle, audit trail and primary-branch integrity
 *
 * - audit_log: who changed what, when (employees, accounts, branches). Branch managers
 *   have no users row, so the actor is stored as (kind, user id | branch id, name).
 * - employee_status_history: every status change with reason, last working day and actor
 *   (employees.status_change_reason only ever kept the latest reason).
 * - employee_notes: free notes on an employee.
 * - employees: last_working_day, exit_notes, rehire_eligible, archived_via_branch_id
 *   (set when a branch is deactivated, so reactivating the branch restores exactly those).
 * - employee_branches: every employee gets a primary link (production had ~160 with none),
 *   at most one primary per employee, and the primary matches employees.branch_id.
 *
 * Additive and idempotent. The only data change is inserting the missing primary links.
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`
    CREATE TABLE IF NOT EXISTS audit_log (
      id BIGSERIAL PRIMARY KEY,
      entity_type VARCHAR(40) NOT NULL,
      entity_id INTEGER,
      action VARCHAR(40) NOT NULL,
      actor_kind VARCHAR(10),
      actor_user_id INTEGER,
      actor_branch_id INTEGER,
      actor_name VARCHAR(255),
      branch_id INTEGER,
      changes JSONB,
      ip_address VARCHAR(64),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log (entity_type, entity_id, created_at DESC)`;
  await db`CREATE INDEX IF NOT EXISTS idx_audit_log_branch ON audit_log (branch_id, created_at DESC)`;

  await db`
    CREATE TABLE IF NOT EXISTS employee_status_history (
      id BIGSERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      from_status VARCHAR(40),
      to_status VARCHAR(40) NOT NULL,
      reason_code VARCHAR(40),
      reason_text TEXT,
      effective_date DATE,
      last_working_day DATE,
      source VARCHAR(40),
      actor_kind VARCHAR(10),
      actor_user_id INTEGER,
      actor_branch_id INTEGER,
      actor_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_employee_status_history_employee ON employee_status_history (employee_id, created_at DESC)`;

  await db`
    CREATE TABLE IF NOT EXISTS employee_notes (
      id BIGSERIAL PRIMARY KEY,
      employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
      note TEXT NOT NULL,
      actor_kind VARCHAR(10),
      actor_user_id INTEGER,
      actor_branch_id INTEGER,
      actor_name VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_employee_notes_employee ON employee_notes (employee_id, created_at DESC)`;

  await db`
    ALTER TABLE employees
      ADD COLUMN IF NOT EXISTS last_working_day DATE,
      ADD COLUMN IF NOT EXISTS exit_notes TEXT,
      ADD COLUMN IF NOT EXISTS rehire_eligible BOOLEAN,
      ADD COLUMN IF NOT EXISTS archived_via_branch_id INTEGER
  `;

  // 1) Every employee with a branch gets a link; the first becomes the primary.
  await db`
    INSERT INTO employee_branches (employee_id, branch_id, is_primary)
    SELECT e.id, e.branch_id, true
    FROM employees e
    WHERE e.branch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM employee_branches eb WHERE eb.employee_id = e.id)
    ON CONFLICT (employee_id, branch_id) DO NOTHING
  `;

  // 2) Employees that have links but none flagged primary: mark the one matching employees.branch_id.
  await db`
    UPDATE employee_branches eb SET is_primary = true
    FROM employees e
    WHERE e.id = eb.employee_id AND eb.branch_id = e.branch_id
      AND NOT EXISTS (SELECT 1 FROM employee_branches p WHERE p.employee_id = eb.employee_id AND p.is_primary)
  `;

  // 3) More than one primary: keep the one equal to employees.branch_id (else the lowest id).
  await db`
    UPDATE employee_branches eb SET is_primary = false
    WHERE eb.is_primary
      AND EXISTS (
        SELECT 1 FROM employee_branches o
        JOIN employees e ON e.id = o.employee_id
        WHERE o.employee_id = eb.employee_id AND o.is_primary AND o.id <> eb.id
          AND (
            (o.branch_id = e.branch_id AND eb.branch_id <> e.branch_id)
            OR (
              (o.branch_id = e.branch_id) = (eb.branch_id = e.branch_id) AND o.id < eb.id
            )
          )
      )
  `;

  await db`
    CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_branches_one_primary
      ON employee_branches (employee_id) WHERE is_primary
  `;
}

export async function down() {
  console.warn('Rollback not supported for migration 026 (additive tables/columns; backfilled links stay).');
  return { success: false, message: 'Rollback not supported' };
}

const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 026 standalone...');
  up(sql)
    .then(() => { console.log('Migration 026 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 026 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
