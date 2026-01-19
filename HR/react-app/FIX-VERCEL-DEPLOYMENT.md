# Fix Vercel Deployment - Simple Steps

## The Problem
Vercel is trying to build from the **root directory** of your repository, but your React app is in the **`react-app`** subdirectory.

---

## The Fix (Takes 2 Minutes)

### Step 1: Configure Vercel Root Directory

1. Go to your Vercel project: https://vercel.com/dashboard
2. Click on your HR Management project
3. Click **"Settings"** tab at the top
4. Scroll down to **"Root Directory"** section
5. Click **"Edit"**
6. Type: `react-app`
7. Click **"Save"**

### Step 2: Verify Build Settings

While in Settings, check these are correct:

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install --legacy-peer-deps`

(These should already be set from your `vercel.json` file)

### Step 3: Set Environment Variable

1. Still in Settings, click **"Environment Variables"** in the left sidebar
2. Add new variable:
   - **Name**: `VITE_API_URL`
   - **Value**: Your backend URL (e.g., `https://hr-management-azure.vercel.app`)
   - Select: **Production**, **Preview**, and **Development**
3. Click **"Save"**

### Step 4: Redeploy

1. Go to **"Deployments"** tab
2. Find your latest deployment
3. Click the **three dots (...)** on the right
4. Click **"Redeploy"**

---

## What Should Happen

Your build logs should now show:

```
✓ Cloning completed
Running "vercel build"
Installing dependencies...
added 224 packages in 5s
Building...
vite v5.4.21 building for production...
✓ 892 modules transformed.
✓ built in 6.82s
Build Completed
Deployment Ready
```

---

## Backend URL Configuration

Your app is already configured to use the backend URL from:
1. `VITE_API_URL` environment variable (priority)
2. OR the `PRODUCTION` setting in `/src/config/api.js`

Current backend URL in code: `https://hr-management-azure.vercel.app`

If you need to change it, either:
- Update `VITE_API_URL` in Vercel settings (recommended)
- OR edit `/react-app/src/config/api.js` and change the `PRODUCTION` value

---

## Still Having Issues?

If it still fails after these steps:

1. Check the build logs in Vercel for the specific error
2. Make sure Root Directory is set to `react-app` (most common issue)
3. Verify your backend is accessible at the URL you set
4. Check that `--legacy-peer-deps` flag is in the install command

---

**That's it! Your app should deploy successfully now.**