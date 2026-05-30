#!/usr/bin/env node

/**
 * Bulk R2 Migration from Local Backups
 *
 * Uses express-app/local-backup/manifest.json to identify employee documents
 * that were already downloaded locally, then uploads them to R2 and updates
 * the database — without touching Vercel at all.
 *
 * Usage:
 *   node scripts/bulk-migrate-from-local.mjs              # Report only (default, zero writes)
 *   node scripts/bulk-migrate-from-local.mjs --execute    # Upload and update DB
 *   node scripts/bulk-migrate-from-local.mjs --limit 10  # Dry run, limit rows shown in report
 *   node scripts/bulk-migrate-from-local.mjs --execute --limit 5   # Test batch of 5
 *   node scripts/bulk-migrate-from-local.mjs --execute --concurrency 3  # Parallel uploads (default: 3)
 */

import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { uploadToR2 } from '../utils/r2Storage.js';
import { isR2StorageConfigured } from '../config/r2Storage.js';

// ─── Config ──────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 0;
const CONCURRENCY = args.includes('--concurrency') ? parseInt(args[args.indexOf('--concurrency') + 1], 10) : 3;

const MANIFEST_PATH = path.resolve(import.meta.dirname, '../local-backup/manifest.json');
const LOCAL_BACKUP_BASE = path.resolve(import.meta.dirname, '../local-backup');

// Tables that have both a Vercel URL column and an R2 URL column
const ALL_TABLES = [
    { name: 'employee_documents', urlCol: 'file_path', r2Col: 'r2_file_path', idCol: 'id' },
    { name: 'branch_documents', urlCol: 'file_path', r2Col: 'r2_file_path', idCol: 'id' },
    { name: 'treatment_plans', urlCol: 'file_url', r2Col: 'r2_url', idCol: 'id' },
    { name: 'requests', urlCol: 'attachment_url', r2Col: 'r2_attachment_url', idCol: 'id' },
    { name: 'requests', urlCol: 'response_attachment_url', r2Col: 'r2_response_attachment_url', idCol: 'id', label: 'requests (response attachments)' },
    { name: 'notifications', urlCol: 'attachment_url', r2Col: 'r2_attachment_url', idCol: 'id' },
    { name: 'bus_registration_data', urlCol: 'registration_document_url', r2Col: 'r2_registration_document_url', idCol: 'bus_id' },
    { name: 'driver_license_data', urlCol: 'license_document_url', r2Col: 'r2_license_document_url', idCol: 'bus_id' },
    { name: 'bus_transportation', urlCol: 'lease_contract_document_url', r2Col: 'r2_lease_contract_document_url', idCol: 'id' },
];

const VERCEL_DOMAIN = 'public.blob.vercel-storage.com';

// ─── Database ─────────────────────────────────────────────────────────────────

const sql = process.env.DATABASE_URL
    ? postgres(process.env.DATABASE_URL, { ssl: 'require', max: 5, idle_timeout: 30, connect_timeout: 15 })
    : postgres({
        host: process.env.DATABASE_HOST,
        database: process.env.DATABASE_NAME,
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        ssl: 'require', max: 5, idle_timeout: 30, connect_timeout: 15,
    });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isVercelUrl(url) {
    return url && url.includes(VERCEL_DOMAIN);
}

function extractR2Key(vercelUrl) {
    try {
        return new URL(vercelUrl).pathname.slice(1); // strip leading /
    } catch {
        return null;
    }
}

function guessMime(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }[ext] || 'application/octet-stream';
}

/** Run N async tasks at a time from an array of factory functions */
async function runConcurrent(factories, concurrency) {
    const results = [];
    let i = 0;
    async function worker() {
        while (i < factories.length) {
            const idx = i++;
            results[idx] = await factories[idx]();
        }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, factories.length) }, worker));
    return results;
}

// ─── Load manifest ────────────────────────────────────────────────────────────

function loadManifest() {
    if (!fs.existsSync(MANIFEST_PATH)) {
        console.error(`ERROR: Manifest not found at ${MANIFEST_PATH}`);
        process.exit(1);
    }
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
    // Build map: doc_id → manifest entry (only downloaded entries with a local_path)
    const map = new Map();
    for (const entry of raw.documents) {
        if (entry.status === 'downloaded' && entry.local_path) {
            map.set(entry.doc_id, entry);
        }
    }
    return { stats: raw.stats, map, total: raw.documents.length };
}

// ─── Table status query ───────────────────────────────────────────────────────

