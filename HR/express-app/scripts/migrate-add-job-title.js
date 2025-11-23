/**
 * Migration Script: Add job_title field to employees table
 * Adds: job_title (المسمى الوظيفي) - for all employees
 */

import { addColumn, sql } from '../db-helpers.js';

async function migrateAddJobTitle() {
  console.log('Starting job_title field migration...');

  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'job_title'
    `;

    if (checkColumn.length === 0) {
      console.log('Adding job_title column...');
      await addColumn('employees', 'job_title VARCHAR(200)');
      console.log('✅ job_title column added successfully!');
    } else {
      console.log('job_title column already exists');
    }

    console.log('✅ Job title field migration completed successfully!');
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
  migrateAddJobTitle()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddJobTitle;

