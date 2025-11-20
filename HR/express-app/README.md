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

## Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard:

   - `DATABASE_HOST`
   - `DATABASE_NAME`
   - `DATABASE_USER`
   - `DATABASE_PASSWORD`

3. Deploy!

The app will automatically work as serverless functions on Vercel.
