/**
 * Migration Script: Add phone_number field to users table
 * Adds:
 * - phone_number (رقم الجوال) - VARCHAR(50)
 */

import { addColumn, sql } from '../db-helpers.js';

async function migrateAddUsersPhoneNumber() {
  console.log('Starting users phone_number migration...');

  try {
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      AND column_name = 'phone_number'
    `;

    if (checkColumn.length === 0) {
      console.log('Adding phone_number column...');
      await addColumn('users', 'phone_number VARCHAR(50)');
      console.log('✅ phone_number column added successfully!');
    } else {
      console.log('phone_number column already exists');
    }

    console.log('✅ Users phone_number migration completed successfully!');
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
  migrateAddUsersPhoneNumber()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddUsersPhoneNumber;

