/**
 * Migration: Drop leftover old-named employee audit FK constraints
 *
 * Migration 014 tried to drop FK constraints named with the Postgres default
 * pattern (employees_*_fkey) but the actual constraints were created manually
 * with the prefix pattern (fk_employees_*). The DROP IF EXISTS silently
 * did nothing, leaving both old and new FKs on the same columns.
 *
 * This migration drops the old fk_employees_* constraints so that
 * status_changed_by / created_by / updated_by only reference users(id).
 *
 * Run with: node database/migrations/016-drop-old-employee-audit-fks.js
 */

import sql from '../../config/database.js';

export async function up(db) {
    await db.unsafe(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS fk_employees_created_by`);
    await db.unsafe(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS fk_employees_updated_by`);
    await db.unsafe(`ALTER TABLE employees DROP CONSTRAINT IF EXISTS fk_employees_status_changed_by`);
}

// Standalone execution
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
    console.log('Running migration 016 standalone...');
    up(sql)
        .then(() => console.log('Migration 016 completed.'))
        .catch(err => { console.error('Migration 016 failed:', err.message); process.exit(1); })
        .finally(() => sql.end());
}
