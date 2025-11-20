# React App (Vite)

This is a React application built with Vite, ready to deploy on Vercel.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (optional, defaults to localhost:3000):
```
VITE_API_URL=http://localhost:3000
```

3. Run the development server:
```bash
npm run dev
```

The app will run on `http://localhost:5173`

## Vercel Deployment

1. Connect your repository to Vercel
2. Set environment variables in Vercel dashboard:
   - `VITE_API_URL`: Your Express API URL (e.g., `https://your-api.vercel.app`)

3. Deploy!

## Features

- Connects to Express backend via axios
- Tests database connection
- CRUD operations on test table
- Modern UI with status indicators
