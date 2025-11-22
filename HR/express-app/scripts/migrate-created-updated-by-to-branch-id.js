/**
 * Migration Script: Change created_by and updated_by to use branch_id
 * This script:
 * 1. Updates existing records to use branch_id instead of user.id
 * 2. Changes foreign key constraint from users(id) to branches(id)
 * 3. Makes created_by and updated_by NOT NULL
 */

import { executeQuery, sql } from '../db-helpers.js';

async function migrateCreatedUpdatedByToBranchId() {
  try {
    console.log('Starting migration: Changing created_by and updated_by to use branch_id...');
    
    // Step 1: Drop old foreign key constraints first
    console.log('Step 1: Dropping old foreign key constraints...');
    try {
      await executeQuery(
        `ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_created_by_fkey`,
        'Dropped old foreign key constraint for created_by'
      );
    } catch (error) {
      console.log('Note: Foreign key constraint may not exist:', error.message);
    }
    
    try {
      await executeQuery(
        `ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_updated_by_fkey`,
        'Dropped old foreign key constraint for updated_by'
      );
    } catch (error) {
      console.log('Note: Foreign key constraint may not exist:', error.message);
    }
    
    // Step 2: Update existing records - set created_by to branch_id
    console.log('Step 2: Updating existing records...');
    await executeQuery(
      `UPDATE employees 
       SET created_by = branch_id 
       WHERE created_by IS NULL OR created_by NOT IN (SELECT id FROM branches)`,
      'Updated existing created_by values to use branch_id'
    );
    
    // Step 3: Update existing records - set updated_by to branch_id
    await executeQuery(
      `UPDATE employees 
       SET updated_by = COALESCE(branch_id, created_by) 
       WHERE updated_by IS NULL OR updated_by NOT IN (SELECT id FROM branches)`,
      'Updated existing updated_by values to use branch_id'
    );
    
    // Step 4: Add NOT NULL constraints
    console.log('Step 4: Adding NOT NULL constraints...');
    await executeQuery(
      `ALTER TABLE employees ALTER COLUMN created_by SET NOT NULL`,
      'Added NOT NULL constraint to created_by'
    );
    
    await executeQuery(
      `ALTER TABLE employees ALTER COLUMN updated_by SET NOT NULL`,
      'Added NOT NULL constraint to updated_by'
    );
    
    // Step 5: Add new foreign key constraints to branches
    console.log('Step 5: Adding new foreign key constraints to branches...');
    await executeQuery(
      `ALTER TABLE employees 
       ADD CONSTRAINT employees_created_by_fkey 
       FOREIGN KEY (created_by) REFERENCES branches(id) ON DELETE RESTRICT`,
      'Added foreign key constraint for created_by to branches'
    );
    
    await executeQuery(
      `ALTER TABLE employees 
       ADD CONSTRAINT employees_updated_by_fkey 
       FOREIGN KEY (updated_by) REFERENCES branches(id) ON DELETE RESTRICT`,
      'Added foreign key constraint for updated_by to branches'
    );
    
    console.log('Migration completed successfully!');
    console.log('created_by and updated_by now use branch_id and are NOT NULL.');
    
  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  }
}

// Run migration if this file is executed directly
migrateCreatedUpdatedByToBranchId()
  .then(() => {
    console.log('Migration complete!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

export default migrateCreatedUpdatedByToBranchId;

