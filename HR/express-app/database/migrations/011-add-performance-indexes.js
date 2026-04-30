/**
 * Migration: Add Performance Indexes
 * 
 * This migration adds composite indexes to improve query performance and reduce
 * database costs on serverless platforms (Vercel/Neon).
 * 
 * These indexes are specifically chosen to optimize the most frequently executed queries:
 * - Employee listing filtered by status and branch
 * - Notification filtering by active status and expiry
 * - Document lookups by employee and active status
 * 
 * Run with: node database/migrations/011-add-performance-indexes.js
 */

import sql from '../../config/database.js';

async function migrate() {
  console.log('Starting migration: Add performance indexes...');

  try {
    // Index 1: employees(status, branch_id)
    // Used by: Employee listing, statistics, filtering by branch
    // Covers WHERE status IN ('active', 'pending') AND branch_id = X
    console.log('Creating index: idx_employees_status_branch...');
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_status_branch 
      ON employees(status, branch_id)
      WHERE status IN ('active', 'pending')
    `;
    console.log('✓ idx_employees_status_branch created');

    // Index 2: notifications(is_active, expires_at)
    // Used by: Notification queries that filter by active and check expiry
    // Covers WHERE is_active = true AND (expires_at IS NULL OR expires_at >= NOW())
    console.log('Creating index: idx_notifications_active_expires...');
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notifications_active_expires 
      ON notifications(is_active, expires_at)
      WHERE is_active = true
    `;
    console.log('✓ idx_notifications_active_expires created');

    // Index 3: employee_documents(employee_id, is_active)
    // Used by: Document listing for employees, document counts
    // Covers WHERE employee_id = X AND is_active = true
    console.log('Creating index: idx_employee_documents_emp_active...');
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employee_documents_emp_active 
      ON employee_documents(employee_id, is_active)
      WHERE is_active = true
    `;
    console.log('✓ idx_employee_documents_emp_active created');

    // Index 4: notification_branches(branch_id, notification_id)
    // Used by: Fetching notifications for a branch
    // Covers JOINs between notifications and notification_branches
    console.log('Creating index: idx_notification_branches_branch...');
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notification_branches_branch 
      ON notification_branches(branch_id, notification_id)
    `;
    console.log('✓ idx_notification_branches_branch created');

    // Index 5: employees(employee_id_number)
    // Used by: Duplicate detection, employee lookup by ID number
    // Already has unique constraint, but partial index for active employees is helpful
    console.log('Creating index: idx_employees_id_number_active...');
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_employees_id_number_active 
      ON employees(employee_id_number)
      WHERE status IN ('active', 'pending')
    `;
    console.log('✓ idx_employees_id_number_active created');

    // Index 6: user_logins(branch_id, login_date)
    // Used by: Branch statistics, login tracking
    // Covers WHERE branch_id = X AND login_date >= Y
    console.log('Creating index: idx_user_logins_branch_date...');
    await sql`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_logins_branch_date 
      ON user_logins(branch_id, login_date DESC)
    `;
    console.log('✓ idx_user_logins_branch_date created');

    console.log('\n✅ Migration completed successfully!');
    console.log('\nIndexes created:');
    console.log('  - idx_employees_status_branch');
    console.log('  - idx_notifications_active_expires');
    console.log('  - idx_employee_documents_emp_active');
    console.log('  - idx_notification_branches_branch');
    console.log('  - idx_employees_id_number_active');
    console.log('  - idx_user_logins_branch_date');

  } catch (error) {
    console.error('Migration failed:', error.message);
    throw error;
  } finally {
    await sql.end();
  }
}

// Run migration (standalone only)
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  migrate().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
