/**
 * Database Configuration
 * Centralized database connection setup
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

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
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Increased from 10 to 20 for better concurrency
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
  debug: process.env.NODE_ENV === 'development' ? console.log : undefined,
});

// Test database connection
export async function testConnection() {
  try {
    const result = await sql`SELECT NOW() as current_time`;
    console.log('Database connected successfully:', result[0].current_time);
    return { success: true, timestamp: result[0].current_time };
  } catch (error) {
    console.error('Database connection failed:', error);
    throw error;
  }
}

export default sql;

