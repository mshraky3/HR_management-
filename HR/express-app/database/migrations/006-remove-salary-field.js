/**
 * Migration: Remove the 'salary' field from employees table
 * The salary is now calculated as: base_salary + other_allowances
 * Date: 2026-01-31
 */

import sql from '../../config/database.js';
import { log } from '../../utils/logger.js';

export const up = async () => {
    try {
        log.info('Starting migration: Remove salary field from employees table');

        // Check if column exists before dropping
        const checkColumn = await sql`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'employees' AND column_name = 'salary'
    `;

        if (checkColumn.length > 0) {
            await sql`ALTER TABLE employees DROP COLUMN salary`;
            log.info('Successfully dropped salary column from employees table');
        } else {
            log.info('Column salary does not exist, skipping drop');
        }

        log.info('Migration completed: Remove salary field');
    } catch (error) {
        log.error('Migration error:', { error: error.message });
        throw error;
    }
};

export const down = async () => {
    try {
        log.info('Rolling back migration: Remove salary field');

        // Restore the column
        await sql`
      ALTER TABLE employees 
      ADD COLUMN salary DECIMAL(10,2) AFTER base_salary
    `;

        log.info('Successfully restored salary column');
    } catch (error) {
        log.error('Rollback error:', { error: error.message });
        throw error;
    }
};
