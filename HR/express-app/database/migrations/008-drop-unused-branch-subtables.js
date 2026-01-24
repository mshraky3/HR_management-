/**
 * Migration 008: Drop unused branch subtables (DESTRUCTIVE)
 *
 * Drops tables that are not used by the application:
 * - schools
 * - healthcare_centers
 *
 * WARNING: This is destructive. Take a DB backup before running.
 *
 * Usage: node database/migrations/008-drop-unused-branch-subtables.js
 */

import sql from '../../config/database.js';

export async function up() {
  try {
    console.log('=== Starting Migration 008: Drop unused branch subtables ===');
    console.warn('WARNING: This migration is destructive. Ensure you have a backup.');

    await sql`DROP TABLE IF EXISTS schools CASCADE`;
    console.log('✓ Dropped schools (if existed)');

    await sql`DROP TABLE IF EXISTS healthcare_centers CASCADE`;
    console.log('✓ Dropped healthcare_centers (if existed)');

    console.log('=== Migration 008 completed successfully ===');
    return { success: true };
  } catch (error) {
    console.error('=== Migration 008 failed ===', { error: error.message, stack: error.stack });
    throw error;
  }
}

export async function down() {
  console.warn('Rollback not supported for migration 008.');
  return { success: false, message: 'Rollback not supported' };
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  up()
    .then((result) => {
      console.log('Migration completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await sql.end();
    });
}

