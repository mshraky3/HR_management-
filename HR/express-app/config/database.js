/**
 * Database Configuration
 * Centralized database connection setup
 */

import postgres from "postgres";
import dotenv from "dotenv";
import { log } from "../utils/logger.js";

dotenv.config();

// Database connection configuration
// Supports both DATABASE_URL (Vercel/Heroku) and individual variables (local dev)
let sql;

if (process.env.DATABASE_URL) {
  // Use DATABASE_URL if available (Vercel, Heroku, etc.)
  log.info("Connecting to database using DATABASE_URL");
  sql = postgres(process.env.DATABASE_URL, {
    ssl: "require",
    // Reduced default pool size for serverless (Vercel) compatibility
    // Neon free tier: 10 connections, Vercel serverless: best with 5-10
    max: parseInt(process.env.DB_POOL_MAX || "8", 10),
    idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || "20", 10),
    connect_timeout: 10,
    // Neon auto-suspends idle connections after ~5 min; keep max_lifetime below that
    max_lifetime: 60 * 4,
    transform: {
      undefined: null,
    },
    onnotice: () => { },
    debug:
      process.env.LOG_DB_QUERIES === "true"
        ? (connection, query) =>
          log.debug("DB Query", { query: query?.substring?.(0, 100) })
        : undefined,
  });
} else {
  // Use individual environment variables for local development
  log.info("Connecting to database using individual environment variables");

  // Validate required database environment variables
  const requiredDbVars = [
    "DATABASE_HOST",
    "DATABASE_NAME",
    "DATABASE_USER",
    "DATABASE_PASSWORD",
  ];
  const missingDbVars = requiredDbVars.filter(
    (varName) => !process.env[varName],
  );

  if (missingDbVars.length > 0) {
    log.warn(
      `Missing database environment variables: ${missingDbVars.join(", ")}. Database operations will fail.`,
    );
  }

  sql = postgres({
    host: process.env.DATABASE_HOST || "",
    database: process.env.DATABASE_NAME || "",
    username: process.env.DATABASE_USER || "",
    password: process.env.DATABASE_PASSWORD || "",
    ssl: "require",
    // Reduced default pool size for serverless (Vercel) compatibility
    max: parseInt(process.env.DB_POOL_MAX || "8", 10),
    idle_timeout: parseInt(process.env.DB_IDLE_TIMEOUT || "20", 10),
    connect_timeout: 10,
    // Neon auto-suspends idle connections after ~5 min; keep max_lifetime below that
    max_lifetime: 60 * 4,
    transform: {
      undefined: null,
    },
    onnotice: () => { },
    debug:
      process.env.LOG_DB_QUERIES === "true"
        ? (connection, query) =>
          log.debug("DB Query", { query: query?.substring?.(0, 100) })
        : undefined,
  });
}

// Test database connection
export async function testConnection() {
  try {
    const result = await sql`SELECT NOW() as current_time`;
    log.info("Database connected successfully", {
      timestamp: result[0].current_time,
    });
    return { success: true, timestamp: result[0].current_time };
  } catch (error) {
    log.error("Database connection failed", { error: error.message });
    throw error;
  }
}

export default sql;
