/**
 * Migration Script: Split salary field into detailed salary components
 * Adds new columns: base_salary, housing_allowance, transportation_allowance,
 * end_of_service_allowance, annual_leave_allowance, other_allowances
 */

import { addColumn, executeQuery, sql } from '../db-helpers.js';

async function migrateSalaryFields() {
  console.log('Starting salary fields migration...');

  try {
    // Check if columns already exist
    const checkColumns = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name IN (
        'base_salary', 
        'housing_allowance', 
        'transportation_allowance', 
        'end_of_service_allowance', 
        'annual_leave_allowance', 
        'other_allowances'
      )
    `;

    const existingColumns = checkColumns.map(row => row.column_name);

    // Add base_salary column
    if (!existingColumns.includes('base_salary')) {
      console.log('Adding base_salary column...');
      await addColumn('employees', 'base_salary DECIMAL(10,2)');
    } else {
      console.log('base_salary column already exists');
    }

    // Add housing_allowance column
    if (!existingColumns.includes('housing_allowance')) {
      console.log('Adding housing_allowance column...');
      await addColumn('employees', 'housing_allowance DECIMAL(10,2)');
    } else {
      console.log('housing_allowance column already exists');
    }

    // Add transportation_allowance column
    if (!existingColumns.includes('transportation_allowance')) {
      console.log('Adding transportation_allowance column...');
      await addColumn('employees', 'transportation_allowance DECIMAL(10,2)');
    } else {
      console.log('transportation_allowance column already exists');
    }

    // Add end_of_service_allowance column
    if (!existingColumns.includes('end_of_service_allowance')) {
      console.log('Adding end_of_service_allowance column...');
      await addColumn('employees', 'end_of_service_allowance DECIMAL(10,2)');
    } else {
      console.log('end_of_service_allowance column already exists');
    }

    // Add annual_leave_allowance column
    if (!existingColumns.includes('annual_leave_allowance')) {
      console.log('Adding annual_leave_allowance column...');
      await addColumn('employees', 'annual_leave_allowance DECIMAL(10,2)');
    } else {
      console.log('annual_leave_allowance column already exists');
    }

    // Add other_allowances column
    if (!existingColumns.includes('other_allowances')) {
      console.log('Adding other_allowances column...');
      await addColumn('employees', 'other_allowances DECIMAL(10,2)');
    } else {
      console.log('other_allowances column already exists');
    }

    // Migrate existing salary data to base_salary if salary exists and base_salary is null
    console.log('Migrating existing salary data to base_salary...');
    await executeQuery(
      `UPDATE employees 
       SET base_salary = salary 
       WHERE salary IS NOT NULL 
       AND base_salary IS NULL`,
      'Migrated existing salary values to base_salary'
    );

    console.log('✅ Salary fields migration completed successfully!');
  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
}

// Run migration if script is executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && process.argv[1].endsWith(__filename);

if (isMainModule || import.meta.url === `file://${process.argv[1]}`) {
  migrateSalaryFields()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateSalaryFields;

