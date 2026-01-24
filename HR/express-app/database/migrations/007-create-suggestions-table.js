/**
 * Migration: Create suggestions table
 * This migration creates the suggestions table for branch feedback/suggestions system
 */

import sql from '../../config/database.js';

export async function up() {
    console.log('Running migration: Create suggestions table...');

    try {
        // Create suggestions table
        await sql`
      CREATE TABLE IF NOT EXISTS suggestions (
        id SERIAL PRIMARY KEY,
        branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        suggestion_text TEXT NOT NULL,
        importance_level VARCHAR(50) NOT NULL DEFAULT 'useful',
        status VARCHAR(50) NOT NULL DEFAULT 'pending',
        admin_notes TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      )
    `;
        console.log('✓ Created suggestions table');

        // Create index for faster queries
        await sql`
      CREATE INDEX IF NOT EXISTS idx_suggestions_branch_id ON suggestions(branch_id)
    `;
        console.log('✓ Created index on branch_id');

        await sql`
      CREATE INDEX IF NOT EXISTS idx_suggestions_importance_level ON suggestions(importance_level)
    `;
        console.log('✓ Created index on importance_level');

        await sql`
      CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status)
    `;
        console.log('✓ Created index on status');

        console.log('Migration completed successfully!');
    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    }
}

export async function down() {
    console.log('Reverting migration: Drop suggestions table...');

    try {
        await sql`DROP TABLE IF EXISTS suggestions CASCADE`;
        console.log('✓ Dropped suggestions table');
        console.log('Revert completed successfully!');
    } catch (error) {
        console.error('Revert failed:', error);
        throw error;
    }
}
