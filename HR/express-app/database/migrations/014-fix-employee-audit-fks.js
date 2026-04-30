/**
 * Migration: Fix employees audit FK columns — created_by/updated_by/status_changed_by
 *
 * The employees table had FOREIGN KEY (created_by/updated_by/status_changed_by)
 * referencing branches(id). These columns are audit fields that should reference
 * users(id). Existing data contains branch IDs which are invalid user references
 * and will be cleared to NULL.
 *
 * Run with: node database/migrations/014-fix-employee-audit-fks.js
 */

import sql from '../../config/database.js';

export async function up(db) {
  // Step 1: Drop NOT NULL constraints so we can clear invalid branch-ID values
  await db.unsafe(`ALTER TABLE employees ALTER COLUMN created_by DROP NOT NULL`);
  await db.unsafe(`ALTER TABLE employees ALTER COLUMN updated_by DROP NOT NULL`);

  // Step 2: Drop old FK constraints (names auto-assigned by Postgres)
  await db.unsafe(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_created_by_fkey`);
  await db.unsafe(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_updated_by_fkey`);
  await db.unsafe(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_status_changed_by_fkey`);

  // Step 3: Clear existing values — they hold branch IDs not user IDs
  await db`UPDATE employees SET created_by = NULL, updated_by = NULL, status_changed_by = NULL`;

  // Step 4: Add new FK constraints referencing users
  await db.unsafe(`
    ALTER TABLE employees
      ADD CONSTRAINT employees_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
      ADD CONSTRAINT employees_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
      ADD CONSTRAINT employees_status_changed_by_fkey FOREIGN KEY (status_changed_by) REFERENCES users(id) ON DELETE SET NULL
  `);
}

// Standalone execution
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  console.log('Running migration 014 standalone...');
  up(sql)
    .then(() => console.log('Migration 014 completed.'))
    .catch(err => { console.error('Migration 014 failed:', err.message); process.exit(1); })
    .finally(() => sql.end());
}
