/**
 * Migration Script: Add IBAN fields to branch_documents table
 * Adds:
 * - iban_number (رقم الآيبان) - VARCHAR(50)
 * - bank_name (اسم البنك) - VARCHAR(200)
 */

import { addColumn, sql } from '../db-helpers.js';

async function migrateAddBranchIbanFields() {
  console.log('Starting branch IBAN fields migration...');

  try {
    const columnsToAdd = [
      { name: 'iban_number', definition: 'VARCHAR(50)' },
      { name: 'bank_name', definition: 'VARCHAR(200)' }
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

    console.log('✅ Branch IBAN fields migration completed successfully!');
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
  migrateAddBranchIbanFields()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddBranchIbanFields;

