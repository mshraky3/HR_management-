/**
 * Migration Script: Add data_completion_status column
 * This script adds the data_completion_status column to existing employees table
 * 
 * Run with: node express-app/scripts/add-data-completion-status.js
 */

import { addColumn, executeQuery, sql } from '../db-helpers.js';

async function addDataCompletionStatus() {
  try {
    console.log('Starting migration: Adding data_completion_status column...');
    
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'data_completion_status'
    `;
    
    if (checkColumn.length > 0) {
      console.log('Column data_completion_status already exists. Skipping...');
      return;
    }
    
    // Add the column with default value 'incomplete'
    console.log('Adding data_completion_status column...');
    await addColumn('employees', 'data_completion_status VARCHAR(20) DEFAULT \'incomplete\' CHECK (data_completion_status IN (\'incomplete\', \'complete\'))');
    
    // Create index for better query performance
    console.log('Creating index on data_completion_status...');
    await executeQuery(
      'CREATE INDEX IF NOT EXISTS idx_employees_data_completion_status ON employees(data_completion_status)',
      'Created index on employees.data_completion_status'
    );
    
    console.log('✅ Migration completed successfully!');
    console.log('All existing employees now have data_completion_status set to "incomplete"');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

addDataCompletionStatus();

