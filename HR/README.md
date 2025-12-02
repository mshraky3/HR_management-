# HRM Frontend - React Application

Frontend application for the Human Resources Management (HRM) system.

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

## Features

- **Authentication**: Login with username/password, JWT token management
- **Dashboard**: Overview of all tables and statistics
- **User Management**: Create and manage system users (Main Manager only)
- **Branch Management**: Create and manage branches (schools and healthcare centers)
- **Employee Management**: Full CRUD for employee records with all required fields
- **Document Management**: Upload, download, and manage employee documents

## Pages

- `/login` - Login page
- `/dashboard` - Main dashboard with statistics
- `/users` - User management (Main Manager only)
- `/branches` - Branch management
- `/employees` - Employee management
- `/documents` - Document management

## Getting Started

1. Make sure the backend server is running on `http://localhost:3000`
2. Start the frontend: `npm run dev`
3. Login with your credentials
4. Start managing your HR data!

## Notes

- The frontend requires a valid JWT token from the backend
- Main Manager has access to all features
- Branch Managers can only access their branch's data
- All API calls are authenticated automatically via interceptors
