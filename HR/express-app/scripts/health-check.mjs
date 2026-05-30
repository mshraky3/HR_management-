/**
 * System Health Check
 * Tests: DB connection, DB schema, migration status, Vercel Blob, R2 Storage
 *
 * Run: node scripts/health-check.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import { S3Client, ListBucketsCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { put, del } from '@vercel/blob';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const BOLD = '\x1b[1m';

function pass(label) { console.log(`  ${GREEN}✓${RESET} ${label}`); }
function fail(label, err) { console.log(`  ${RED}✗${RESET} ${label}: ${RED}${err}${RESET}`); }
function warn(label, msg) { console.log(`  ${YELLOW}⚠${RESET} ${label}: ${YELLOW}${msg}${RESET}`); }
function section(title) { console.log(`\n${BOLD}${CYAN}── ${title} ──${RESET}`); }

const results = { passed: 0, failed: 0, warned: 0 };

function ok(label) { pass(label); results.passed++; }
function err(label, e) { fail(label, e?.message || e); results.failed++; }
function wn(label, msg) { warn(label, msg); results.warned++; }

// ─── 1. Environment Variables ────────────────────────────────────────────────
section('Environment Variables');

const required = {
    DATABASE_URL: process.env.DATABASE_URL,
    BLOB_READ_WRITE_TOKEN: process.env.BLOB_READ_WRITE_TOKEN,
    R2_Access_Key_ID: process.env.R2_Access_Key_ID,
    Secret_Access_Key: process.env.Secret_Access_Key,
    Account_ID: process.env.Account_ID,
    R2_Public_Development_URL: process.env.R2_Public_Development_URL,
};

let envOk = true;
for (const [key, val] of Object.entries(required)) {
    if (val) { ok(`${key} is set`); }
    else { err(`${key} missing`, { message: 'not set in .env' }); envOk = false; }
}

// ─── 2. Database Connection ───────────────────────────────────────────────────
section('Database Connection');

let sql;
try {
    sql = postgres(process.env.DATABASE_URL, { ssl: 'require', max: 2, connect_timeout: 10 });
    const [row] = await sql`SELECT NOW() AS now, current_database() AS db`;
    ok(`Connected  →  db="${row.db}"  time=${row.now.toISOString()}`);
} catch (e) {
    err('Connect to database', e);
    process.exit(1);
}

// ─── 3. Schema checks ─────────────────────────────────────────────────────────
section('Schema & Constraints');

// Check employee_documents table exists
try {
    const [tbl] = await sql`
    SELECT COUNT(*) AS cnt FROM information_schema.tables
    WHERE table_name = 'employee_documents'`;
    if (parseInt(tbl.cnt) > 0) ok('Table employee_documents exists');
    else err('Table employee_documents', { message: 'table not found' });
} catch (e) { err('Table employee_documents', e); }

// Check uploaded_by FK — should NOT exist after migration 017
try {
    const rows = await sql`
    SELECT constraint_name FROM information_schema.table_constraints
    WHERE table_name = 'employee_documents'
      AND constraint_name = 'employee_documents_uploaded_by_fkey'`;
    if (rows.length === 0) {
        ok('FK employee_documents_uploaded_by_fkey is DROPPED (migration 017 applied)');
    } else {
        err('FK employee_documents_uploaded_by_fkey still exists — run migration 017',
            { message: 'node database/migrations/017-drop-uploaded-by-fkey.js' });
    }
} catch (e) { err('Check uploaded_by FK', e); }

// Check schema_migrations table for migration 017
try {
    const rows = await sql`
    SELECT name FROM schema_migrations WHERE name = '017-drop-uploaded-by-fkey.js'`;
    if (rows.length > 0) ok('Migration 017 recorded in schema_migrations');
    else wn('Migration 017', 'not yet in schema_migrations — run migration runner or the file directly');
} catch (e) { wn('schema_migrations check', e.message); }

// Row counts for key tables
try {
    const tables = ['users', 'branches', 'employees', 'employee_documents', 'branch_documents'];
    for (const t of tables) {
        const [r] = await sql`SELECT COUNT(*) AS cnt FROM ${sql(t)}`;
        ok(`${t}: ${r.cnt} rows`);
    }
} catch (e) { err('Row counts', e); }

// ─── 4. Vercel Blob Storage ───────────────────────────────────────────────────
section('Vercel Blob Storage');

const blobToken = process.env.BLOB_READ_WRITE_TOKEN;
if (!blobToken) {
    wn('Blob upload test', 'skipped — BLOB_READ_WRITE_TOKEN not set');
} else {
    const testPath = `health-check/test-${Date.now()}.txt`;
    let blobUrl;
    try {
        const result = await put(testPath, Buffer.from('health-check'), {
            access: 'public',
            contentType: 'text/plain',
            addRandomSuffix: false,
            token: blobToken,
        });
        blobUrl = result.url;
        ok(`Upload test file  →  ${blobUrl}`);
    } catch (e) { err('Blob upload', e); }

    if (blobUrl) {
        try {
            await del(blobUrl, { token: blobToken });
            ok('Delete test file from Blob');
        } catch (e) { wn('Blob delete', e.message); }
    }
}

// ─── 5. Cloudflare R2 Storage ─────────────────────────────────────────────────
section('Cloudflare R2 Storage');

const r2Key = process.env.R2_Access_Key_ID;
const r2Secret = process.env.Secret_Access_Key;
const r2Account = process.env.Account_ID;

if (!r2Key || !r2Secret || !r2Account) {
    wn('R2 upload test', 'skipped — R2 credentials not set');
} else {
    const r2Client = new S3Client({
        region: 'auto',
        endpoint: `https://${r2Account}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId: r2Key, secretAccessKey: r2Secret },
    });

    const testKey = `health-check/test-${Date.now()}.txt`;
    try {
        await r2Client.send(new PutObjectCommand({
            Bucket: 'hr1',
            Key: testKey,
            Body: Buffer.from('health-check'),
            ContentType: 'text/plain',
        }));
        ok(`R2 upload test file  →  hr1/${testKey}`);

        await r2Client.send(new DeleteObjectCommand({ Bucket: 'hr1', Key: testKey }));
        ok('R2 delete test file');
    } catch (e) {
        err('R2 upload/delete', e);
    }
}

// ─── 6. Summary ───────────────────────────────────────────────────────────────
section('Summary');
console.log(`  ${GREEN}Passed:${RESET}  ${results.passed}`);
console.log(`  ${YELLOW}Warned:${RESET}  ${results.warned}`);
console.log(`  ${RED}Failed:${RESET}  ${results.failed}`);

if (results.failed > 0) {
    console.log(`\n${RED}${BOLD}Some checks failed — review above.${RESET}`);
    process.exit(1);
} else if (results.warned > 0) {
    console.log(`\n${YELLOW}${BOLD}All critical checks passed, with warnings.${RESET}`);
} else {
    console.log(`\n${GREEN}${BOLD}All checks passed.${RESET}`);
}

await sql.end();
