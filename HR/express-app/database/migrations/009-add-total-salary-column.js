/**
 * Migration 009: Add computed total_salary column to employees table
 *
 * This migration adds a GENERATED ALWAYS AS STORED column that automatically
 * calculates the net salary (total allowances minus deductions) whenever
 * any salary component is inserted or updated.
 *
 * Formula: base_salary + housing_allowance + transportation_allowance + 
 *          end_of_service_allowance + annual_leave_allowance + other_allowances - deductions
 *
 * Benefits:
 * - Prevents human calculation errors
 * - Ensures consistency across all queries
 * - Auto-updates when any component changes
 * - Cannot be directly modified (read-only)
 *
 * Usage: node database/migrations/009-add-total-salary-column.js
 */

import sql from '../../config/database.js';

export async function up() {
    try {
        console.log('=== Starting Migration 009: Add computed total_salary column ===');

        // Check if column already exists
        const existingColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' AND column_name = 'total_salary'
    `;

        if (existingColumn.length > 0) {
            console.log('✓ total_salary column already exists, skipping...');
            return { success: true, message: 'Column already exists' };
        }

        // Add the computed column
        // Using DECIMAL(12,2) to accommodate larger totals
        // COALESCE handles NULL values by treating them as 0
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
        console.log('✓ Added computed total_salary column to employees table');

        // Verify the column was created correctly
        const verification = await sql`
      SELECT id, first_name, second_name, base_salary, housing_allowance, transportation_allowance, 
             end_of_service_allowance, annual_leave_allowance, other_allowances, 
             deductions, total_salary
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

        console.log('=== Migration 009 completed successfully ===');
        return { success: true };
    } catch (error) {
        console.error('=== Migration 009 failed ===', { error: error.message, stack: error.stack });
        throw error;
    }
}

export async function down() {
    try {
        console.log('=== Rolling back Migration 009: Remove total_salary column ===');

        await sql`ALTER TABLE employees DROP COLUMN IF EXISTS total_salary`;
        console.log('✓ Removed total_salary column');

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
