/**
 * Migration Script: Add branch_documents_password column
 * This script adds the branch_documents_password column to existing branches table
 * and sets default password "test" for all existing branches
 * 
 * Run with: node express-app/scripts/add-branch-documents-password.js
 */

import { addColumn, executeQuery, sql } from '../db-helpers.js';

async function addBranchDocumentsPassword() {
  try {
    console.log('Starting migration: Adding branch_documents_password column...');
    
    // Check if column already exists
    const checkColumn = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'branches' 
      AND column_name = 'branch_documents_password'
    `;
    
    if (checkColumn.length > 0) {
      console.log('Column branch_documents_password already exists. Skipping...');
      return;
    }
    
    // Add the column with default value
    console.log('Adding branch_documents_password column...');
    await addColumn('branches', 'branch_documents_password VARCHAR(255) DEFAULT \'test\'');
    
    // Update all existing branches to have password "test" if they don't have one
    console.log('Setting default password "test" for all existing branches...');
    await executeQuery(
      `UPDATE branches SET branch_documents_password = 'test' WHERE branch_documents_password IS NULL`,
      'Set default password for existing branches'
    );
    
    console.log('✅ Migration completed successfully!');
    console.log('All existing branches now have branch_documents_password set to "test"');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during migration:', error);
    process.exit(1);
  }
}

addBranchDocumentsPassword();

