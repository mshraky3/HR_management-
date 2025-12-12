# Debug Steps for Vercel White Page

## Current Situation

- HTML is being served (we see Vite's module preload code)
- But NO JavaScript bundle requests in Network tab
- This means the `<script>` tags are either missing or incorrect

## Immediate Check - View Page Source

**Please do this right now:**

1. Go to: https://hr-react-theta.vercel.app/
2. Right-click → **View Page Source** (or Ctrl+U)
3. Look for these lines in the HTML:
   ```html
   <script type="module" crossorigin src="/assets/index-[hash].js"></script>
   <link rel="stylesheet" crossorigin href="/assets/index-[hash].css" />
   ```

**What to report:**

- ✅ If you see `/assets/index-[hash].js` → The HTML is correct, issue is with asset serving
- ❌ If you see `/src/main.jsx` → Vercel is serving source HTML instead of built HTML
- ❌ If you see NO script tags → Build didn't complete or HTML is malformed

## If Script Tags Are Missing or Wrong

This means Vercel is serving the **source** `index.html` instead of the **built** `dist/index.html`.

### Fix: Verify Vercel Settings

1. Go to Vercel Dashboard → Your Project → Settings → General
2. Check these settings:

   - **Root Directory**: Should be `react-app` (if repo has both apps)
   - **Framework Preset**: Should be `Vite` (auto-detected)
   - **Build Command**: Should be `npm run build`
   - **Output Directory**: Should be `dist`
   - **Install Command**: Should be `npm install`

3. **CRITICAL**: Make sure **Root Directory** is set to `react-app`

### Alternative: Check Build Logs

In Vercel Dashboard → Deployments → Latest:

1. Check if build completed successfully
2. Look for: "Build completed" or "Build Output"
3. Verify it says: "Output Directory: dist"

## Quick Test

Try accessing the asset directly:

- `https://hr-react-theta.vercel.app/assets/index-BceakH9z.js`
- If 404 → Assets aren't being deployed
- If 200 → Assets exist, but HTML isn't referencing them

## Most Likely Issue

Based on the Network tab showing no asset requests, Vercel is likely:

1. **Serving source HTML** instead of built HTML, OR
2. **Root Directory is wrong** - building from wrong location

**Please check "View Page Source" and tell me what script tags you see!**
