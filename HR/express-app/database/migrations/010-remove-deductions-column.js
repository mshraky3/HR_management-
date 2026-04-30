/**
 * Migration 010: Remove unused deductions column and simplify total_salary
 *
 * The deductions column was never used (all values = 0).
 * This migration removes it and updates the total_salary computed column.
 *
 * New formula: base_salary + housing_allowance + transportation_allowance + 
 *              end_of_service_allowance + annual_leave_allowance + other_allowances
 *
 * Salary components:
 * - الراتب الأساسي (base_salary)
 * - بدل السكن (housing_allowance)
 * - بدل النقل (transportation_allowance)
 * - بدل نهاية الخدمة (end_of_service_allowance)
 * - بدل الإجازة السنوية (annual_leave_allowance)
 * - بدلات أخرى (other_allowances)
 * - إجمالي الراتب (total_salary) - auto-calculated
 *
 * Usage: node database/migrations/010-remove-deductions-column.js
 */

import sql from '../../config/database.js';

export async function up() {
    try {
        console.log('=== Starting Migration 010: Remove deductions column ===');

        // Check if deductions column exists before doing anything
        const colCheck = await sql`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'employees' AND column_name = 'deductions'
    `;

        if (colCheck.length === 0) {
            console.log('✓ deductions column already removed — skipping migration');
            return { success: true };
        }

        // Check if any employees have non-zero deductions
        const check = await sql`
      SELECT COUNT(*) as count FROM employees WHERE deductions > 0
    `;

        if (check[0].count > 0) {
            console.log(`⚠️  WARNING: ${check[0].count} employees have non-zero deductions!`);
            console.log('Migration aborted to prevent data loss.');
            return { success: false, message: 'Employees with deductions found' };
        }

        console.log('✓ Verified: No employees have deductions > 0');

        // Drop the total_salary computed column first (it depends on deductions)
        await sql`ALTER TABLE employees DROP COLUMN IF EXISTS total_salary`;
        console.log('✓ Dropped old total_salary computed column');

        // Drop the deductions column
        await sql`ALTER TABLE employees DROP COLUMN IF EXISTS deductions`;
        console.log('✓ Dropped deductions column');

        // Re-create total_salary as a computed column without deductions
        await sql`
      ALTER TABLE employees 
      ADD COLUMN total_salary DECIMAL(12,2) 
      GENERATED ALWAYS AS (
        COALESCE(base_salary, 0) + 
        COALESCE(housing_allowance, 0) + 
        COALESCE(transportation_allowance, 0) + 
        COALESCE(end_of_service_allowance, 0) + 
        COALESCE(annual_leave_allowance, 0) + 
        COALESCE(other_allowances, 0)
      ) STORED
    `;
        console.log('✓ Created new total_salary computed column (without deductions)');

        // Verify the column was created correctly
        const verification = await sql`
      SELECT id, first_name, second_name, base_salary, total_salary
      FROM employees 
      LIMIT 3
    `;

        if (verification.length > 0) {
            console.log('✓ Verification - Sample employee salaries:');
            verification.forEach(emp => {
                const fullName = `${emp.first_name || ''} ${emp.second_name || ''}`.trim();
                console.log(`  - ${fullName}: base=${emp.base_salary}, total_salary=${emp.total_salary}`);
            });
        }

        console.log('=== Migration 010 completed successfully ===');
        return { success: true };
    } catch (error) {
        console.error('=== Migration 010 failed ===', { error: error.message, stack: error.stack });
        throw error;
    }
}

export async function down() {
    try {
        console.log('=== Rolling back Migration 010: Restore deductions column ===');

        // Drop the new total_salary column
        await sql`ALTER TABLE employees DROP COLUMN IF EXISTS total_salary`;
        console.log('✓ Dropped total_salary column');

        // Re-add deductions column
        await sql`ALTER TABLE employees ADD COLUMN IF NOT EXISTS deductions DECIMAL(10,2) DEFAULT 0`;
        console.log('✓ Re-added deductions column');

        // Re-create total_salary with deductions
        await sql`
      ALTER TABLE employees 
      ADD COLUMN total_salary DECIMAL(12,2) 
      GENERATED ALWAYS AS (
        COALESCE(base_salary, 0) + 
        COALESCE(housing_allowance, 0) + 
        COALESCE(transportation_allowance, 0) + 
        COALESCE(end_of_service_allowance, 0) + 
        COALESCE(annual_leave_allowance, 0) + 
        COALESCE(other_allowances, 0) -
        COALESCE(deductions, 0)
      ) STORED
    `;
        console.log('✓ Re-created total_salary with deductions');

        console.log('=== Rollback completed successfully ===');
        return { success: true };
    } catch (error) {
        console.error('=== Rollback failed ===', { error: error.message, stack: error.stack });
        throw error;
    }
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
        });
}
