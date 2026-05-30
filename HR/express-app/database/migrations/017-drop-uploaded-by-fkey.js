/**
 * Migration: Drop employee_documents_uploaded_by_fkey constraint
 *
 * The uploaded_by column stores the ID of whoever uploaded the document.
 * This can be either a user ID (managers) or a branch ID (branch managers),
 * since branch managers are stored in the branches table, not users.
 *
 * The FK constraint employee_documents_uploaded_by_fkey incorrectly requires
 * uploaded_by to reference users(id), causing inserts to fail when a branch
 * manager (whose ID exists only in branches) uploads a document.
 *
 * Run with: node database/migrations/017-drop-uploaded-by-fkey.js
 */

import sql from '../../config/database.js';

export async function up(db) {
    await db.unsafe(`ALTER TABLE employee_documents DROP CONSTRAINT IF EXISTS employee_documents_uploaded_by_fkey`);
}

// Standalone execution
const isMain = process.argv[1] && import.meta.url.includes(process.argv[1].split('\\').join('/').split('/').pop());
if (isMain) {
    console.log('Running migration 017 standalone...');
    up(sql)
        .then(() => console.log('Migration 017 completed.'))
        .catch(err => { console.error('Migration 017 failed:', err.message); process.exit(1); })
        .finally(() => sql.end());
}
