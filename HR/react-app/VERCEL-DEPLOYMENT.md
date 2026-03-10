# Frontend Deployment Guide for Vercel

## Overview
This React app is deployed **separately** from the backend. The frontend is hosted on Vercel, and it makes API calls to a backend hosted elsewhere.

---

## Prerequisites
- GitHub/GitLab/Bitbucket repository
- Vercel account
- Backend API already deployed and accessible

---

## Step-by-Step Deployment

### 1. Prepare Your Repository

Since your project has multiple directories (react-app, express-app, etc.), you need to tell Vercel to deploy ONLY the `react-app` directory.

### 2. Connect to Vercel

1. Go to https://vercel.com/new
2. Import your Git repository
3. Vercel will detect your repository

### 3. Configure Project Settings

**CRITICAL**: Configure these settings during import:

#### Project Name
- Choose any name (e.g., `hr-management-frontend`)

#### Framework Preset
- Select: **Vite**

#### Root Directory
- **THIS IS THE KEY SETTING**
- Click "Edit" next to "Root Directory"
- Enter: `react-app`
- This tells Vercel to build from the `react-app` subdirectory, not the repository root

#### Build & Development Settings
Leave these as default (they're already in vercel.json):
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install --legacy-peer-deps`

### 4. Environment Variables

Add the following environment variable:

**Variable Name**: `VITE_API_URL`  
**Value**: Your backend API URL (e.g., `https://your-backend.com`)

**Note**: If you leave this empty, the app will use relative paths.

To add environment variables:
1. Before clicking "Deploy", expand "Environment Variables"
2. Add `VITE_API_URL` with your backend URL
3. Select all environments (Production, Preview, Development)

### 5. Deploy

Click **"Deploy"** button.

Vercel will:
1. Clone your repository
2. Navigate to `react-app` directory
3. Install dependencies with `--legacy-peer-deps` flag
4. Build the Vite app
5. Deploy to a URL

---

## Expected Build Output

You should see something like:

```
Running build in Portland, USA (West) – pdx1
Cloning github.com/your-repo (Branch: main)
Running "vercel build"
Vercel CLI 50.4.5
Installing dependencies...
added 224 packages in 5s
Building...
vite v5.4.21 building for production...
✓ 892 modules transformed.
✓ built in 6.82s
Build Completed
```

---

## Troubleshooting

### Error: "Cannot find package.json"
**Solution**: Make sure "Root Directory" is set to `react-app` in Project Settings → General

### Error: "Cannot find module 'vite'"
**Solution**: Ensure `installCommand` includes `--legacy-peer-deps` flag

### Error: API calls failing (404 or CORS errors)
**Solution**: 
1. Check `VITE_API_URL` environment variable is set correctly
2. Ensure backend CORS allows requests from your Vercel domain
3. Check backend is running and accessible

### Error: React Router routes return 404
**Solution**: The `vercel.json` rewrites configuration handles this. Make sure the file exists in `react-app/vercel.json`

---

## Updating Deployment

### From Git (Recommended)
1. Push changes to your Git repository
2. Vercel auto-deploys on push to main branch

### Manual Redeploy
1. Go to Vercel Dashboard → Your Project → Deployments
2. Click "..." on latest deployment
3. Click "Redeploy"

---

## Post-Deployment Checklist

- [ ] Site loads at Vercel URL
- [ ] All pages are accessible
- [ ] API calls work correctly
- [ ] PDF generation works
- [ ] Arabic text displays correctly
- [ ] Authentication works
- [ ] No console errors
- [ ] Test on mobile devices

---

## Vercel Project Settings (After First Deploy)

If you need to change settings later:

1. Go to: Vercel Dashboard → Your Project → Settings
2. **General**:
   - Root Directory: `react-app`
3. **Environment Variables**:
   - `VITE_API_URL`: Your backend URL
4. **Git**:
   - Configure auto-deploy branches

---

## Custom Domain (Optional)

1. Go to: Settings → Domains
2. Add your custom domain
3. Follow DNS configuration instructions

---

## Important Files

- `/react-app/vercel.json` - Vercel configuration
- `/react-app/vite.config.js` - Vite build configuration
- `/react-app/package.json` - Dependencies and scripts

---

## Backend Configuration

Your backend (deployed separately) needs:

### CORS Settings
Allow requests from your Vercel domain:

```javascript
// express-app example
const cors = require('cors');

app.use(cors({
  origin: [
    'https://your-vercel-domain.vercel.app',
    'http://localhost:5173' // for local development
  ],
  credentials: true
}));
```

### Environment Variables on Backend
Make sure your backend has all required environment variables set on its hosting platform.

---

## Development vs Production

### Local Development
```bash
cd react-app
npm install --legacy-peer-deps
npm run dev
```

### Production Build Test (Local)
```bash
cd react-app
npm run build
npm run preview
```

---

## Support

If deployment fails:
1. Check Vercel build logs for specific errors
2. Verify "Root Directory" setting is `react-app`
3. Ensure all environment variables are set
4. Test build locally: `cd react-app && npm run build`

---

**Last Updated**: January 20, 2025