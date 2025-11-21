/**
 * Database Helper Functions
 * 
 * Use these functions to perform database operations that will be automatically logged.
 * Import this file and use the functions instead of direct SQL queries.
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MIGRATION_LOG_FILE = path.join(__dirname, 'database_migrations.txt');

// Database connection
const sql = postgres({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: 'require',
});

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
    console.log(`Database change logged: ${action} - ${details}`);
  } catch (error) {
    console.error('Error writing to migration log:', error);
  }
}

/**
 * Create a new table
 * @param {string} tableName - Name of the table
 * @param {string} columns - Column definitions (e.g., "id SERIAL PRIMARY KEY, name VARCHAR(255)")
 */
export async function createTable(tableName, columns) {
  const sqlQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columns})`;
  
  try {
    await sql.unsafe(sqlQuery);
    logDatabaseChange('CREATE TABLE', `Created table: ${tableName}`, sqlQuery);
    return { success: true, message: `Table ${tableName} created successfully` };
  } catch (error) {
    logDatabaseChange('CREATE TABLE - FAILED', `Failed to create table: ${tableName} - ${error.message}`, sqlQuery);
    throw error;
  }
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

