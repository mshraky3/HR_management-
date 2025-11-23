/**
 * Migration Script: Add document_number and issue_date fields to branch_documents table
 * Adds:
 * - document_number (رقم المستند) - VARCHAR(100)
 * - issue_date (تاريخ الإصدار) - DATE
 */

import { addColumn, sql } from '../db-helpers.js';

async function migrateAddBranchDocumentFields() {
  console.log('Starting branch document fields migration...');

  try {
    const columnsToAdd = [
      { name: 'document_number', definition: 'VARCHAR(100)' },
      { name: 'issue_date', definition: 'DATE' }
    ];

    for (const column of columnsToAdd) {
      // Check if column already exists
      const checkColumn = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'branch_documents' 
        AND column_name = ${column.name}
      `;

      if (checkColumn.length === 0) {
        console.log(`Adding ${column.name} column...`);
        await addColumn('branch_documents', `${column.name} ${column.definition}`);
        console.log(`✅ ${column.name} column added successfully!`);
      } else {
        console.log(`${column.name} column already exists`);
      }
    }

    console.log('✅ Branch document fields migration completed successfully!');
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
  migrateAddBranchDocumentFields()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddBranchDocumentFields;

