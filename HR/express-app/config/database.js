/**
 * Database Configuration
 * Centralized database connection setup
 */

import postgres from 'postgres';
import dotenv from 'dotenv';
import { log } from '../utils/logger.js';

dotenv.config();

// Database connection configuration
// Performance Optimization: Improved Connection Pooling
const sql = postgres({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: 'require',
  // Connection Pool Optimization
  // Performance Optimization: Increased from 20 to 50 to support parallel query execution
  // With 20 branches × 9 parallel queries = 180 concurrent queries, pool of 50 handles this efficiently
  max: parseInt(process.env.DB_POOL_MAX || '50', 10), // Increased from 20 to 50 for parallel query support
  idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || '30', 10), // Increased from 20 to 30 seconds
  connect_timeout: 10, // Connection timeout in seconds
  // Performance settings
  max_lifetime: 60 * 30, // Close connections after 30 minutes (prevent stale connections)
  transform: {
    // Optimize query result transformation
    undefined: null, // Convert undefined to null for consistency
  },
  // Connection retry settings
  onnotice: () => {}, // Suppress PostgreSQL notices in production
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

