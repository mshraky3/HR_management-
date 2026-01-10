/**
 * Database Helper Functions
 * 
 * Use these functions to perform database operations that will be automatically logged.
 * Import this file and use the functions instead of direct SQL queries.
 * 
 * IMPORTANT: Uses shared database connection from config/database.js to prevent
 * duplicate connection pools that exhaust database connection limits.
 */

// Use shared database connection to prevent duplicate connection pools
import sql from './config/database.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATION_LOG_FILE = path.join(__dirname, 'database_migrations.txt');

// Log database changes to migration file
function logDatabaseChange(action, details, sqlQuery = '') {
  const timestamp = new Date().toISOString();
  let logEntry = `[${timestamp}] - ${action} - ${details}\n`;
  
  if (sqlQuery) {
    logEntry += `SQL Query: ${sqlQuery}\n`;
  }
  
  logEntry += `---\n\n`;
  
  try {
    fs.appendFileSync(MIGRATION_LOG_FILE, logEntry, 'utf8');
    // Removed console.log to suppress logs
  } catch (error) {
    // Silent error handling
  }
}

/**
 * Check if a table exists
 * @param {string} tableName - Name of the table to check
 * @returns {Promise<boolean>} - True if table exists, false otherwise
 */
async function tableExists(tableName) {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = ${tableName}
      );
    `;
    return result[0]?.exists || false;
  } catch (error) {
    return false;
  }
}

/**
 * Check if an index exists
 * @param {string} indexName - Name of the index to check
 * @returns {Promise<boolean>} - True if index exists, false otherwise
 */
async function indexExists(indexName) {
  try {
    const result = await sql`
      SELECT EXISTS (
        SELECT FROM pg_indexes 
        WHERE schemaname = 'public' 
        AND indexname = ${indexName}
      );
    `;
    return result[0]?.exists || false;
  } catch (error) {
    return false;
  }
}

/**
 * Create a new table
 * @param {string} tableName - Name of the table
 * @param {string} columns - Column definitions (e.g., "id SERIAL PRIMARY KEY, name VARCHAR(255)")
 */
export async function createTable(tableName, columns) {
  const exists = await tableExists(tableName);
  
  if (!exists) {
    console.log(`[MISSING TABLE] Table "${tableName}" does not exist`);
    try {
      const sqlQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
      await sql.unsafe(sqlQuery);
      logDatabaseChange('CREATE TABLE', `Created table: ${tableName}`, sqlQuery);
      console.log(`[CREATED TABLE] Table "${tableName}" created successfully`);
      return { success: true, message: `Table ${tableName} created successfully` };
    } catch (error) {
      logDatabaseChange('CREATE TABLE - FAILED', `Failed to create table: ${tableName} - ${error.message}`);
      console.error(`[ERROR] Failed to create table "${tableName}":`, error.message);
      throw error;
    }
  }
  
  // Table exists, no action needed
  return { success: true, message: `Table ${tableName} exists` };
}

/**
 * Add a column to an existing table
 * @param {string} tableName - Name of the table
 * @param {string} columnDefinition - Column definition (e.g., "email VARCHAR(255)")
 */
export async function addColumn(tableName, columnDefinition) {
  const sqlQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`;
  
  try {
    await sql.unsafe(sqlQuery);
    logDatabaseChange('ALTER TABLE - ADD COLUMN', `Added column to table ${tableName}`, sqlQuery);
    return { success: true, message: `Column added to ${tableName} successfully` };
  } catch (error) {
    logDatabaseChange('ALTER TABLE - ADD COLUMN - FAILED', `Failed to add column to ${tableName} - ${error.message}`, sqlQuery);
    throw error;
  }
}

/**
 * Drop a column from a table
 * @param {string} tableName - Name of the table
 * @param {string} columnName - Name of the column to drop
 */
export async function dropColumn(tableName, columnName) {
  const sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${columnName}`;
  
  try {
    await sql.unsafe(sqlQuery);
    logDatabaseChange('ALTER TABLE - DROP COLUMN', `Dropped column ${columnName} from table ${tableName}`, sqlQuery);
    return { success: true, message: `Column ${columnName} dropped from ${tableName} successfully` };
  } catch (error) {
    logDatabaseChange('ALTER TABLE - DROP COLUMN - FAILED', `Failed to drop column from ${tableName} - ${error.message}`, sqlQuery);
    throw error;
  }
}

/**
 * Rename a column in a table
 * @param {string} tableName - Name of the table
 * @param {string} oldColumnName - Current column name
 * @param {string} newColumnName - New column name
 */
export async function renameColumn(tableName, oldColumnName, newColumnName) {
  const sqlQuery = `ALTER TABLE ${tableName} RENAME COLUMN ${oldColumnName} TO ${newColumnName}`;
  
  try {
    await sql.unsafe(sqlQuery);
    logDatabaseChange('ALTER TABLE - RENAME COLUMN', `Renamed column ${oldColumnName} to ${newColumnName} in table ${tableName}`, sqlQuery);
    return { success: true, message: `Column renamed successfully` };
  } catch (error) {
    logDatabaseChange('ALTER TABLE - RENAME COLUMN - FAILED', `Failed to rename column in ${tableName} - ${error.message}`, sqlQuery);
    throw error;
  }
}

/**
 * Drop a table
 * @param {string} tableName - Name of the table to drop
 */
export async function dropTable(tableName) {
  const sqlQuery = `DROP TABLE IF EXISTS ${tableName}`;
  
  try {
    await sql.unsafe(sqlQuery);
    logDatabaseChange('DROP TABLE', `Dropped table: ${tableName}`, sqlQuery);
    return { success: true, message: `Table ${tableName} dropped successfully` };
  } catch (error) {
    logDatabaseChange('DROP TABLE - FAILED', `Failed to drop table: ${tableName} - ${error.message}`, sqlQuery);
    throw error;
  }
}

/**
 * Execute a custom SQL query and log it
 * @param {string} sqlQuery - SQL query to execute
 * @param {string} description - Description of what the query does
 */
export async function executeQuery(sqlQuery, description) {
  // Check if this is a CREATE INDEX query
  const indexMatch = sqlQuery.match(/CREATE\s+INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)/i);
  if (indexMatch) {
    const indexName = indexMatch[1];
    const exists = await indexExists(indexName);
    
    if (!exists) {
      console.log(`[MISSING INDEX] Index "${indexName}" does not exist - ${description}`);
      try {
        await sql.unsafe(sqlQuery);
        logDatabaseChange('CREATE INDEX', description, sqlQuery);
        console.log(`[CREATED INDEX] Index "${indexName}" created successfully`);
        return { success: true, message: `Index ${indexName} created successfully` };
      } catch (error) {
        logDatabaseChange('CREATE INDEX - FAILED', `${description} - ${error.message}`, sqlQuery);
        console.error(`[ERROR] Failed to create index "${indexName}":`, error.message);
        throw error;
      }
    }
    
    // Index exists, no action needed
    return { success: true, data: null };
  }
  
  // For other queries, execute normally but don't log to console
  try {
    const result = await sql.unsafe(sqlQuery);
    logDatabaseChange('CUSTOM QUERY', description, sqlQuery);
    return { success: true, data: result };
  } catch (error) {
    logDatabaseChange('CUSTOM QUERY - FAILED', `${description} - ${error.message}`, sqlQuery);
    throw error;
  }
}

export { sql };

