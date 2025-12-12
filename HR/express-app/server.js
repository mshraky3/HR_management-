import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import compression from 'compression';
import { fileURLToPath } from 'url';
import path from 'path';

// Import routes and middleware
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { testConnection } from './config/database.js';
import { startScheduler } from './utils/alertScheduler.js';

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

// CORS - allow all origins (no restrictions)
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware (for debugging - disabled in production)
if (process.env.NODE_ENV !== 'production') {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// Test database connection on startup
async function testDbConnection() {
  try {
    await testConnection();
  } catch (error) {
    console.error('Warning: Database connection test failed:', error.message);
    console.log('Server will start, but database operations may fail.');
  }
}

// Test Blob Storage configuration on startup
async function testBlobStorage() {
  try {
    const { isBlobStorageConfigured } = await import('./utils/blobStorage.js');
    if (isBlobStorageConfigured()) {
      console.log('✅ Blob Storage is configured (BLOB_READ_WRITE_TOKEN found)');
    } else {
      console.warn('⚠️  Warning: BLOB_READ_WRITE_TOKEN is not set.');
      console.warn('   Blob Storage operations will fail. For local development, run: vercel env pull');
      console.warn('   Server will start, but file uploads will not work.');
    }
  } catch (error) {
    console.error('Warning: Could not check Blob Storage configuration:', error.message);
  }
}

// Initialize HRM database tables
async function initDatabase() {
  try {
    // Import and run database initialization
    const { initializeDatabase } = await import('./database/init.js');
    await initializeDatabase();
    console.log('HRM database tables initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
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
    console.warn('Database connection test failed on startup, will retry on first request');
  }
  
  try {
    await testBlobStorage();
  } catch (error) {
    // Don't block startup if Blob Storage test fails
    console.warn('Blob Storage test failed on startup');
  }
  
  // Initialize database tables (idempotent - safe to run multiple times)
  // Only run if not in Vercel or if explicitly enabled
  // On Vercel, tables should already exist, but this ensures they're created if needed
  if (process.env.INIT_DB_ON_STARTUP !== 'false') {
    try {
      await initDatabase();
    } catch (error) {
      // Don't block startup - tables may already exist
      console.warn('Database initialization had issues (tables may already exist):', error.message);
    }
  }
}

// Run startup asynchronously (don't block server start)
startup().catch(err => {
  console.error('Startup error:', err);
});

// Performance Optimization: Add caching headers for static data
// Cache static API responses for better performance
app.use('/api', (req, res, next) => {
  // Add cache headers for GET requests (except sensitive data)
  if (req.method === 'GET' && !req.path.includes('/auth') && !req.path.includes('/me')) {
    // Cache static data for 5 minutes
    if (req.path.includes('/branches') || req.path.includes('/terms') || req.path.includes('/academic-years')) {
      res.set('Cache-Control', 'public, max-age=300'); // 5 minutes
    } else {
      // Cache other GET requests for 1 minute
      res.set('Cache-Control', 'public, max-age=60'); // 1 minute
    }
  }
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
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

// Start alert scheduler (runs every 24 hours)
// Only start in production or if explicitly enabled
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_ALERT_SCHEDULER === 'true') {
  try {
    startScheduler(1440); // Run every 24 hours (1440 minutes)
    console.log('Alert scheduler started successfully');
  } catch (error) {
    console.error('Failed to start alert scheduler:', error);
  }
}

// Only listen if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export for Vercel
export default app;

