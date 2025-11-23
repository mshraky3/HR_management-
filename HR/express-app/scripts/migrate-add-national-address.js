/**
 * Migration Script: Add national_address field to employees table
 * Adds new column: national_address (for employee's national address)
 */

import { addColumn, executeQuery, sql } from '../db-helpers.js';

async function migrateAddNationalAddress() {
  console.log('Starting national_address field migration...');

  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'national_address'
    `;

    if (checkColumn.length === 0) {
      console.log('Adding national_address column...');
      await addColumn('employees', 'national_address VARCHAR(500)');
      console.log('✅ National address field migration completed successfully!');
    } else {
      console.log('national_address column already exists');
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
  migrateAddNationalAddress()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddNationalAddress;

