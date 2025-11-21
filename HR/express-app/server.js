import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';

// Import routes and middleware
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { testConnection } from './config/database.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Test database connection on startup
async function testDbConnection() {
  try {
    await testConnection();
  } catch (error) {
    console.error('Warning: Database connection test failed:', error.message);
    console.log('Server will start, but database operations may fail.');
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
async function startup() {
  await testDbConnection();
  await initDatabase();
}

startup();

// API Routes
app.use('/api', apiRoutes);

// Test endpoint - Check database connection
app.get('/api/test', async (req, res) => {
  try {
    const result = await testConnection();
    res.json({ 
      success: true, 
      message: 'Database connected successfully',
      timestamp: result.timestamp
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// Get all test records
app.get('/api/test-records', async (req, res) => {
  try {
    const records = await sql`SELECT * FROM test_table ORDER BY created_at DESC`;
    res.json({ success: true, data: records });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error fetching records',
      error: error.message 
    });
  }
});

// Create a test record
app.post('/api/test-records', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name is required' 
      });
    }
    const [record] = await sql`
      INSERT INTO test_table (name) 
      VALUES (${name}) 
      RETURNING *
    `;
    res.json({ success: true, data: record });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error creating record',
      error: error.message 
    });
  }
});

// Database migration endpoint - Create table
app.post('/api/migrations/create-table', async (req, res) => {
  try {
    const { tableName, columns } = req.body;
    
    if (!tableName || !columns || !Array.isArray(columns)) {
      return res.status(400).json({ 
        success: false, 
        message: 'tableName and columns array are required' 
      });
    }

    const columnsDef = columns.join(', ');
    const sqlQuery = `CREATE TABLE IF NOT EXISTS ${tableName} (${columnsDef})`;
    
    await executeAndLog(
      'CREATE TABLE',
      `Created table: ${tableName} with columns: ${columns.join(', ')}`,
      sqlQuery,
      async () => {
        await sql.unsafe(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnsDef})`);
      }
    );

    res.json({ success: true, message: `Table ${tableName} created successfully` });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error creating table',
      error: error.message 
    });
  }
});

// Database migration endpoint - Alter table
app.post('/api/migrations/alter-table', async (req, res) => {
  try {
    const { tableName, action, column, columnDefinition } = req.body;
    
    if (!tableName || !action) {
      return res.status(400).json({ 
        success: false, 
        message: 'tableName and action are required' 
      });
    }

    let sqlQuery = '';
    let description = '';

    if (action === 'ADD_COLUMN' && columnDefinition) {
      sqlQuery = `ALTER TABLE ${tableName} ADD COLUMN ${columnDefinition}`;
      description = `Added column ${column || columnDefinition} to table ${tableName}`;
    } else if (action === 'DROP_COLUMN' && column) {
      sqlQuery = `ALTER TABLE ${tableName} DROP COLUMN ${column}`;
      description = `Dropped column ${column} from table ${tableName}`;
    } else if (action === 'RENAME_COLUMN' && column && req.body.newName) {
      sqlQuery = `ALTER TABLE ${tableName} RENAME COLUMN ${column} TO ${req.body.newName}`;
      description = `Renamed column ${column} to ${req.body.newName} in table ${tableName}`;
    } else {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid action or missing required parameters' 
      });
    }

    await executeAndLog(
      'ALTER TABLE',
      description,
      sqlQuery,
      async () => {
        await sql.unsafe(sqlQuery);
      }
    );

    res.json({ success: true, message: description });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error altering table',
      error: error.message 
    });
  }
});

// Database migration endpoint - Drop table
app.delete('/api/migrations/drop-table/:tableName', async (req, res) => {
  try {
    const { tableName } = req.params;
    
    if (!tableName) {
      return res.status(400).json({ 
        success: false, 
        message: 'tableName is required' 
      });
    }

    const sqlQuery = `DROP TABLE IF EXISTS ${tableName}`;
    
    await executeAndLog(
      'DROP TABLE',
      `Dropped table: ${tableName}`,
      sqlQuery,
      async () => {
        await sql.unsafe(`DROP TABLE IF EXISTS ${tableName}`);
      }
    );

    res.json({ success: true, message: `Table ${tableName} dropped successfully` });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error dropping table',
      error: error.message 
    });
  }
});

// Get migration log
app.get('/api/migrations/log', (req, res) => {
  try {
    const logContent = fs.readFileSync(MIGRATION_LOG_FILE, 'utf8');
    res.json({ success: true, log: logContent });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error reading migration log',
      error: error.message 
    });
  }
});

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

// Only listen if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export for Vercel
export default app;

