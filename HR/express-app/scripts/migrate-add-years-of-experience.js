/**
 * Migration Script: Add years_of_experience_in_company field to employees table
 * Adds new column: years_of_experience_in_company (INTEGER) for years of experience within the same company
 */

import { addColumn, executeQuery, sql } from '../db-helpers.js';

async function migrateAddYearsOfExperience() {
  console.log('Starting years_of_experience_in_company field migration...');

  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'years_of_experience_in_company'
    `;

    if (checkColumn.length === 0) {
      console.log('Adding years_of_experience_in_company column...');
      await addColumn('employees', 'years_of_experience_in_company INTEGER DEFAULT 0');
      console.log('✅ Years of experience in company field migration completed successfully!');
    } else {
      console.log('years_of_experience_in_company column already exists');
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
  migrateAddYearsOfExperience()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddYearsOfExperience;

