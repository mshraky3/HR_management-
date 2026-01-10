/**
 * Migration: Add contract date columns to employees table
 * 
 * This migration adds the following columns to the employees table:
 * - contract_start_date_hijri VARCHAR(50)
 * - contract_start_date_gregorian DATE
 * - contract_end_date_hijri VARCHAR(50)
 * - contract_end_date_gregorian DATE
 */

import sql from '../config/database.js';
import { addColumn } from '../db-helpers.js';
import { log } from '../utils/logger.js';

async function checkColumnExists(tableName, columnName) {
  try {
    const result = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = ${tableName} AND column_name = ${columnName}
    `;
    return result && result.length > 0;
  } catch (error) {
    return false;
  }
}

export async function addContractDateColumns() {
  try {
    log.info('Starting migration: Add contract date columns to employees table');

    const columnsToAdd = [
      { name: 'contract_start_date_hijri', definition: 'contract_start_date_hijri VARCHAR(50)' },
      { name: 'contract_start_date_gregorian', definition: 'contract_start_date_gregorian DATE' },
      { name: 'contract_end_date_hijri', definition: 'contract_end_date_hijri VARCHAR(50)' },
      { name: 'contract_end_date_gregorian', definition: 'contract_end_date_gregorian DATE' }
    ];

    for (const column of columnsToAdd) {
      const exists = await checkColumnExists('employees', column.name);
      
      if (!exists) {
        log.info(`Adding column: ${column.name}`);
        await addColumn('employees', column.definition);
        log.info(`Successfully added column: ${column.name}`);
      } else {
        log.info(`Column ${column.name} already exists, skipping`);
      }
    }

    log.info('Migration completed successfully');
    return { success: true, message: 'Contract date columns added successfully' };
  } catch (error) {
    log.error('Migration failed', { error: error.message });
    throw error;
  }
}

// Run migration if called directly
addContractDateColumns()
  .then(() => {
    console.log('Migration completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
