/**
 * Last resort: Check web archive services for cached copies of blob files.
 */
import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';
import { uploadToR2 } from '../utils/r2Storage.js';

const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

const EXECUTE = process.argv.includes('--execute');

// Gather ALL unrecoverable URLs
const empPending = await sql`SELECT id, file_path as url, 'employee_documents' as tbl, 'file_path' as col, 'r2_file_path' as r2col FROM employee_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL`;
const brPending = await sql`SELECT id, file_path as url, 'branch_documents' as tbl, 'file_path' as col, 'r2_file_path' as r2col FROM branch_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL`;
const busReg = await sql`SELECT bus_id as id, registration_document_url as url, 'bus_registration_data' as tbl, 'registration_document_url' as col, 'r2_registration_document_url' as r2col FROM bus_registration_data WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL`;
const drvLic = await sql`SELECT bus_id as id, license_document_url as url, 'driver_license_data' as tbl, 'license_document_url' as col, 'r2_license_document_url' as r2col FROM driver_license_data WHERE license_document_url IS NOT NULL AND r2_license_document_url IS NULL`;
const busTr = await sql`SELECT id, lease_contract_document_url as url, 'bus_transportation' as tbl, 'lease_contract_document_url' as col, 'r2_lease_contract_document_url' as r2col FROM bus_transportation WHERE lease_contract_document_url IS NOT NULL AND r2_lease_contract_document_url IS NULL`;

const allPending = [...empPending, ...brPending, ...busReg, ...drvLic, ...busTr];
console.log(`Total unrecoverable files to check: ${allPending.length}`);
console.log(`Mode: ${EXECUTE ? 'EXECUTE' : 'CHECK ONLY'}\n`);

// Test Wayback Machine CDX API for ALL URLs
let waybackFound = 0;
let recovered = 0;

for (const row of allPending) {
    const testUrl = row.url;

    try {
        // Check CDX for archived snapshots
        const cdxUrl = `https://web.archive.org/cdx/search/cdx?url=${encodeURIComponent(testUrl)}&output=json&limit=5&filter=statuscode:200`;
        const cdxResp = await fetch(cdxUrl, { signal: AbortSignal.timeout(15000) });
        const cdxText = await cdxResp.text();

        let snapshots = [];
        try { snapshots = JSON.parse(cdxText); } catch { /* empty */ }

        if (snapshots.length > 1) { // First row is header
            waybackFound++;
            const latest = snapshots[snapshots.length - 1]; // Last (newest) snapshot
            const timestamp = latest[1]; // e.g. "20260115120000"
            const rawUrl = `https://web.archive.org/web/${timestamp}id_/${testUrl}`;

            console.log(`  FOUND in Wayback: ${row.tbl} id=${row.id} → ${timestamp}`);

            if (EXECUTE) {
                try {
                    const fileResp = await fetch(rawUrl, { signal: AbortSignal.timeout(30000), redirect: 'follow' });
                    if (fileResp.ok) {
                        const contentType = fileResp.headers.get('content-type') || 'application/octet-stream';
                        // Ensure it's not an HTML page
                        if (!contentType.includes('html')) {
                            const buffer = Buffer.from(await fileResp.arrayBuffer());

                            // Upload to R2
                            const blobPath = new URL(testUrl).pathname.slice(1);
                            const r2Url = await uploadToR2(blobPath, buffer, contentType);

                            // Update DB
                            const idCol = row.tbl === 'bus_registration_data' || row.tbl === 'driver_license_data' ? 'bus_id' : 'id';
                            await sql.unsafe(`UPDATE ${row.tbl} SET ${row.r2col} = $1 WHERE ${idCol} = $2`, [r2Url, row.id]);

                            console.log(`    → Recovered! ${buffer.length} bytes → R2 ✓`);
                            recovered++;
                        } else {
                            console.log(`    → HTML response, not actual file`);
                        }
                    } else {
                        console.log(`    → Wayback fetch failed: ${fileResp.status}`);
                    }
                } catch (e) {
                    console.log(`    → Fetch error: ${e.message?.substring(0, 80)}`);
                }
            }
        }
    } catch (e) {
        // Timeout or network error — skip
    }

    // Rate limit: 1 request per 200ms
    await new Promise(r => setTimeout(r, 200));
}

console.log(`\n=== Results ===`);
console.log(`Checked: ${allPending.length}`);
console.log(`Found in Wayback Machine: ${waybackFound}`);
if (EXECUTE) console.log(`Successfully recovered: ${recovered}`);
if (waybackFound === 0) console.log('No files were archived by the Wayback Machine.');

// Also try one CDN fetch to see if maybe CDN came back
console.log('\n=== CDN Status Check ===');
try {
    const resp = await fetch(allPending[0].url, { signal: AbortSignal.timeout(10000) });
    console.log(`CDN status: ${resp.status} ${resp.statusText}`);
    if (resp.ok) {
        console.log('*** CDN IS BACK ONLINE! Run: node scripts/migrate-to-r2.mjs --execute ***');
    }
} catch (e) {
    console.log(`CDN: ${e.message?.substring(0, 80)}`);
}

await sql.end();
