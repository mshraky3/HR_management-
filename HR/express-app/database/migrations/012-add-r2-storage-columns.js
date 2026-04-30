/**
 * Migration: Add R2 storage columns
 * 
 * Adds r2_* columns to all tables that store file URLs.
 * These columns store the Cloudflare R2 mirror URL for each file,
 * enabling dual-storage failover between Vercel Blob and R2.
 * 
 * Run with: node database/migrations/012-add-r2-storage-columns.js
 */

import sql from '../../config/database.js';

async function migrate() {
  console.log('Starting migration: Add R2 storage columns...');

  try {
    // 1. employee_documents — mirror of file_path
    console.log('Adding r2_file_path to employee_documents...');
    await sql`
      ALTER TABLE employee_documents
      ADD COLUMN IF NOT EXISTS r2_file_path VARCHAR(500)
    `;
    console.log('✓ employee_documents.r2_file_path added');

    // 2. branch_documents — mirror of file_path
    console.log('Adding r2_file_path to branch_documents...');
    await sql`
      ALTER TABLE branch_documents
      ADD COLUMN IF NOT EXISTS r2_file_path VARCHAR(500)
    `;
    console.log('✓ branch_documents.r2_file_path added');

    // 3. requests — mirror of attachment_url
    console.log('Adding r2_attachment_url to requests...');
    await sql`
      ALTER TABLE requests
      ADD COLUMN IF NOT EXISTS r2_attachment_url VARCHAR(500)
    `;
    console.log('✓ requests.r2_attachment_url added');

    // 4. requests — mirror of response_attachment_url
    console.log('Adding r2_response_attachment_url to requests...');
    await sql`
      ALTER TABLE requests
      ADD COLUMN IF NOT EXISTS r2_response_attachment_url VARCHAR(500)
    `;
    console.log('✓ requests.r2_response_attachment_url added');

    // 5. notifications — mirror of attachment_url
    console.log('Adding r2_attachment_url to notifications...');
    await sql`
      ALTER TABLE notifications
      ADD COLUMN IF NOT EXISTS r2_attachment_url VARCHAR(500)
    `;
    console.log('✓ notifications.r2_attachment_url added');

    // 6. bus_registration_data — mirror of registration_document_url
    console.log('Adding r2_registration_document_url to bus_registration_data...');
    await sql`
      ALTER TABLE bus_registration_data
      ADD COLUMN IF NOT EXISTS r2_registration_document_url VARCHAR(500)
    `;
    console.log('✓ bus_registration_data.r2_registration_document_url added');

    // 7. driver_license_data — mirror of license_document_url
    console.log('Adding r2_license_document_url to driver_license_data...');
    await sql`
      ALTER TABLE driver_license_data
      ADD COLUMN IF NOT EXISTS r2_license_document_url VARCHAR(500)
    `;
    console.log('✓ driver_license_data.r2_license_document_url added');

    // 8. bus_transportation — mirror of lease_contract_document_url
    console.log('Adding r2_lease_contract_document_url to bus_transportation...');
    await sql`
      ALTER TABLE bus_transportation
      ADD COLUMN IF NOT EXISTS r2_lease_contract_document_url VARCHAR(500)
    `;
    console.log('✓ bus_transportation.r2_lease_contract_document_url added');

    console.log('\n✅ Migration complete: All R2 storage columns added successfully');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

// Run migration (standalone only)
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
  migrate();
}
