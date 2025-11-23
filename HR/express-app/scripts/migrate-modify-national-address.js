/**
 * Migration Script: Modify national_address field to VARCHAR(8)
 * Changes column from VARCHAR(500) to VARCHAR(8) for unified national address (short format)
 */

import { executeQuery, sql } from '../db-helpers.js';

async function migrateModifyNationalAddress() {
  console.log('Starting national_address field modification...');

  try {
    // Check current column definition
    const checkColumn = await sql`
      SELECT column_name, character_maximum_length
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      AND column_name = 'national_address'
    `;

    if (checkColumn.length === 0) {
      console.log('national_address column does not exist, creating it...');
      await executeQuery(
        'ALTER TABLE employees ADD COLUMN national_address VARCHAR(8)',
        'Added national_address column as VARCHAR(8)'
      );
    } else {
      const currentLength = checkColumn[0].character_maximum_length;
      if (currentLength !== 8) {
        console.log(`Modifying national_address from VARCHAR(${currentLength}) to VARCHAR(8)...`);
        // First, truncate any existing values longer than 8 characters
        await executeQuery(
          `UPDATE employees SET national_address = LEFT(national_address, 8) WHERE LENGTH(national_address) > 8`,
          'Truncated existing national_address values to 8 characters'
        );
        // Then alter the column
        await executeQuery(
          'ALTER TABLE employees ALTER COLUMN national_address TYPE VARCHAR(8)',
          'Modified national_address column to VARCHAR(8)'
        );
        console.log('✅ National address field modification completed successfully!');
      } else {
        console.log('national_address column already has correct length (8)');
      }
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
  migrateModifyNationalAddress()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateModifyNationalAddress;

