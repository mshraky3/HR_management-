import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { fileURLToPath } from 'url';
import path from 'path';
import { createHash } from 'crypto';
import { readFileSync, readdirSync } from 'fs';

// Import routes and middleware
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { optionalAuth } from './middleware/auth.js';
import { resolveRequestScope } from './middleware/requestScope.js';
import sql, { testConnection } from './config/database.js';
import logger, { httpLogger, log } from './utils/logger.js';
import { initializeDailyAlerts } from './utils/dailyAlerts.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
// Performance Optimization: Response Compression (Gzip)
// Reduces response size by 60-80% for JSON/text responses
app.use(compression({
  filter: (req, res) => {
    // Compress all responses except if explicitly disabled
    if (req.headers['x-no-compression']) {
      return false;
    }
    // Use compression for all text-based responses
    return compression.filter(req, res);
  },
  level: 6, // Balance between compression ratio and CPU usage (1-9, 6 is optimal)
  threshold: 1024, // Only compress responses larger than 1KB
}));

// CORS - allow all origins (needed for multiple frontends)
app.use(cors({
  origin: true, // reflects the request origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Branch-Documents-Password', 'x-branch-documents-password'],
  credentials: true,
  optionsSuccessStatus: 204
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware using structured logger
app.use(httpLogger);

// Test database connection on startup
async function testDbConnection() {
  try {
    await testConnection();
  } catch (error) {
    log.warn('Database connection test failed', { error: error.message });
    log.info('Server will start, but database operations may fail');
  }
}

// Test Blob Storage configuration on startup
async function testBlobStorage() {
  try {
    const { isBlobStorageConfigured } = await import('./utils/blobStorage.js');
    if (isBlobStorageConfigured()) {
      log.info('Blob Storage is configured');
    } else {
      log.warn('Blob Storage is not configured - file uploads will not work. Please set BLOB_READ_WRITE_TOKEN');
    }
  } catch (error) {
    log.warn('Could not check Blob Storage configuration', { error: error.message });
  }
}

// Initialize HRM database tables
async function initDatabase() {
  try {
    // Import and run database initialization
    const { initializeDatabase } = await import('./database/init.js');
    await initializeDatabase();
    log.info('HRM database tables initialized successfully');
    return true;
  } catch (error) {
    log.error('Error initializing database', { error: error.message });
    // Don't exit - allow server to start even if tables already exist
    return false;
  }
}

// initializeDatabase() is ~2,000 lines of idempotent DDL, and this file runs it
// on every cold start - many times a day on Vercel, all billed as Active CPU.
// Nothing in it changes unless the code does, so a fingerprint of the files
// that define the schema gates all of it behind a single SELECT. The fingerprint
// also carries the week number: a run that half-failed silently (executeQuery
// only logs) is retried within a week instead of never.
async function schemaFingerprint() {
  const hash = createHash('sha1');
  for (const rel of ['./database/init.js', './db-helpers.js']) {
    hash.update(readFileSync(new URL(rel, import.meta.url)));
  }
  const migrationsDir = new URL('./database/migrations/', import.meta.url);
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.js')).sort()) {
    hash.update(file);
    hash.update(readFileSync(new URL(file, migrationsDir)));
  }
  const week = Math.floor(Date.now() / (7 * 24 * 60 * 60 * 1000));
  return `${hash.digest('hex')}:${week}`;
}

async function ensureSchemaCurrent() {
  let fingerprint = null;
  try {
    fingerprint = await schemaFingerprint();
    const [row] = await sql`SELECT fingerprint FROM schema_fingerprint WHERE id = 1`.catch(() => []);
    if (row?.fingerprint === fingerprint && process.env.FORCE_DB_INIT !== 'true') {
      log.info('Schema unchanged since last init - skipping DDL and migrations');
      return;
    }
  } catch (error) {
    // Fail open: if the check itself breaks, do exactly what this used to do.
    log.warn('Schema fingerprint check failed, running full init', { error: error.message });
    fingerprint = null;
  }

  const tablesOk = await initDatabase();

  let migrationsOk = false;
  try {
    const { runMigrations } = await import('./database/migrationRunner.js');
    await runMigrations();
    migrationsOk = true;
    log.info('Database migrations applied successfully');
  } catch (error) {
    log.warn('Migration runner had issues', { error: error.message });
  }

  // Only remember a run that fully succeeded, so a failure is retried next time.
  if (fingerprint && tablesOk && migrationsOk) {
    try {
      await sql`CREATE TABLE IF NOT EXISTS schema_fingerprint (
        id INT PRIMARY KEY,
        fingerprint TEXT NOT NULL,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`;
      await sql`INSERT INTO schema_fingerprint (id, fingerprint) VALUES (1, ${fingerprint})
        ON CONFLICT (id) DO UPDATE SET fingerprint = EXCLUDED.fingerprint, applied_at = NOW()`;
    } catch (error) {
      log.warn('Could not record schema fingerprint', { error: error.message });
    }
  }
}


// Initialize database and test connection on startup
// Note: On Vercel serverless, this runs on cold start
// Database initialization is idempotent (safe to run multiple times)
async function startup() {
  try {
    await testDbConnection();
  } catch (error) {
    // Don't block startup if DB test fails - connection will be retried on first request
    log.warn('Database connection test failed on startup, will retry on first request');
  }

  try {
    await testBlobStorage();
  } catch (error) {
    // Don't block startup if Blob Storage test fails
    log.warn('Blob Storage test failed on startup');
  }

  // Initialize database tables (idempotent - safe to run multiple times)
  // Only run if not in Vercel or if explicitly enabled
  // On Vercel, tables should already exist, but this ensures they're created if needed
  if (process.env.INIT_DB_ON_STARTUP !== 'false') {
    await ensureSchemaCurrent();
  }

  // Initialize daily alerts for main manager
  try {
    initializeDailyAlerts();
    log.info('Daily alerts initialized - will check at 8:00 AM');
  } catch (error) {
    log.warn('Failed to initialize daily alerts', { error: error.message });
  }
}

// Run startup asynchronously (don't block server start)
startup().catch(err => {
  log.error('Startup error', { error: err.message });
});

// Performance Optimization: Add caching headers for static data
// Reduced cache times for better data freshness, especially for dashboard data
app.use('/api', (req, res, next) => {
  // Add cache headers for GET requests (except sensitive data)
  if (req.method === 'GET' && !req.path.includes('/auth') && !req.path.includes('/me')) {
    // Dashboard-related endpoints - NO CACHE (must always be fresh)
    if (req.path.includes('/branch-statistics') ||
      req.path.includes('/notifications')) {
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } else if (req.path.includes('/employees')) {
      // Employee data - very short cache (5 seconds)
      res.set('Cache-Control', 'private, max-age=5');
    } else if (req.path.includes('/documents') || req.path.includes('/branch-documents')) {
      // Documents - very short cache (5 seconds)
      res.set('Cache-Control', 'private, max-age=5');
    } else if (req.path.includes('/branches') || req.path.includes('/terms') || req.path.includes('/academic-years')) {
      // Static data - reduced from 5 minutes to 10 seconds
      res.set('Cache-Control', 'private, max-age=10');
    } else {
      // Other GET requests - very short cache (5 seconds)
      res.set('Cache-Control', 'private, max-age=5');
    }
  }
  next();
});

// Handle incorrect /me requests (should be /api/auth/me)
app.get('/me', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Endpoint not found. Use /api/auth/me instead.',
    correctEndpoint: '/api/auth/me'
  });
});

// API Routes
app.use('/api', resolveRequestScope);
app.use('/api', apiRoutes);

// Root endpoint (no authentication required, but accepts optional auth for logging)
app.get('/', optionalAuth, (req, res) => {
  res.json({
    success: true,
    message: 'HRM API is running',
    version: '1.0.0',
    endpoints: {
      health: '/api/health',
      auth: '/api/auth',
      users: '/api/users',
      branches: '/api/branches',
      employees: '/api/employees'
    }
  });
});

// Error handling middleware (must be last)
app.use(notFound);
app.use(errorHandler);



// Only listen if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    log.info(`Server is running on port ${PORT}`);
  });
}

// Export for Vercel
export default app;

