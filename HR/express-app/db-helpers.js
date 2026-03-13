/**
 * Database helper utilities for table creation and query execution
 */
import sql from './config/database.js';

export { sql };

export async function createTable(tableName, columns) {
    try {
        await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`);
        console.log(`✓ Table ${tableName} ready`);
    } catch (error) {
        console.error(`✗ Error creating table ${tableName}:`, error.message);
        throw error;
    }
}

export async function executeQuery(query, successMessage) {
    try {
        await sql.unsafe(query);
        if (successMessage) console.log(`  ✓ ${successMessage}`);
    } catch (error) {
        // Ignore "already exists" errors for indexes/constraints
        if (error.message?.includes('already exists')) return;
        console.error(`  ✗ Query error: ${error.message}`);
    }
}
