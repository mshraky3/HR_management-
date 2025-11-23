/**
 * Migration Script: Add education and passport fields to employees table
 * Adds:
 * - graduation_year (سنة التخرج) - for all employees
 * - university_gpa (المعدل الجامعي) - for all employees
 * - passport_number (رقم جواز السفر) - for non-Saudis
 * - passport_issue_date (تاريخ اصداره) - for non-Saudis
 * - passport_expiry_date (تاريخ انتهائه) - for non-Saudis
 * - passport_issue_place (مكان الإصدار) - for non-Saudis
 * - residency_issue_date (تاريخ اصدار الاقامة) - for non-Saudis
 */

import { addColumn, sql } from '../db-helpers.js';

async function migrateAddEmployeeEducationPassportFields() {
  console.log('Starting employee education and passport fields migration...');

  try {
    const columnsToAdd = [
      { name: 'graduation_year', definition: 'INTEGER' },
      { name: 'university_gpa', definition: 'DECIMAL(4,2)' },
      { name: 'passport_number', definition: 'VARCHAR(100)' },
      { name: 'passport_issue_date', definition: 'DATE' },
      { name: 'passport_expiry_date', definition: 'DATE' },
      { name: 'passport_issue_place', definition: 'VARCHAR(200)' },
      { name: 'residency_issue_date', definition: 'DATE' }
    ];

    for (const column of columnsToAdd) {
      // Check if column already exists
      const checkColumn = await sql`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'employees' 
        AND column_name = ${column.name}
      `;

      if (checkColumn.length === 0) {
        console.log(`Adding ${column.name} column...`);
        await addColumn('employees', `${column.name} ${column.definition}`);
        console.log(`✅ ${column.name} column added successfully!`);
      } else {
        console.log(`${column.name} column already exists`);
      }
    }

    console.log('✅ Employee education and passport fields migration completed successfully!');
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
  migrateAddEmployeeEducationPassportFields()
    .then(() => {
      console.log('Migration completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
}

export default migrateAddEmployeeEducationPassportFields;

