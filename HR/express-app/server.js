import express from 'express';
import cors from 'cors';
import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const sql = postgres({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASSWORD,
  ssl: 'require',
});

// Initialize test table
async function initDatabase() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS test_table (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('Test table initialized successfully');
  } catch (error) {
    console.error('Error initializing database:', error);
  }
}

// Initialize database on startup
initDatabase();

// Test endpoint - Check database connection
app.get('/api/test', async (req, res) => {
  try {
    const result = await sql`SELECT NOW() as current_time`;
    res.json({ 
      success: true, 
      message: 'Database connected successfully',
      timestamp: result[0].current_time
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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Server is running' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ success: true, message: 'Express API is running' });
});

// Only listen if not in Vercel environment
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
}

// Export for Vercel
export default app;

