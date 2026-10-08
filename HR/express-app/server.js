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
import { ensureCriticalSchema } from './database/criticalSchema.js';

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
  level: 1, // Several times cheaper than 6 for ~10-15% larger payloads; every ms is billed function time
  threshold: 1024, // Only compress responses larger than 1KB
}));

// CORS - allow all origins (needed for multiple frontends)
app.use(cors({
  origin: true, // reflects the request origin
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization', 'X-Branch-Documents-Password', 'x-branch-documents-password'],
  credentials: true,
  optionsSuccessStatus: 204,
  // The SPA is on another domain (hr-react-theta), so without this the browser
  // re-asks with a preflight (a separate function call) before nearly every
  // request. 7200 s is Chrome's ceiling.
  maxAge: 7200
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
  const code = hash.digest('hex');
  return { code, full: `${code}:${week}` };
}

// Requests wait on this before reaching a route. Until 2026-10-03 the schema
// check ran detached, so a release whose code needed new columns served
// requests before its migrations ran (and Vercel froze the function after
// the first response, so they never finished): login returned 500 for hours.
// It resolves at once when the schema matches this code - including when
// only the weekly safety re-run is due, which then continues in the
// background - and only after DDL + migrations when the code changed.
let releaseSchemaGate;
const schemaGate = new Promise((resolve) => { releaseSchemaGate = resolve; });

async function ensureSchemaCurrent() {
  // Columns the code needs are guaranteed first, whatever the migration table or fingerprint say (never throws).
  await ensureCriticalSchema();

  let fingerprint = null;
  try {
    const fp = await schemaFingerprint();
    fingerprint = fp.full;
    const [row] = await sql`SELECT fingerprint FROM schema_fingerprint WHERE id = 1`.catch(() => []);
    if (row?.fingerprint === fingerprint && process.env.FORCE_DB_INIT !== 'true') {
      // The fingerprint only says "this code was initialised once". If the newest migration is not recorded the
      // database is behind the code anyway (2026-10-08: it said "unchanged" while migration 028 was missing).
      const newest = readdirSync(new URL('./database/migrations/', import.meta.url)).filter((f) => f.endsWith('.js')).sort().pop();
      const [recorded] = await sql`SELECT 1 AS ok FROM schema_migrations WHERE name = ${newest}`.catch(() => []);
      if (recorded) {
        log.info('Schema unchanged since last init - skipping DDL and migrations');
        return;
      }
      log.warn('Fingerprint is current but the newest migration is not recorded; running pending migrations', { newest });
      try {
        const { runMigrations } = await import('./database/migrationRunner.js');
        await runMigrations();
      } catch (error) {
        log.warn('Pending migrations failed (the critical columns are still guaranteed)', { error: error.message });
      }
      return;
    }
    const codeUnchanged = typeof row?.fingerprint === 'string'
      && row.fingerprint.startsWith(`${fp.code}:`)
      && process.env.FORCE_DB_INIT !== 'true';
    if (codeUnchanged) {
      log.info('Weekly schema re-check due - running in the background');
      releaseSchemaGate();
    } else if (typeof row?.fingerprint === 'string') {
      // The code changed on an existing database: apply the (small, additive) migrations FIRST. The
      // 2,000-line DDL below can outlast the 8 s request gate, and requests that got through before a
      // new column existed failed with 500s (2026-10-07: employee edits after the work-start-date release).
      try {
        const { runMigrations } = await import('./database/migrationRunner.js');
        await runMigrations();
        log.info('Pending migrations applied before the full schema check');
      } catch (error) {
        log.warn('Early migration run failed, falling back to the full init', { error: error.message });
      }
      releaseSchemaGate();
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

  // Initialize database tables (idempotent - safe to run multiple times)
  // Only run if not in Vercel or if explicitly enabled
  // On Vercel, tables should already exist, but this ensures they're created if needed
  if (process.env.INIT_DB_ON_STARTUP !== 'false') {
    try {
      await ensureSchemaCurrent();
    } finally {
      releaseSchemaGate();
    }
  } else {
    releaseSchemaGate();
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
  releaseSchemaGate();
});

// Hold requests until the schema gate opens (see schemaGate above). Bounded,
// so a slow or unreachable database cannot hold a request past the function
// limit: after the wait the request is served anyway, as it was before.
const SCHEMA_WAIT_MS = 25000;
let schemaReady = false;
schemaGate.then(() => { schemaReady = true; });
app.use((req, res, next) => {
  if (schemaReady) return next();
  let handedOff = false;
  const proceed = () => {
    if (handedOff) return;
    handedOff = true;
    next();
  };
  const giveUp = setTimeout(() => {
    log.warn(`Schema setup still running after ${SCHEMA_WAIT_MS}ms, serving request anyway`);
    proceed();
  }, SCHEMA_WAIT_MS);
  schemaGate.then(() => {
    clearTimeout(giveUp);
    proceed();
  });
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
    } else if (req.path.includes('/employees') || req.path.includes('/documents') || req.path.includes('/branch-documents') ||
      req.path.includes('/users') || req.path.includes('/archive') || req.path.includes('/tasks') || req.path.includes('/year-cycle')) {
      // Data people edit and then look at again straight away: never serve it from the browser cache.
      // (A 5 s max-age made a saved edit disappear from the list for a few seconds.)
      res.set('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.set('Pragma', 'no-cache');
      res.set('Expires', '0');
    } else if (req.path.includes('/branches') || req.path.includes('/terms') || req.path.includes('/academic-years')) {
      // Rarely changing data - 10 seconds
      res.set('Cache-Control', 'private, max-age=10');
    } else {
      // Everything else: the browser may keep a copy but must revalidate it (ETag) before using it.
      res.set('Cache-Control', 'private, no-cache');
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

