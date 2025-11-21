/**
 * Database Configuration
 * Centralized database connection setup
 */

import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

// Database connection configuration
const sql = postgres({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: 'require',
  max: 10, // Maximum number of connections
  idle_timeout: 20, // Close idle connections after 20 seconds
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

