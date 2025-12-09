# Vercel Deployment Fix - White Page Issue

## Critical Issue
The app shows a white page on Vercel even though the build appears to complete.

## Root Cause Analysis

The most likely causes:
1. **Vercel not detecting the project root** - If `react-app` is a subdirectory, Vercel might not be building from the correct location
2. **Build output not being served** - Assets might not be loading correctly
3. **JavaScript errors** - Silent errors preventing the app from rendering

## Solution Steps

### Step 1: Verify Vercel Project Configuration

In your Vercel Dashboard:
1. Go to your project settings
2. Check **"Root Directory"** setting
3. **IMPORTANT**: Set it to `react-app` (not the repo root)
4. Save and redeploy

### Step 2: Verify Build Settings

In Vercel Dashboard → Settings → General:
- **Framework Preset**: Should be "Vite" (auto-detected)
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Check Build Logs

After deployment, check the build logs for:
- ✅ Build completes successfully
- ✅ No errors in the build output
- ✅ Files are generated in `dist/` directory

### Step 4: Verify Environment Variables

In Vercel Dashboard → Settings → Environment Variables:
- Set `VITE_API_URL` to your backend URL (e.g., `https://hr-management-azure.vercel.app`)

### Step 5: Test the Deployment

1. **Check Browser Console** (F12):
   - Open DevTools → Console
   - Look for any JavaScript errors
   - Check if assets are loading (Network tab)

2. **Check Network Tab**:
   - Open DevTools → Network
   - Refresh the page
   - Verify these files load with 200 status:
     - `/index.html`
     - `/assets/index-[hash].js`
     - `/assets/index-[hash].css`

3. **Check if HTML is loading**:
   - Right-click → View Page Source
   - Should see the HTML with script tags

## Alternative: Deploy from react-app Directory

If the above doesn't work, try this:

1. **Create a separate Vercel project** for the frontend:
   - In Vercel Dashboard, create a new project
   - Connect to the same GitHub repo
   - **Set Root Directory to `react-app`**

2. **Or use Vercel CLI from react-app directory**:
   ```bash
   cd react-app
   vercel
   ```

## Current Configuration

- ✅ `vercel.json` is simplified to just rewrites
- ✅ `vite.config.js` has correct base path
- ✅ Error boundary added for better error handling
- ✅ Root route properly handles authentication

## Debugging Commands

If you have access to the build:
```bash
cd react-app
npm run build
ls -la dist/
cat dist/index.html
```

This will show you what files are generated and if the HTML is correct.

## Expected Behavior After Fix

✅ Visiting `/` should redirect to `/login` or `/dashboard`
✅ Visiting `/login` should show the login page
✅ No white page - either content or error message should appear
✅ Browser console should show no critical errors

## If Still Not Working

1. **Check Vercel Function Logs**:
   - Vercel Dashboard → Deployments → [Latest] → Functions
   - Look for any runtime errors

2. **Try a minimal test**:
   - Temporarily replace `App.jsx` with a simple `<div>Hello World</div>`
   - If this works, the issue is in the app code
   - If this doesn't work, the issue is with Vercel configuration

3. **Check if it's a CORS issue**:
   - Open browser console
   - Check for CORS errors in Network tab
   - Verify backend allows requests from your frontend domain

