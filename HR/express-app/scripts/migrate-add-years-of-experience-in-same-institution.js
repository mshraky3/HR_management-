/**
 * Migration Script: Add years_of_experience_in_same_institution field to employees table
 * Adds new column: years_of_experience_in_same_institution (INTEGER) for years of experience within the same institution
 */

import { addColumn, sql } from '../db-helpers.js';

async function migrateAddYearsOfExperienceInSameInstitution() {
  console.log('Starting years_of_experience_in_same_institution field migration...');

  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'years_of_experience_in_same_institution'
    `;

    if (checkColumn.length === 0) {
      console.log('Adding years_of_experience_in_same_institution column...');
      await addColumn('employees', 'years_of_experience_in_same_institution INTEGER DEFAULT 0');
      console.log('✅ Years of experience in same institution field migration completed successfully!');
    } else {
      console.log('years_of_experience_in_same_institution column already exists');
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
  migrateAddYearsOfExperienceInSameInstitution()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddYearsOfExperienceInSameInstitution;

