/**
 * Migration: Remove branch_documents_password column
 * This migration removes the branch_documents_password column from the branches table
 * as the feature is no longer needed.
 */

import { sql } from '../../db-helpers.js';

export async function up() {
    console.log('Running migration: Remove branch_documents_password column...');

    try {
        // Check if column exists before dropping
        const columnExists = await sql`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'branches' 
      AND column_name = 'branch_documents_password'
    `;

        if (columnExists.length > 0) {
            await sql`ALTER TABLE branches DROP COLUMN branch_documents_password`;
            console.log('✓ Dropped branch_documents_password column from branches table');
        } else {
            console.log('Column branch_documents_password does not exist, skipping...');
        }

        return true;
    } catch (error) {
        console.error('Migration failed:', error.message);
        throw error;
    }
}

export async function down() {
    console.log('Reverting migration: Re-add branch_documents_password column...');

    try {
        await sql`
      ALTER TABLE branches 
      ADD COLUMN branch_documents_password VARCHAR(255) DEFAULT 'test'
    `;
        console.log('✓ Re-added branch_documents_password column to branches table');

        return true;
    } catch (error) {
        console.error('Migration revert failed:', error.message);
        throw error;
    }
}
