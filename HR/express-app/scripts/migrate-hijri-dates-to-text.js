/**
 * Migration Script: Convert Hijri Date Columns from DATE to VARCHAR
 * This script changes date_of_birth_hijri and id_expiry_date_hijri 
 * from DATE type to VARCHAR(50) to store dates as text in dd/mm/yyyy format
 */

import { executeQuery, sql } from '../db-helpers.js';

async function migrateHijriDatesToText() {
  try {
    console.log('Starting migration: Converting Hijri date columns from DATE to VARCHAR...');
    
    // Step 1: Add temporary columns
    console.log('Step 1: Adding temporary VARCHAR columns...');
    await executeQuery(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS date_of_birth_hijri_temp VARCHAR(50)`,
      'Added temporary column date_of_birth_hijri_temp'
    );
    
    await executeQuery(
      `ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_expiry_date_hijri_temp VARCHAR(50)`,
      'Added temporary column id_expiry_date_hijri_temp'
    );
    
    // Step 2: Copy existing data (convert DATE to text format if needed)
    console.log('Step 2: Copying existing data...');
    await executeQuery(
      `UPDATE employees 
       SET date_of_birth_hijri_temp = CASE 
         WHEN date_of_birth_hijri IS NOT NULL 
         THEN TO_CHAR(date_of_birth_hijri, 'DD/MM/YYYY')
         ELSE NULL 
       END`,
      'Copied date_of_birth_hijri data to temporary column'
    );
    
    await executeQuery(
      `UPDATE employees 
       SET id_expiry_date_hijri_temp = CASE 
         WHEN id_expiry_date_hijri IS NOT NULL 
         THEN TO_CHAR(id_expiry_date_hijri, 'DD/MM/YYYY')
         ELSE NULL 
       END`,
      'Copied id_expiry_date_hijri data to temporary column'
    );
    
    // Step 3: Drop old DATE columns
    console.log('Step 3: Dropping old DATE columns...');
    await executeQuery(
      `ALTER TABLE employees DROP COLUMN IF EXISTS date_of_birth_hijri`,
      'Dropped old date_of_birth_hijri DATE column'
    );
    
    await executeQuery(
      `ALTER TABLE employees DROP COLUMN IF EXISTS id_expiry_date_hijri`,
      'Dropped old id_expiry_date_hijri DATE column'
    );
    
    // Step 4: Rename temporary columns to original names
    console.log('Step 4: Renaming temporary columns...');
    await executeQuery(
      `ALTER TABLE employees RENAME COLUMN date_of_birth_hijri_temp TO date_of_birth_hijri`,
      'Renamed date_of_birth_hijri_temp to date_of_birth_hijri'
    );
    
    await executeQuery(
      `ALTER TABLE employees RENAME COLUMN id_expiry_date_hijri_temp TO id_expiry_date_hijri`,
      'Renamed id_expiry_date_hijri_temp to id_expiry_date_hijri'
    );
    
    console.log('Migration completed successfully!');
    console.log('Hijri date columns are now VARCHAR(50) and can store dates as text in dd/mm/yyyy format.');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
migrateHijriDatesToText()
  .then(() => {
    console.log('Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export default migrateHijriDatesToText;

