/**
 * Migration 007: Add missing schema columns (safe, additive)
 *
 * Adds columns that are used by the app but were missing from base schema in older DBs:
 * - branches: phone_number, email, number_of_employees
 * - branch_documents: document_number, iban_number, bank_name, issue_date, issue_date_hijri, expiry_date_hijri
 *
 * Usage: node database/migrations/007-add-missing-schema-columns.js
 */

import sql from '../../config/database.js';

export async function up() {
  try {
    console.log('=== Starting Migration 007: Add missing schema columns ===');

    // branches
    await sql`
      ALTER TABLE branches
      ADD COLUMN IF NOT EXISTS phone_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS number_of_employees INTEGER
    `;
    console.log('✓ Ensured branches columns exist');

    // branch_documents
    await sql`
      ALTER TABLE branch_documents
      ADD COLUMN IF NOT EXISTS document_number VARCHAR(100),
      ADD COLUMN IF NOT EXISTS iban_number VARCHAR(50),
      ADD COLUMN IF NOT EXISTS bank_name VARCHAR(200),
      ADD COLUMN IF NOT EXISTS issue_date DATE,
      ADD COLUMN IF NOT EXISTS issue_date_hijri VARCHAR(50),
      ADD COLUMN IF NOT EXISTS expiry_date_hijri VARCHAR(50)
    `;
    console.log('✓ Ensured branch_documents columns exist');

    console.log('=== Migration 007 completed successfully ===');
    return { success: true };
  } catch (error) {
    console.error('=== Migration 007 failed ===', { error: error.message, stack: error.stack });
    throw error;
  }
}

export async function down() {
  console.warn('Rollback not supported for migration 007 (additive columns).');
  return { success: false, message: 'Rollback not supported' };
}

// Run migration if called directly
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  up()
    .then((result) => {
      console.log('Migration completed:', result);
      process.exit(result.success ? 0 : 1);
    })
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    })
    .finally(async () => {
      await sql.end();
    });
}