async function queryTableStatus(tableConf) {
    const { name, urlCol, r2Col } = tableConf;
    try {
        const [row] = await sql.unsafe(`
            SELECT
                COUNT(*) FILTER (WHERE ${urlCol} IS NOT NULL)                              AS total_with_file,
                COUNT(*) FILTER (WHERE ${urlCol} IS NOT NULL AND ${r2Col} IS NOT NULL)     AS on_r2,
                COUNT(*) FILTER (WHERE ${urlCol} IS NOT NULL AND ${r2Col} IS NULL
                                  AND ${urlCol} LIKE '%${VERCEL_DOMAIN}%')                  AS on_vercel_only
            FROM ${name}
        `);
        return {
            total: parseInt(row.total_with_file),
            onR2: parseInt(row.on_r2),
            vercelOnly: parseInt(row.on_vercel_only),
        };
    } catch (err) {
        return { total: 0, onR2: 0, vercelOnly: 0, error: err.message };
    }
}

// ─── Report ───────────────────────────────────────────────────────────────────

async function printReport(manifestData) {
    const { stats: mStats, map: manifestMap, total: manifestTotal } = manifestData;

    console.log('\n╔══════════════════════════════════════════════════════════════╗');
    console.log('║              R2 Migration Status Report                     ║');
    console.log(`║  Generated: ${new Date().toISOString()}              ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    // ── employee_documents: cross-reference with manifest ──
    const empRows = await sql`
        SELECT id, r2_file_path, file_path
        FROM employee_documents
        WHERE file_path IS NOT NULL
    `;

    let empTotal = empRows.length;
    let empOnR2 = 0;
    let empReadyUpload = 0;
    let empBackupFailed = 0;
    let empNoBackup = 0;

    for (const row of empRows) {
        if (row.r2_file_path) {
            empOnR2++;
            continue;
        }
        const entry = manifestMap.get(row.id);
        if (!entry) {
            empNoBackup++;
        } else {
            // entry exists and status=downloaded (only downloaded entries are in the map)
            const absPath = path.join(LOCAL_BACKUP_BASE, entry.local_path.replace(/\\/g, path.sep));
            if (fs.existsSync(absPath)) {
                empReadyUpload++;
            } else {
                empBackupFailed++;
            }
        }
    }

    // Also count manifest "failed" entries for context
    const manifestFailed = mStats.failed;

    console.log('TABLE: employee_documents  (primary bulk-upload source)');
    console.log(`  Total active records:                  ${empTotal}`);
    console.log(`  Already on R2:                         ${empOnR2}  (${pct(empOnR2, empTotal)})`);
    console.log(`  Ready to bulk-upload (local file OK):  ${empReadyUpload}  (${pct(empReadyUpload, empTotal)})`);
    console.log(`  Backup downloaded but file missing:    ${empBackupFailed}`);
    console.log(`  Not in backup (Vercel CDN failed):     ${empNoBackup}`);
    console.log(`  → Manifest: ${manifestTotal} total, ${mStats.downloaded} downloaded, ${manifestFailed} failed\n`);

    // ── All other tables ──
    let grandTotal = empTotal, grandOnR2 = empOnR2, grandVercelOnly = 0;
    grandVercelOnly += (empReadyUpload + empBackupFailed + empNoBackup);

    const seen = new Set(['employee_documents']);
    for (const t of ALL_TABLES) {
        if (seen.has(t.label || t.name)) continue;
        seen.add(t.label || t.name);

        const s = await queryTableStatus(t);
        const label = t.label || t.name;
        if (s.error) {
            console.log(`TABLE: ${label}  ⚠ Query error: ${s.error}`);
            continue;
        }
        const pending = s.total - s.onR2;
        console.log(`TABLE: ${label}`);
        console.log(`  Total: ${s.total}  |  On R2: ${s.onR2} (${pct(s.onR2, s.total)})  |  Pending: ${pending} (lazy migration)`);
        console.log('');

        grandTotal += s.total;
        grandOnR2 += s.onR2;
        grandVercelOnly += s.vercelOnly;
    }

    const grandPct = pct(grandOnR2, grandTotal);
    console.log('══════════════════════════════════════════════════════════════');
    console.log('  OVERALL MIGRATION PROGRESS');
    console.log('══════════════════════════════════════════════════════════════');
    console.log(`  Total file records across all tables:  ${grandTotal}`);
    console.log(`  Already on R2:                         ${grandOnR2}  (${grandPct})`);
    console.log(`  Not yet on R2 (Vercel or no URL):      ${grandTotal - grandOnR2}`);
    console.log(`  Bulk-uploadable right now (employee):  ${empReadyUpload}`);
    console.log('══════════════════════════════════════════════════════════════');

    return { empReadyUpload, empTotal, empOnR2 };
}

function pct(n, total) {
    if (!total) return '0.0%';
    return ((n / total) * 100).toFixed(1) + '%';
}

// ─── Execute: upload employee docs from local backup ─────────────────────────

async function executeMigration(manifestMap) {
    // Fetch all employee_documents that still need R2 migration
    const rows = await sql`
        SELECT id, file_path, r2_file_path
        FROM employee_documents
        WHERE file_path IS NOT NULL
          AND r2_file_path IS NULL
        ORDER BY id
    `;

    // Cross-reference with manifest to find uploadable rows
    const uploadable = [];
    for (const row of rows) {
        const entry = manifestMap.get(row.id);
        if (!entry) continue; // no backup

        const absPath = path.join(LOCAL_BACKUP_BASE, entry.local_path.replace(/\\/g, path.sep));
        if (!fs.existsSync(absPath)) continue; // file missing on disk

        uploadable.push({ row, entry, absPath });
    }

    const total = LIMIT > 0 ? Math.min(LIMIT, uploadable.length) : uploadable.length;
    const batch = uploadable.slice(0, total);

    console.log(`\n→ ${uploadable.length} uploadable records found`);
    if (LIMIT > 0) console.log(`  (limited to ${total} by --limit)`);
    console.log(`  Concurrency: ${CONCURRENCY}\n`);

    if (batch.length === 0) {
        console.log('Nothing to upload.');
        return { success: 0, failed: 0, skipped: 0 };
    }

    let success = 0, failed = 0;
    const failures = [];

    const factories = batch.map(({ row, entry, absPath }, idx) => async () => {
        const docId = row.id;
        const prefix = `  [${idx + 1}/${total}] id=${docId}`;

        // Determine R2 key from original Vercel URL
        const r2Key = extractR2Key(entry.original_url || row.file_path);
        if (!r2Key) {
            process.stdout.write(`${prefix} ✗ Cannot extract R2 key\n`);
            failed++;
            failures.push({ id: docId, reason: 'Cannot extract R2 key' });
            return;
        }

        // Read local file
        let buffer;
        try {
            buffer = fs.readFileSync(absPath);
        } catch (err) {
            process.stdout.write(`${prefix} ✗ Cannot read local file: ${err.message}\n`);
            failed++;
            failures.push({ id: docId, reason: `Read error: ${err.message}` });
            return;
        }

        const contentType = entry.content_type || guessMime(absPath);
        const sizeKb = (buffer.length / 1024).toFixed(1);

        // Upload to R2
        let r2Url;
        try {
            r2Url = await uploadToR2(r2Key, buffer, contentType);
        } catch (err) {
            process.stdout.write(`${prefix} ✗ R2 upload failed: ${err.message}\n`);
            failed++;
            failures.push({ id: docId, reason: `R2 upload: ${err.message}` });
            return;
        }

        // Update DB — only after confirmed upload
        try {
            await sql`
                UPDATE employee_documents
                SET r2_file_path = ${r2Url}
                WHERE id = ${docId} AND r2_file_path IS NULL
            `;
        } catch (err) {
            process.stdout.write(`${prefix} ✗ DB update failed: ${err.message}\n`);
            failed++;
            failures.push({ id: docId, reason: `DB update: ${err.message}` });
            return;
        }

        process.stdout.write(`${prefix} ✓  ${sizeKb} KB  →  ${r2Key}\n`);
        success++;
    });

    await runConcurrent(factories, CONCURRENCY);

    console.log('\n──────────────────────────────────────────────────────────────');
    console.log(`  Uploaded:  ${success}/${total}`);
    console.log(`  Failed:    ${failed}`);
    if (failures.length > 0) {
        console.log(`  Failed IDs: ${failures.map(f => f.id).join(', ')}`);
    }
    console.log('──────────────────────────────────────────────────────────────');

    return { success, failed };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║           Bulk R2 Migration — Local Backup Source           ║');
    console.log(`║  Mode: ${EXECUTE ? 'EXECUTE (writing to R2 + DB)          ' : 'REPORT ONLY (no writes)              '}       ║`);
    if (LIMIT) console.log(`║  Limit: ${String(LIMIT).padEnd(53)}║`);
    console.log('╚══════════════════════════════════════════════════════════════╝');

    if (!isR2StorageConfigured()) {
        console.error('\nERROR: R2 Storage is not configured.');
        console.error('  Set R2_Access_Key_ID, Secret_Access_Key, Account_ID env vars.\n');
        process.exit(1);
    }

    const manifestData = loadManifest();
    console.log(`\nManifest loaded: ${manifestData.map.size} downloaded entries (of ${manifestData.total} total)\n`);

    const reportData = await printReport(manifestData);

    if (EXECUTE) {
        console.log('\n\n═══════════════════════ EXECUTING UPLOAD ═══════════════════════\n');
        await executeMigration(manifestData.map);
        console.log('\n\n═══════════════════════ POST-MIGRATION REPORT ══════════════════\n');
        await printReport(manifestData);
    } else {
        console.log('\n  ⚠  This was a REPORT ONLY run.');
        console.log('     Run with --execute to start uploading.\n');
        if (reportData.empReadyUpload > 0) {
            console.log(`     Tip: test with --execute --limit 5 first, then run without --limit.\n`);
        }
    }

    await sql.end();
}

main().catch((err) => {
    console.error('\nFatal error:', err.message);
    sql.end().then(() => process.exit(1));
});
