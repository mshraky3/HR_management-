/**
 * Migration Script: Make employee fields optional
 * This script changes certain employee fields from NOT NULL to nullable
 * to allow creating employees with minimal data (name, ID, nationality only)
 * 
 * Run with: node express-app/scripts/make-employee-fields-optional.js
 */

import { executeQuery, sql } from '../db-helpers.js';

async function makeEmployeeFieldsOptional() {
  try {
    console.log('Starting migration: Making employee fields optional...');
    
    // Check if migration already done by checking if employee_id_number can be null
    const checkColumn = await sql`
      SELECT is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'employee_id_number'
    `;
    
    if (checkColumn.length > 0 && checkColumn[0].is_nullable === 'YES') {
      console.log('Fields already made optional. Skipping...');
      return;
    }
    
    console.log('Making employee_id_number nullable...');
    await executeQuery(
      'ALTER TABLE employees ALTER COLUMN employee_id_number DROP NOT NULL',
      'Made employee_id_number nullable'
    );
    
    console.log('Making occupation nullable...');
    await executeQuery(
      'ALTER TABLE employees ALTER COLUMN occupation DROP NOT NULL',
      'Made occupation nullable'
    );
    
    console.log('Making id_type nullable...');
    await executeQuery(
      'ALTER TABLE employees ALTER COLUMN id_type DROP NOT NULL',
      'Made id_type nullable'
    );
    
    console.log('Making gender nullable...');
    await executeQuery(
      'ALTER TABLE employees ALTER COLUMN gender DROP NOT NULL',
      'Made gender nullable'
    );
    
    // Remove unique constraint from employee_id_number since it can now be null
    // But keep it if it exists (PostgreSQL allows multiple NULLs in UNIQUE columns)
    console.log('✅ Migration completed successfully!');
    console.log('Employee fields are now optional (except name, id_or_residency_number, nationality)');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

makeEmployeeFieldsOptional();

