/**
 * Migration Script: Add deductions field to employees table
 * Adds new column: deductions (for deductions, loans, and other deductions)
 */

import { addColumn, executeQuery, sql } from '../db-helpers.js';

async function migrateAddDeductions() {
  console.log('Starting deductions field migration...');

  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'deductions'
    `;

    if (checkColumn.length === 0) {
      console.log('Adding deductions column...');
      await addColumn('employees', 'deductions DECIMAL(10,2)');
      console.log('✅ Deductions field migration completed successfully!');
    } else {
      console.log('deductions column already exists');
    }
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
  migrateAddDeductions()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddDeductions;

