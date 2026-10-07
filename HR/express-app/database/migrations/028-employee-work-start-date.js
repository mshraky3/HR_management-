/**
 * Migration 028: employee work start date
 *
 * The first day the employee began working (distinct from the contract dates, which change on renewal).
 * Optional: existing employees keep it empty and it does not affect data completeness.
 *
 * Additive and idempotent.
 */

import sql from '../../config/database.js';

export async function up(db = sql) {
  await db`ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_start_date_hijri VARCHAR(50)`;
  await db`ALTER TABLE employees ADD COLUMN IF NOT EXISTS work_start_date_gregorian DATE`;
}

export async function down() {
  console.warn('Rollback not supported for migration 028 (additive).');
  return { success: false, message: 'Rollback not supported' };
}
