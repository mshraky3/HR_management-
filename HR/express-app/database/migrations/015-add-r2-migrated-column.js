/**
 * Migration: Add r2_migrated status column to file-bearing tables
 *
 * Adds `r2_migrated BOOLEAN DEFAULT false` to every table that stores files
 * in dual storage (Vercel Blob + Cloudflare R2). Rows with a populated
 * r2_file_path are marked as already migrated.
 *
 * Run with: node database/migrations/015-add-r2-migrated-column.js
 */

import sql from '../../config/database.js';

const FILE_TABLES = [
    { table: 'employee_documents', r2_col: 'r2_file_path' },
    { table: 'branch_documents', r2_col: 'r2_file_path' },
    { table: 'requests', r2_col: 'r2_attachment_url' },
    { table: 'notifications', r2_col: 'r2_attachment_url' },
    { table: 'bus_registration_data', r2_col: 'r2_registration_document_url' },
    { table: 'driver_license_data', r2_col: 'r2_license_document_url' },
    { table: 'bus_transportation', r2_col: 'r2_lease_contract_document_url' },
];

export async function up(db) {
    for (const { table, r2_col } of FILE_TABLES) {
        // Add column if not already present
        await db.unsafe(`
      ALTER TABLE ${table}
      ADD COLUMN IF NOT EXISTS r2_migrated BOOLEAN DEFAULT false
    `);

        // Mark rows that already have an R2 URL as migrated
        await db.unsafe(`
      UPDATE ${table}
      SET r2_migrated = true
      WHERE ${r2_col} IS NOT NULL AND ${r2_col} <> ''
        AND r2_migrated = false
    `);
    }
}

// Standalone execution
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
    console.log('Running migration 015 standalone...');
    up(sql)
        .then(() => console.log('Migration 015 completed.'))
        .catch(err => { console.error('Migration 015 failed:', err.message); process.exit(1); })
        .finally(() => sql.end());
}
