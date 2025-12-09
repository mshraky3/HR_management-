# Vercel Assets Not Loading - Fix Guide

## Problem
The JavaScript bundle (`/assets/index-[hash].js`) is not loading on Vercel, causing a white page.

## Root Cause
Vercel's rewrite rule `"source": "/(.*)"` is catching ALL requests, including `/assets/*`, and redirecting them to `/index.html` instead of serving the actual asset files.

## Solution Applied
Updated `vercel.json` to:
1. **Exclude assets from rewrite** - Assets are served directly
2. **Add cache headers** - Better performance for static assets

## Verification Steps

### 1. Check Network Tab
After deployment, open DevTools (F12) → Network tab:
- Refresh the page
- Look for `/assets/index-[hash].js`
- **Expected**: Status 200 (success)
- **If 404**: Vercel isn't finding the dist folder
- **If redirected to index.html**: Rewrite rule is still catching assets

### 2. Check Build Output
In Vercel build logs, verify:
- `dist/` folder is created
- `dist/assets/` folder contains JS files
- `dist/index.html` exists

### 3. Verify Vercel Settings
In Vercel Dashboard → Settings → General:
- **Root Directory**: Should be `react-app` (if repo has multiple apps)
- **Output Directory**: Should be `dist`
- **Build Command**: Should be `npm run build`

## If Still Not Working

### Option 1: Check if dist folder is being deployed
1. Go to Vercel Dashboard → Deployments
2. Click on latest deployment
3. Check "Source" tab - should show `dist/` folder
4. If `dist/` is missing, the build isn't outputting correctly

### Option 2: Try explicit build configuration
Add to `vercel.json`:
```json
{
  "buildCommand": "npm run build",
  "outputDirectory": "dist"
}
```

### Option 3: Check for .vercelignore
Make sure `dist/` is NOT in `.vercelignore`:
```bash
# Should NOT have:
# dist/
```

### Option 4: Manual asset check
Try accessing the asset directly:
- `https://hr-react-theta.vercel.app/assets/index-BceakH9z.js`
- If this returns 404, assets aren't being deployed
- If this returns the JS file, the issue is with the HTML reference

## Expected Behavior After Fix

✅ `/assets/*.js` files return 200 status
✅ `/assets/*.css` files return 200 status  
✅ React app loads and renders
✅ Console shows "React app mounted successfully!"

