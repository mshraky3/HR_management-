/**
 * Novel technique #2: Use the Vercel Blob API directly (not CDN) to download content.
 * Since head() and copy() work through the API, the underlying store IS accessible.
 * We just need to find the right API call to get the content bytes.
 */
import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';

const token = process.env.BLOB_READ_WRITE_TOKEN;
const apiToken = process.env.VERCEL_API_TOKEN;
const BLOB_API = 'https://vercel.com/api/blob';

const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

// Get a sample URL
const [sample] = await sql`
  SELECT bus_id, registration_document_url FROM bus_registration_data 
  WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL
  LIMIT 1`;
const testUrl = sample.registration_document_url;
console.log('Test URL:', testUrl);

// head() uses the API successfully — let's see the exact response
const { head } = await import('@vercel/blob');
const headResult = await head(testUrl, { token });
console.log('\nhead() result:', JSON.stringify(headResult, null, 2));

console.log('\n=== Technique 1: API GET with Authorization header ===');
// The head() function calls GET on the API. Let's try the same for content.
const apiEndpoints = [
    // Direct READ from API (like head does, but requesting body)
    { name: 'API GET url param', method: 'GET', url: `${BLOB_API}?url=${encodeURIComponent(testUrl)}`, headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' } },
    { name: 'API GET accept:*/*', method: 'GET', url: `${BLOB_API}?url=${encodeURIComponent(testUrl)}`, headers: { authorization: `Bearer ${token}`, 'x-api-version': '12', 'accept': '*/*' } },
    { name: 'API GET download', method: 'GET', url: `${BLOB_API}/download?url=${encodeURIComponent(testUrl)}`, headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' } },
    { name: 'API GET blob/read', method: 'GET', url: `${BLOB_API}/read?url=${encodeURIComponent(testUrl)}`, headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' } },
    { name: 'API GET content', method: 'GET', url: `${BLOB_API}/content?url=${encodeURIComponent(testUrl)}`, headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' } },
];

for (const ep of apiEndpoints) {
    try {
        const resp = await fetch(ep.url, { method: ep.method, headers: ep.headers, signal: AbortSignal.timeout(10000) });
        const ct = resp.headers.get('content-type') || '';
        const body = await resp.arrayBuffer();
        const size = body.byteLength;
        const isJson = ct.includes('json');
        const txt = isJson || size < 1000 ? Buffer.from(body).toString('utf8').substring(0, 200) : `[binary ${size} bytes]`;
        console.log(`  ${ep.name}: ${resp.status} type=${ct} size=${size} | ${txt}`);
        if (size > 1000 && !isJson) {
            console.log('  *** POSSIBLE SUCCESS! ***');
        }
    } catch (e) {
        console.log(`  ${ep.name}: ERROR ${e.message?.substring(0, 100)}`);
    }
}

console.log('\n=== Technique 2: copy() then use Vercel API token endpoint ===');
// The Vercel API token might give access to blob store via REST API
try {
    const endpoints = [
        { name: 'Vercel REST stores', url: `https://api.vercel.com/v1/blob/stores`, headers: { authorization: `Bearer ${apiToken}` } },
        { name: 'Vercel REST store', url: `https://api.vercel.com/v1/blob/stores/store_KxL4WUwiujBzAiXs`, headers: { authorization: `Bearer ${apiToken}` } },
        { name: 'Vercel v9 stores', url: `https://api.vercel.com/v9/blob/stores`, headers: { authorization: `Bearer ${apiToken}` } },
        { name: 'Vercel v2 blobs', url: `https://api.vercel.com/v2/blob?tokenName=hr-blob-readwrite&limit=2`, headers: { authorization: `Bearer ${apiToken}` } },
    ];
    for (const ep of endpoints) {
        const resp = await fetch(ep.url, { headers: ep.headers, signal: AbortSignal.timeout(10000) });
        const body = await resp.text();
        console.log(`  ${ep.name}: ${resp.status} | ${body.substring(0, 200)}`);
    }
} catch (e) {
    console.log('  Error:', e.message?.substring(0, 100));
}

console.log('\n=== Technique 3: Blob API list with includeContent ===');
// Some blob APIs support listing with content inline
try {
    const { list } = await import('@vercel/blob');

    // Try listing with download URL and see if that's different
    const result = await list({ prefix: 'buses/', limit: 1, token });
    const blob = result.blobs[0];

    // Try various download URL patterns
    const downloadPatterns = [
        blob.downloadUrl,
        blob.url.replace('blob.vercel-storage.com', 'blob-download.vercel-storage.com'),
        `${BLOB_API}?url=${encodeURIComponent(blob.url)}&action=download`,
        `${BLOB_API}?url=${encodeURIComponent(blob.url)}&mode=content`,
    ];

    for (const url of downloadPatterns) {
        try {
            const resp = await fetch(url, {
                headers: { authorization: `Bearer ${token}`, 'x-api-version': '12' },
                signal: AbortSignal.timeout(8000)
            });
            const ct = resp.headers.get('content-type') || '';
            const size = parseInt(resp.headers.get('content-length') || '0');
            const isFile = resp.ok && !ct.includes('html') && !ct.includes('json') && size > 1000;
            if (isFile) {
                console.log(`  *** WORKS: ${url.substring(0, 80)} → ${size} bytes, type=${ct} ***`);
            } else {
                const body = await resp.text();
                console.log(`  ${resp.status} ${url.substring(0, 70)}... | ${body.substring(0, 100)}`);
            }
        } catch (e) {
            console.log(`  ERR ${url.substring(0, 70)}... | ${e.message?.substring(0, 60)}`);
        }
    }
} catch (e) {
    console.log('  Error:', e.message?.substring(0, 100));
}

console.log('\n=== Technique 4: Fetch through Vercel Edge function simulation ===');
// The SDK's get() function sends Authorization header. Maybe that's all we need
// but the issue is the CDN host itself is 503. What if we add specific headers?
try {
    const { list } = await import('@vercel/blob');
    const result = await list({ prefix: 'buses/', limit: 1, token });
    const blob = result.blobs[0];

    const headerSets = [
        { name: 'x-vercel-internal', headers: { authorization: `Bearer ${token}`, 'x-vercel-internal': '1', 'x-vercel-blob-mode': 'streamed' } },
        { name: 'range-request', headers: { authorization: `Bearer ${token}`, 'Range': 'bytes=0-' } },
        { name: 'vercel-forwarded', headers: { authorization: `Bearer ${token}`, 'x-forwarded-host': 'vercel.com', 'x-vercel-skip-toolbar': '1' } },
        { name: 'cf-connecting-ip', headers: { authorization: `Bearer ${token}`, 'cf-connecting-ip': '127.0.0.1', 'x-real-ip': '127.0.0.1' } },
    ];

    for (const hs of headerSets) {
        try {
            const resp = await fetch(blob.url, { headers: hs.headers, signal: AbortSignal.timeout(8000) });
            const ct = resp.headers.get('content-type') || '';
            if (resp.ok && !ct.includes('html') && !ct.includes('text/plain')) {
                const buf = Buffer.from(await resp.arrayBuffer());
                console.log(`  *** ${hs.name} WORKS: ${buf.length} bytes ***`);
            } else {
                console.log(`  ${hs.name}: ${resp.status} type=${ct}`);
            }
        } catch (e) {
            console.log(`  ${hs.name}: ${e.message?.substring(0, 80)}`);
        }
    }
} catch (e) {
    console.log('  Error:', e.message?.substring(0, 100));
}

console.log('\n=== Technique 5: Copy to a DIFFERENT blob store ===');
// What if we set up a second blob store and copy from the broken one?
// We can't create one, but we can try the API endpoint with a fake target.
console.log('  Skipped (requires second blob store — not available)');

console.log('\n=== Technique 6: Use proxy/redirect API ===');
// What if there's a Vercel redirect API that proxies blob content?
try {
    const { list } = await import('@vercel/blob');
    const result = await list({ prefix: 'buses/', limit: 1, token });
    const blob = result.blobs[0];

    const proxyUrls = [
        `https://vercel.com/api/blob/proxy?url=${encodeURIComponent(blob.url)}`,
        `https://vercel.com/api/edge/blob?url=${encodeURIComponent(blob.url)}`,
        `https://vercel.com/api/blob/stores/store_KxL4WUwiujBzAiXs/blobs/${encodeURIComponent(blob.pathname)}`,
    ];

    for (const url of proxyUrls) {
        try {
            const resp = await fetch(url, {
                headers: { authorization: `Bearer ${token}` },
                signal: AbortSignal.timeout(8000),
                redirect: 'manual'
            });
            const location = resp.headers.get('location');
            const ct = resp.headers.get('content-type') || '';
            const body = await resp.text();
            console.log(`  ${resp.status} ${url.substring(0, 70)}... | location=${location} | ${body.substring(0, 100)}`);
        } catch (e) {
            console.log(`  ERR ${url.substring(0, 70)}... | ${e.message?.substring(0, 60)}`);
        }
    }
} catch (e) {
    console.log('  Error:', e.message?.substring(0, 100));
}

await sql.end();
console.log('\nDone.');
