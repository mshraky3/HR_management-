/**
 * Blob Recovery Route
 * 
 * This endpoint runs inside Vercel's infrastructure and reads blob content
 * directly, bypassing potential CDN issues with double-extension filenames.
 * 
 * GET /api/blob-recovery/read?url=<blob_url>
 *   Returns the raw blob content as binary stream
 * 
 * GET /api/blob-recovery/fix-all
 *   Reads all double-extension blobs, re-uploads with clean extensions,
 *   updates database, and returns results
 */

import express from 'express';
import { head, put, list, del, copy } from '@vercel/blob';
import { getBlobToken } from '../config/blobStorage.js';
import sql from '../config/database.js';
import { authenticate } from '../middleware/auth.js';
import { requireMainManager } from '../middleware/authorization.js';
import { handleRouteError } from '../utils/routeErrorHandler.js';
import { log } from '../utils/logger.js';

const router = express.Router();
const token = getBlobToken();

// All blob recovery endpoints require authentication and main_manager role
router.use(authenticate);
router.use(requireMainManager);

/**
 * Test: Read a single blob's content and return it
 * GET /blob-recovery/read?url=<blob_url>
 */
router.get('/read', async (req, res) => {
  try {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: 'url parameter required' });

    // Try to fetch from CDN directly (from within Vercel's network)
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(30000)
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `CDN returned ${response.status}`,
        statusText: response.statusText
      });
    }

    const contentType = response.headers.get('content-type');
    res.setHeader('Content-Type', contentType || 'application/octet-stream');

    // Stream the response
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (e) {
    handleRouteError(e, req, res, 'حدث خطأ في الخادم');
  }
});

/**
 * Test: Try copy() from within Vercel's infrastructure
 * GET /blob-recovery/test-copy?from=<pathname>&to=<pathname>
 */
router.get('/test-copy', async (req, res) => {
  try {
    const { from, to } = req.query;
    if (!from || !to) return res.status(400).json({ error: 'from and to parameters required' });

    const result = await copy(from, to, {
      access: 'public',
      token,
      addRandomSuffix: false,
      allowOverwrite: true
    });

    res.json({ success: true, result });
  } catch (e) {
    handleRouteError(error, req, res, 'حدث خطأ في الخادم');
  }
});

/**
 * Fix a batch of double-extension files
 * POST /blob-recovery/fix-batch
 * Body: { urls: [{ url, newPathname }], limit?: number }
 */
router.post('/fix-batch', async (req, res) => {
  try {
    const results = { fixed: [], failed: [], skipped: [] };

    // Get all double-extension files from DB
    const brokenFiles = await sql`
      SELECT id, employee_id, document_type, file_path, file_name 
      FROM employee_documents 
      WHERE file_path ~ '\\.[a-z]+\\.[a-z]+$'
      ORDER BY id
      LIMIT ${req.body?.limit || 50}
      OFFSET ${req.body?.offset || 0}
    `;

    log.info(`Processing ${brokenFiles.length} files...`);

    for (const file of brokenFiles) {
      try {
        const oldUrl = file.file_path;
        const urlObj = new URL(oldUrl);
        const oldPathname = urlObj.pathname.replace(/^\//, '');

        // Remove double extension: .pdf.pdf -> .pdf, .jpg.jpg -> .jpg
        const newPathname = oldPathname.replace(/(\.[a-z]+)\.\1$|\.([a-z]+)\.(\2)$/i, '$1');
        // More general: remove last extension if it matches the one before it
        const cleanPathname = oldPathname.replace(/(\.[a-zA-Z0-9]+)\1$/, '$1');

        if (cleanPathname === oldPathname) {
          results.skipped.push({ id: file.id, reason: 'No double extension detected' });
          continue;
        }

        log.info(`  Fixing ${file.id}: ${oldPathname} -> ${cleanPathname}`);

        // Try copy() from within Vercel's network
        const copyResult = await copy(oldUrl, cleanPathname, {
          access: 'public',
          token,
          addRandomSuffix: false,
          allowOverwrite: true
        });

        // Update database with new URL
        await sql`
          UPDATE employee_documents 
          SET file_path = ${copyResult.url}
          WHERE id = ${file.id}
        `;

        results.fixed.push({
          id: file.id,
          oldPath: oldPathname,
          newUrl: copyResult.url
        });
      } catch (e) {
        log.error(`  Failed ${file.id}: ${e.message}`);
        results.failed.push({
          id: file.id,
          path: file.file_path,
          error: e.message
        });
      }
    }

    res.json({
      total: brokenFiles.length,
      fixed: results.fixed.length,
      failed: results.failed.length,
      skipped: results.skipped.length,
      results
    });
  } catch (e) {
    handleRouteError(error, req, res, 'حدث خطأ في الخادم');
  }
});

/**
 * Status: Count remaining broken files
 * GET /blob-recovery/status
 */
router.get('/status', async (req, res) => {
  try {
    const count = await sql`
      SELECT COUNT(*) as total 
      FROM employee_documents 
      WHERE file_path ~ '\\.[a-z]+\\.[a-z]+$'
    `;

    const total = await sql`SELECT COUNT(*) as total FROM employee_documents`;

    res.json({
      brokenFiles: parseInt(count[0].total),
      totalFiles: parseInt(total[0].total)
    });
  } catch (e) {
    handleRouteError(error, req, res, 'حدث خطأ في الخادم');
  }
});

/**
 * Direct download test - try multiple methods from within Vercel
 * GET /blob-recovery/test-download?url=<blob_url>
 */
router.get('/test-download', async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).json({ error: 'url parameter required' });

  const results = {};

  // Method 1: Direct fetch with Bearer token
  try {
    const r = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15000)
    });
    results.directFetch = { status: r.status, size: parseInt(r.headers.get('content-length') || '0') };
    if (r.status === 200) {
      const buf = await r.arrayBuffer();
      results.directFetch.actualSize = buf.byteLength;
      results.directFetch.first4hex = Buffer.from(buf).slice(0, 4).toString('hex');
    }
  } catch (e) {
    results.directFetch = { error: e.message };
  }

  // Method 2: Fetch without auth
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
    results.noAuth = { status: r.status };
  } catch (e) {
    results.noAuth = { error: e.message };
  }

  // Method 3: Head to get metadata
  try {
    const h = await head(url, { token });
    results.head = { url: h.url, size: h.size, contentType: h.contentType };
  } catch (e) {
    results.head = { error: e.message };
  }

  // Method 4: Copy attempt
  try {
    const pathname = new URL(url).pathname.replace(/^\//, '');
    const testPath = pathname + '.test-recovery-' + Date.now();
    const r = await Promise.race([
      copy(url, testPath, { access: 'public', token, addRandomSuffix: false }),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout 15s')), 15000))
    ]);
    results.copy = { success: true, newUrl: r.url };
    // Clean up test file
    try { await del(r.url, { token }); } catch (e) { }
  } catch (e) {
    results.copy = { error: e.message };
  }

  res.json(results);
});

export default router;
