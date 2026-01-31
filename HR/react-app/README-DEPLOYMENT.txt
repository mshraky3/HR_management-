================================================================================
  VERCEL DEPLOYMENT - QUICK FIX
================================================================================

PROBLEM: Vercel building from wrong directory (root instead of react-app)

SOLUTION: Configure "Root Directory" in Vercel Dashboard

STEPS:
1. Vercel Dashboard → Your Project → Settings
2. Find "Root Directory" section → Click "Edit"
3. Enter: react-app
4. Click "Save"
5. Go to "Deployments" tab → Click "..." → "Redeploy"

ENVIRONMENT VARIABLE:
Name: VITE_API_URL
Value: https://hr-management-azure.vercel.app (or your backend URL)

That's it! Build should now succeed.

Full guide: See FIX-VERCEL-DEPLOYMENT.md
