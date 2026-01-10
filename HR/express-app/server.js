import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { fileURLToPath } from 'url';
import path from 'path';

// Import routes and middleware
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { optionalAuth } from './middleware/auth.js';
import { testConnection } from './config/database.js';
import logger, { httpLogger, log } from './utils/logger.js';

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
  allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  credentials: true,
  optionsSuccessStatus: 204
}));

// Ensure OPTIONS always returns CORS headers even if next handlers error
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  res.header('Vary', 'Origin');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});
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
    const { getBlobStoreName } = await import('./config/blobStorage.js');
    if (isBlobStorageConfigured()) {
      const activeStore = getBlobStoreName();
      log.info(`Blob Storage is configured - using ${activeStore} blob store`);
    } else {
      log.warn('Blob Storage is not configured - file uploads will not work. Please set BLOB_READ_WRITE_TOKEN or SPARE_BLOB_READ_WRITE_TOKEN');
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
  } catch (error) {
    log.error('Error initializing database', { error: error.message });
    // Don't exit - allow server to start even if tables already exist
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
    try {
      await initDatabase();
    } catch (error) {
      // Don't block startup - tables may already exist
      log.warn('Database initialization had issues (tables may already exist)', { error: error.message });
    }
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
      res.set('Cache-Control', 'public, max-age=5');
    } else if (req.path.includes('/documents') || req.path.includes('/branch-documents')) {
      // Documents - very short cache (5 seconds)
      res.set('Cache-Control', 'public, max-age=5');
    } else if (req.path.includes('/branches') || req.path.includes('/terms') || req.path.includes('/academic-years')) {
      // Static data - reduced from 5 minutes to 10 seconds
      res.set('Cache-Control', 'public, max-age=10');
    } else {
      // Other GET requests - very short cache (5 seconds)
      res.set('Cache-Control', 'public, max-age=5');
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
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

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

