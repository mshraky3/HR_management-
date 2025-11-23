/**
 * Migration Script: Make uploaded_by NOT NULL in documents tables
 * Updates employee_documents and branch_documents tables
 */

import sql from '../config/database.js';
import { addColumn, executeQuery } from '../db-helpers.js';

async function migrateUploadedByNotNull() {
  console.log('Starting uploaded_by NOT NULL migration...\n');

  try {
    // Step 1: Update existing NULL values to a default (use branch_id from employee)
    console.log('Step 1: Updating NULL uploaded_by values in employee_documents...');
    const updatedEmployeeDocs = await sql`
      UPDATE employee_documents ed
      SET uploaded_by = (
        SELECT e.branch_id 
        FROM employees e 
        WHERE e.id = ed.employee_id 
        LIMIT 1
      )
      WHERE uploaded_by IS NULL
    `;
    console.log(`  ✅ Updated ${updatedEmployeeDocs.count || 0} employee documents`);

    // Step 2: Update NULL values in branch_documents
    console.log('\nStep 2: Updating NULL uploaded_by values in branch_documents...');
    const updatedBranchDocs = await sql`
      UPDATE branch_documents bd
      SET uploaded_by = bd.branch_id
      WHERE uploaded_by IS NULL
    `;
    console.log(`  ✅ Updated ${updatedBranchDocs.count || 0} branch documents`);

    // Step 3: Drop foreign key constraint on employee_documents.uploaded_by
    console.log('\nStep 3: Dropping foreign key constraint on employee_documents.uploaded_by...');
    try {
      await sql`
        ALTER TABLE employee_documents 
        DROP CONSTRAINT IF EXISTS employee_documents_uploaded_by_fkey
      `;
      console.log('  ✅ Dropped foreign key constraint');
      await executeQuery(
        'SELECT 1',
        'Dropped foreign key constraint on employee_documents.uploaded_by'
      );
    } catch (error) {
      console.log('  ℹ️  Foreign key constraint may not exist:', error.message);
    }

    // Step 4: Drop foreign key constraint on branch_documents.uploaded_by
    console.log('\nStep 4: Dropping foreign key constraint on branch_documents.uploaded_by...');
    try {
      await sql`
        ALTER TABLE branch_documents 
        DROP CONSTRAINT IF EXISTS branch_documents_uploaded_by_fkey
      `;
      console.log('  ✅ Dropped foreign key constraint');
      await executeQuery(
        'SELECT 1',
        'Dropped foreign key constraint on branch_documents.uploaded_by'
      );
    } catch (error) {
      console.log('  ℹ️  Foreign key constraint may not exist:', error.message);
    }

    // Step 5: Alter employee_documents.uploaded_by to NOT NULL
    console.log('\nStep 5: Making employee_documents.uploaded_by NOT NULL...');
    await sql`
      ALTER TABLE employee_documents 
      ALTER COLUMN uploaded_by SET NOT NULL
    `;
    console.log('  ✅ Set uploaded_by to NOT NULL');
    await executeQuery(
      'SELECT 1',
      'Made uploaded_by NOT NULL in employee_documents'
    );

    // Step 6: Alter branch_documents.uploaded_by to NOT NULL
    console.log('\nStep 6: Making branch_documents.uploaded_by NOT NULL...');
    await sql`
      ALTER TABLE branch_documents 
      ALTER COLUMN uploaded_by SET NOT NULL
    `;
    console.log('  ✅ Set uploaded_by to NOT NULL');
    await executeQuery(
      'SELECT 1',
      'Made uploaded_by NOT NULL in branch_documents'
    );

    console.log('\n✅ Migration completed successfully!');
    console.log('\nNote: uploaded_by can now store either user.id or branch.id');
    console.log('Foreign key constraints have been removed to allow this flexibility.');

  } catch (error) {
    console.error('❌ Error during migration:', error);
    throw error;
  }
}

// Run migration if script is executed directly
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const isMainModule = process.argv[1] && process.argv[1].endsWith('migrate-uploaded-by-not-null.js');

if (isMainModule || import.meta.url === `file://${process.argv[1]}`) {
  migrateUploadedByNotNull()
    .then(() => {
      console.log('\n✅ Migration script completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Migration script failed:', error);
      process.exit(1);
    });
}

export default migrateUploadedByNotNull;

