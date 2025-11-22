/**
 * Migration Script: Make date_of_birth_gregorian nullable
 * This script removes the NOT NULL constraint from date_of_birth_gregorian
 * to allow null values when using Hijri dates
 */

import { executeQuery, sql } from '../db-helpers.js';

async function migrateDateOfBirthGregorianNullable() {
  try {
    console.log('Starting migration: Making date_of_birth_gregorian nullable...');
    
    // Remove NOT NULL constraint from date_of_birth_gregorian
    console.log('Removing NOT NULL constraint from date_of_birth_gregorian...');
    await executeQuery(
      `ALTER TABLE employees ALTER COLUMN date_of_birth_gregorian DROP NOT NULL`,
      'Removed NOT NULL constraint from date_of_birth_gregorian'
    );
    
    console.log('Migration completed successfully!');
    console.log('date_of_birth_gregorian is now nullable and can be null when using Hijri dates.');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
migrateDateOfBirthGregorianNullable()
  .then(() => {
    console.log('Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export default migrateDateOfBirthGregorianNullable;

