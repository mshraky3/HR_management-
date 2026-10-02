/**
 * Migration 027: tasks and the new-year deadline
 *
 * - academic_years.review_deadline: the date by which branches should have finished the new-year review.
 *   Optional; when set, the dashboard shows a due date and the head office sees who is overdue.
 * - branch_tasks: tasks the head office assigns to branches (title, due date, link). Tasks the system can
 *   work out from the data (incomplete employees, expiring documents, year review...) are computed on the
 *   fly by services/taskEngine.js and are not stored.
 *
 * Additive and idempotent.
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`ALTER TABLE academic_years ADD COLUMN IF NOT EXISTS review_deadline DATE`;

  await db`
    CREATE TABLE IF NOT EXISTS branch_tasks (
      id SERIAL PRIMARY KEY,
      branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      description TEXT,
      due_date DATE,
      deep_link VARCHAR(255),
      status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'done', 'dismissed')),
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      completed_by_branch BOOLEAN NOT NULL DEFAULT false
    )
  `;
  await db`CREATE INDEX IF NOT EXISTS idx_branch_tasks_branch_status ON branch_tasks (branch_id, status)`;
}

export async function down() {
  console.warn('Rollback not supported for migration 027 (additive).');
  return { success: false, message: 'Rollback not supported' };
}

const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 027 standalone...');
  up(sql)
    .then(() => { console.log('Migration 027 completed.'); process.exit(0); })
    .catch(err => { console.error('Migration 027 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
