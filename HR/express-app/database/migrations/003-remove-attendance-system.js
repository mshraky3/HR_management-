/**
 * Migration 003: Remove Attendance System
 * 
 * This migration drops all attendance-related tables:
 * - attendance_periods
 * - attendance_records
 * - branch_period_status
 * 
 * WARNING: This will permanently delete all attendance data.
 * Make sure you have a database backup before running this migration.
 * 
 * Usage: node database/migrations/003-remove-attendance-system.js
 */

import sql from '../../config/database.js';
import { log } from '../../utils/logger.js';

export async function up() {
  try {
    log.warn('=== Starting Attendance System Removal ===');
    log.warn('This will permanently delete all attendance data!');
    
    // Drop tables in correct order to handle foreign key constraints
    // 1. Drop branch_period_status first (has foreign keys to attendance_periods)
    log.info('Dropping branch_period_status table...');
    await sql`DROP TABLE IF EXISTS branch_period_status CASCADE`;
    log.info('✓ Dropped branch_period_status table');
    
    // 2. Drop attendance_records (has foreign keys to attendance_periods)
    log.info('Dropping attendance_records table...');
    await sql`DROP TABLE IF EXISTS attendance_records CASCADE`;
    log.info('✓ Dropped attendance_records table');
    
    // 3. Drop attendance_periods last
    log.info('Dropping attendance_periods table...');
    await sql`DROP TABLE IF EXISTS attendance_periods CASCADE`;
    log.info('✓ Dropped attendance_periods table');
    
    log.info('=== Attendance System Removal Completed Successfully ===');
    return { success: true, message: 'All attendance tables dropped successfully' };
  } catch (error) {
    log.error('=== Attendance System Removal Failed ===', { error: error.message, stack: error.stack });
    throw error;
  }
}

export async function down() {
  log.warn('Rollback not supported for attendance system removal.');
  log.warn('To restore attendance system, you would need to re-run the original migration scripts.');
  return { success: false, message: 'Rollback not supported' };
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  up()
    .then(result => {
      console.log('Migration completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch(error => {
      console.error('Migration failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await sql.end();
    });
}
