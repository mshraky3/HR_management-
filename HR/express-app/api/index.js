/**
 * Vercel Serverless Function Handler
 * This file exports the Express app as a serverless function for Vercel deployment
 * 
 * Vercel will use this file as the entry point for all requests to the API
 * based on the rewrites configuration in vercel.json
 */

import app from '../server.js';

// Export the Express app as default for Vercel serverless functions
export default app;

