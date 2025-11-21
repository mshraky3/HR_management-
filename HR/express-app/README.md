# Express App

Express backend with PostgreSQL database connection, ready to deploy on Vercel.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file:

```
DATABASE_HOST=your-database-host
DATABASE_NAME=your-database-name
DATABASE_USER=your-database-user
DATABASE_PASSWORD=your-database-password
PORT=3000
```

3. Run the development server:

```bash
npm run dev
```

The server will run on `http://localhost:3000`

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/test` - Test database connection
- `GET /api/test-records` - Get all test records
- `POST /api/test-records` - Create a new test record
  - Body: `{ "name": "test name" }`

## Database

The app automatically creates a `test_table` on startup with the following schema:

- `id` (SERIAL PRIMARY KEY)
- `name` (VARCHAR(255))
- `created_at` (TIMESTAMP)

## Database Migration Logging

**All database schema changes are automatically logged** to `database_migrations.txt`. This includes:

- ✅ CREATE TABLE operations
- ✅ ALTER TABLE operations (ADD COLUMN, DROP COLUMN, RENAME COLUMN)
- ✅ DROP TABLE operations
- ✅ All custom SQL queries

The log file records:
- Timestamp of each change
- Action type (CREATE, ALTER, DROP)
- Details of what was changed
- The SQL query that was executed

### Migration API Endpoints

- `POST /api/migrations/create-table` - Create a new table
  - Body: `{ "tableName": "users", "columns": ["id SERIAL PRIMARY KEY", "name VARCHAR(255)"] }`
  
- `POST /api/migrations/alter-table` - Alter an existing table
  - Body: `{ "tableName": "users", "action": "ADD_COLUMN", "columnDefinition": "email VARCHAR(255)" }`
  - Actions: `ADD_COLUMN`, `DROP_COLUMN`, `RENAME_COLUMN`
  
- `DELETE /api/migrations/drop-table/:tableName` - Drop a table

- `GET /api/migrations/log` - Get the migration log file content

### Using Helper Functions

You can also use the helper functions in `db-helpers.js` for programmatic database changes:

```javascript
import { createTable, addColumn, dropTable } from './db-helpers.js';

// All operations are automatically logged
await createTable('users', 'id SERIAL PRIMARY KEY, name VARCHAR(255)');
await addColumn('users', 'email VARCHAR(255)');
await dropTable('old_table');
```

## Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard:

   - `DATABASE_HOST`
   - `DATABASE_NAME`
   - `DATABASE_USER`
   - `DATABASE_PASSWORD`

3. Deploy!

The app will automatically work as serverless functions on Vercel.
