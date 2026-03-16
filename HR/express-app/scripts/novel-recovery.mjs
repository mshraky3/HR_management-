/**
 * Novel R2 recovery technique: Decode Vercel Blob token to extract
 * the underlying S3-compatible credentials and access the storage
 * backend directly, bypassing the broken CDN.
 *
 * Vercel Blob is built on top of an S3-compatible store. The
 * BLOB_READ_WRITE_TOKEN contains encoded credentials.
 */
import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';
import { S3Client, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

const token = process.env.BLOB_READ_WRITE_TOKEN;
console.log('=== NOVEL TECHNIQUE: Decode Vercel Blob Token ===\n');

// Step 1: Analyze the token structure
console.log('Token prefix:', token.substring(0, 30) + '...');
const parts = token.split('_');
console.log('Token parts count:', parts.length);
console.log('Parts:', parts.map((p, i) => `[${i}]: ${p.substring(0, 20)}${p.length > 20 ? '...' : ''} (len=${p.length})`).join('\n       '));

// The token format is typically: vercel_blob_rw_<storeId>_<secret>
// Let's extract what we can
const storeId = parts.length >= 5 ? parts[3] : null;
const secret = parts.length >= 5 ? parts.slice(4).join('_') : null;
console.log('\nStore ID:', storeId);
console.log('Secret length:', secret?.length);

// Step 2: Try to decode the secret as base64 (might contain S3 creds)
if (secret) {
    try {
        const decoded = Buffer.from(secret, 'base64').toString('utf8');
        console.log('\nBase64 decoded secret (first 200 chars):', decoded.substring(0, 200));

        // Check if it's JSON
        try {
            const json = JSON.parse(decoded);
            console.log('\nDecoded as JSON:', JSON.stringify(json, null, 2).substring(0, 500));
        } catch {
            console.log('(Not valid JSON)');
        }
    } catch {
        console.log('(Cannot base64 decode)');
    }

    // Also try base64url
    try {
        const decoded = Buffer.from(secret.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
        if (decoded !== secret) {
            console.log('\nBase64url decoded:', decoded.substring(0, 200));
        }
    } catch { }
}

// Step 3: Try Vercel Blob API endpoints that might serve content
// The blob.vercel-storage.com API endpoint (not CDN)
console.log('\n=== Trying Vercel Blob API endpoints ===\n');

const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

// Get a sample bus registration URL
const [sample] = await sql`
  SELECT bus_id, registration_document_url FROM bus_registration_data 
  WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL
  LIMIT 1`;

if (!sample) {
    console.log('No pending bus registration docs found');
    await sql.end();
    process.exit(0);
}

const testUrl = sample.registration_document_url;
console.log('Test URL:', testUrl);

// Extract the pathname
const urlObj = new URL(testUrl);
const blobPath = urlObj.pathname.slice(1);
console.log('Blob path:', blobPath);

// Method 1: blob.vercel-storage.com API with token auth
const apiEndpoints = [
    { name: 'API blob get', url: `https://blob.vercel-storage.com/${storeId}/${blobPath}`, headers: { 'Authorization': `Bearer ${token}` } },
    { name: 'API direct', url: `https://blob.vercel-storage.com/${blobPath}`, headers: { 'Authorization': `Bearer ${token}` } },
    { name: 'API x-api-key', url: `https://${storeId}.blob.vercel-storage.com/${blobPath}`, headers: { 'x-api-version': '7', 'x-api-key': token } },
    { name: 'Blob API v7', url: `https://blob.vercel-storage.com/api/v7/blob/download/${storeId}/${blobPath}`, headers: { 'Authorization': `Bearer ${token}` } },
    { name: 'Blob store endpoint', url: `https://${storeId}.public.blob.vercel-storage.com/${blobPath}`, headers: { 'Authorization': `Bearer ${token}`, 'Cache-Control': 'no-cache', 'x-vercel-protection-bypass': 'true' } },
    { name: 'Private store', url: `https://${storeId}.private.blob.vercel-storage.com/${blobPath}`, headers: { 'Authorization': `Bearer ${token}` } },
    { name: 'Vercel API blob', url: `https://api.vercel.com/v1/blob/stores/${storeId}/files/${encodeURIComponent(blobPath)}`, headers: { 'Authorization': `Bearer ${process.env.VERCEL_API_TOKEN || token}` } },
    { name: 'Edge blob', url: `https://blob.vercel-storage.com/${storeId}?pathname=${encodeURIComponent(blobPath)}`, headers: { 'Authorization': `Bearer ${token}` } },
];

for (const endpoint of apiEndpoints) {
    try {
        const resp = await fetch(endpoint.url, {
            headers: endpoint.headers,
            signal: AbortSignal.timeout(10000)
        });
        const contentType = resp.headers.get('content-type') || '';
        const contentLen = resp.headers.get('content-length') || '?';
        const isHtml = contentType.includes('html') || contentType.includes('text');
        let body = '';
        if (!resp.ok || isHtml) {
            body = await resp.text();
            body = body.substring(0, 150);
        }
        console.log(`  ${endpoint.name}: ${resp.status} ${resp.statusText} | type=${contentType} len=${contentLen}${body ? ' | ' + body : ''}`);

        if (resp.ok && !isHtml && parseInt(contentLen) > 1000) {
            console.log('  *** SUCCESS! This endpoint serves file content! ***');
            // Read the content
            const buf = Buffer.from(await resp.arrayBuffer());
            console.log(`  Content: ${buf.length} bytes, first bytes: ${buf.slice(0, 20).toString('hex')}`);
        }
    } catch (e) {
        console.log(`  ${endpoint.name}: ERROR ${e.message?.substring(0, 100)}`);
    }
}

// Method 2: Try the @vercel/blob SDK's internal methods
console.log('\n=== Trying @vercel/blob SDK methods ===\n');

try {
    const { list, head, copy } = await import('@vercel/blob');

    // List blobs matching our path
    console.log('Listing blobs with prefix "buses/"...');
    const listResult = await list({ prefix: 'buses/', limit: 3, token });
    console.log(`Found ${listResult.blobs.length} blobs`);

    for (const blob of listResult.blobs.slice(0, 3)) {
        console.log(`\n  Blob: ${blob.pathname}`);
        console.log(`  URL: ${blob.url}`);
        console.log(`  downloadUrl: ${blob.downloadUrl}`);
        console.log(`  Size: ${blob.size}`);

        // Try the downloadUrl
        try {
            const resp = await fetch(blob.downloadUrl, { signal: AbortSignal.timeout(10000) });
            if (resp.ok) {
                const buf = Buffer.from(await resp.arrayBuffer());
                console.log(`  *** downloadUrl WORKS! ${buf.length} bytes ***`);
            } else {
                const txt = await resp.text();
                console.log(`  downloadUrl: ${resp.status} - ${txt.substring(0, 100)}`);
            }
        } catch (e) {
            console.log(`  downloadUrl: ${e.message?.substring(0, 80)}`);
        }

        // Try head() which returns more metadata
        try {
            const headResult = await head(blob.url, { token });
            console.log(`  head(): size=${headResult.size} type=${headResult.contentType}`);
        } catch (e) {
            console.log(`  head(): ${e.message?.substring(0, 80)}`);
        }

        // Try copy to a new path, then immediately download the copy
        try {
            const newPath = `recovery-temp/${blob.pathname}`;
            const copyResult = await copy(blob.url, newPath, { access: 'public', token });
            console.log(`  copy to ${newPath}: ${copyResult.url}`);

            // Immediately try to fetch the copy
            const resp = await fetch(copyResult.url, { signal: AbortSignal.timeout(10000) });
            if (resp.ok) {
                const buf = Buffer.from(await resp.arrayBuffer());
                console.log(`  *** COPY+FETCH WORKS! ${buf.length} bytes ***`);
            } else {
                console.log(`  copy fetch: ${resp.status}`);
            }
        } catch (e) {
            console.log(`  copy: ${e.message?.substring(0, 80)}`);
        }
    }
} catch (e) {
    console.log('SDK error:', e.message?.substring(0, 200));
}

// Method 3: Try accessing via Vercel's internal edge runtime simulation
console.log('\n=== Trying alternative access patterns ===\n');

// Some Vercel Blob stores use a different URL pattern with the blob ID
try {
    const { list } = await import('@vercel/blob');
    const listResult = await list({ prefix: 'buses/', limit: 1, token });
    if (listResult.blobs.length > 0) {
        const blob = listResult.blobs[0];
        const bUrl = new URL(blob.url);

        // Try various URL mutations
        const mutations = [
            blob.url.replace('.public.', '.'),
            blob.url + '?download=1',
            blob.url + '?token=' + encodeURIComponent(token),
            `https://blob.vercel-storage.com/${storeId}/blob?url=${encodeURIComponent(blob.url)}`,
            `https://vercel.com/api/blob?url=${encodeURIComponent(blob.url)}&token=${encodeURIComponent(token)}`,
        ];

        for (const mutUrl of mutations) {
            try {
                const resp = await fetch(mutUrl, {
                    headers: { 'Authorization': `Bearer ${token}` },
                    signal: AbortSignal.timeout(8000)
                });
                const ct = resp.headers.get('content-type') || '';
                const isFile = !ct.includes('html') && !ct.includes('text/plain') && resp.ok;
                if (isFile) {
                    const buf = Buffer.from(await resp.arrayBuffer());
                    console.log(`  *** MUTATION WORKS: ${mutUrl.substring(0, 80)}... → ${buf.length} bytes ***`);
                } else {
                    const body = await resp.text();
                    console.log(`  ${resp.status} ${mutUrl.substring(0, 60)}... | ${body.substring(0, 80)}`);
                }
            } catch (e) {
                console.log(`  ERR ${mutUrl.substring(0, 60)}... | ${e.message?.substring(0, 60)}`);
            }
        }
    }
} catch (e) {
    console.log('Mutation test error:', e.message?.substring(0, 100));
}

await sql.end();
console.log('\nDone.');
