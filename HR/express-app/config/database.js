/**
 * Database Configuration
 * Centralized database connection setup
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { log } from '../utils/logger.js';

dotenv.config();

// Validate required database environment variables
const requiredDbVars = ['DATABASE_HOST', 'DATABASE_NAME', 'DATABASE_USER', 'DATABASE_PASSWORD'];
const missingDbVars = requiredDbVars.filter(varName => !process.env[varName]);

if (missingDbVars.length > 0) {
  log.warn(`Missing database environment variables: ${missingDbVars.join(', ')}. Database operations will fail.`);
  // Don't throw - allow server to start but database operations will fail gracefully
}

// Database connection configuration
// Performance Optimization: Improved Connection Pooling
const sql = postgres({
  host: process.env.DATABASE_HOST || '',
  database: process.env.DATABASE_NAME || '',
  username: process.env.DATABASE_USER || '',
  password: process.env.DATABASE_PASSWORD || '',
  ssl: 'require',
  // Connection Pool Optimization
  // Reduced from 50 to 25 to prevent exhausting database connection limits
  // The postgres library efficiently reuses connections, so 25 is sufficient for parallel queries
  // Single shared pool is used across all code (routes, models, db-helpers, migrations)
  max: parseInt(process.env.DB_POOL_MAX || '25', 10), // Reduced from 50 to 25 to prevent connection exhaustion
  idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30', 10), // Increased from 20 to 30 seconds
  connect_timeout: 10, // Connection timeout in seconds
  // Performance settings
  max_lifetime: 60 * 30, // Close connections after 30 minutes (prevent stale connections)
  transform: {
    // Optimize query result transformation
    undefined: null, // Convert undefined to null for consistency
  },
  // Connection retry settings
  onnotice: () => { }, // Suppress PostgreSQL notices in production
  debug: process.env.LOG_DB_QUERIES === 'true' ? (connection, query) => log.debug('DB Query', { query: query?.substring?.(0, 100) }) : undefined,
});

// Test database connection
export async function testConnection() {
  try {
    const result = await sql`SELECT NOW() as current_time`;
    log.info('Database connected successfully', { timestamp: result[0].current_time });
    return { success: true, timestamp: result[0].current_time };
  } catch (error) {
    log.error('Database connection failed', { error: error.message });
    throw error;
  }
}

export default sql;

