#!/usr/bin/env node

/**
 * Migration Script: Copy all existing Vercel Blob files to Cloudflare R2
 * 
 * Queries all tables with file URLs that don't have R2 URLs yet,
 * fetches the file content (from Vercel CDN or local backups),
 * uploads to R2, and updates the DB with the R2 URL.
 * 
 * Usage:
 *   node scripts/migrate-to-r2.mjs                    # Dry run (default)
 *   node scripts/migrate-to-r2.mjs --execute          # Actually migrate
 *   node scripts/migrate-to-r2.mjs --execute --table employee_documents
 *   node scripts/migrate-to-r2.mjs --execute --limit 50
 *   node scripts/migrate-to-r2.mjs --execute --backup-only   # Only use local backups (skip Vercel fetch)
 */

import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { uploadToR2 } from '../utils/r2Storage.js';
import { isR2StorageConfigured } from '../config/r2Storage.js';

// --- Configuration ---
const VERCEL_BLOB_DOMAIN = 'kxl4wuwiujbzaixs.public.blob.vercel-storage.com';
const BACKUP_BASE = path.resolve(import.meta.dirname, '../../backup-system/backups');

const args = process.argv.slice(2);
const DRY_RUN = !args.includes('--execute');
const BACKUP_ONLY = args.includes('--backup-only');
const TABLE_FILTER = args.includes('--table') ? args[args.indexOf('--table') + 1] : null;
const LIMIT = args.includes('--limit') ? parseInt(args[args.indexOf('--limit') + 1], 10) : 0;

// --- Database Connection ---
const sql = process.env.DATABASE_URL
    ? postgres(process.env.DATABASE_URL, {
        ssl: 'require',
        max: 5,
        idle_timeout: 30,
        connect_timeout: 10,
    })
    : postgres({
        host: process.env.DATABASE_HOST,
        database: process.env.DATABASE_NAME,
        username: process.env.DATABASE_USER,
        password: process.env.DATABASE_PASSWORD,
        ssl: 'require',
        max: 5,
        idle_timeout: 30,
        connect_timeout: 10,
    });

// --- Table Definitions ---
// Each entry defines: table, id column, URL column, R2 URL column, and optional backup resolver
const TABLES = [
    {
        name: 'employee_documents',
        idCol: 'id',
        urlCol: 'file_path',
        r2Col: 'r2_file_path',
        extraSelect: 'employee_id, document_type',
        resolveBackup: (row) => {
            // Try exact match first: employee-documents/{employeeId}/{docType}/{docId}.ext
            const ext = guessExtension(row.file_path);
            const exactPath = path.join(BACKUP_BASE, 'employee-documents', String(row.employee_id), row.document_type, `${row.id}${ext}`);
            if (fs.existsSync(exactPath)) return exactPath;

            // Fallback: use any file in the directory (backup IDs don't always match DB IDs)
            const dir = path.join(BACKUP_BASE, 'employee-documents', String(row.employee_id), row.document_type);
            if (fs.existsSync(dir)) {
                const files = fs.readdirSync(dir).filter(f => !f.startsWith('.'));
                if (files.length > 0) return path.join(dir, files[0]);
            }
            return null;
        },
    },
    {
        name: 'branch_documents',
        idCol: 'id',
        urlCol: 'file_path',
        r2Col: 'r2_file_path',
        extraSelect: 'branch_id, document_type',
        resolveBackup: (row) => {
            // Try exact match: branch-documents/{branchId}/{docType}/{docId}.ext
            const ext = guessExtension(row.file_path);
            const base = path.join(BACKUP_BASE, 'branch-documents', String(row.branch_id), row.document_type);
            const filePath1 = path.join(base, `${row.id}${ext}`);
            const filePath2 = path.join(base, `${row.id}.${ext}`);
            if (fs.existsSync(filePath1)) return filePath1;
            if (fs.existsSync(filePath2)) return filePath2;

            // Fallback: use any file in the directory
            if (fs.existsSync(base)) {
                const files = fs.readdirSync(base).filter(f => !f.startsWith('.'));
                if (files.length > 0) return path.join(base, files[0]);
            }
            return null;
        },
    },
    {
        name: 'requests',
        idCol: 'id',
        urlCol: 'attachment_url',
        r2Col: 'r2_attachment_url',
        extraSelect: null,
        resolveBackup: () => null, // No local backups for request attachments
    },
    {
        name: 'requests',
        idCol: 'id',
        urlCol: 'response_attachment_url',
        r2Col: 'r2_response_attachment_url',
        extraSelect: null,
        resolveBackup: () => null,
        // Separate entry because a single row can have both attachment_url and response_attachment_url
        tableLabel: 'requests (response attachments)',
    },
    {
        name: 'notifications',
        idCol: 'id',
        urlCol: 'attachment_url',
        r2Col: 'r2_attachment_url',
        extraSelect: null,
        resolveBackup: () => null,
    },
    {
        name: 'bus_registration_data',
        idCol: 'bus_id',
        urlCol: 'registration_document_url',
        r2Col: 'r2_registration_document_url',
        extraSelect: null,
        resolveBackup: () => null,
    },
    {
        name: 'driver_license_data',
        idCol: 'bus_id',
        urlCol: 'license_document_url',
        r2Col: 'r2_license_document_url',
        extraSelect: null,
        resolveBackup: () => null,
    },
    {
        name: 'bus_transportation',
        idCol: 'id',
        urlCol: 'lease_contract_document_url',
        r2Col: 'r2_lease_contract_document_url',
        extraSelect: null,
        resolveBackup: () => null,
    },
];

// --- Utility Functions ---

function guessExtension(url) {
    if (!url) return '.pdf';
    const clean = url.replace(/\.[a-z]{3,4}$/i, (m) => m); // keep last extension
    const match = url.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
    if (match) return '.' + match[1].toLowerCase();
    return '.pdf';
}

function extractBlobPath(blobUrl) {
    // From: https://kxl4wuwiujbzaixs.public.blob.vercel-storage.com/employees/100/id_or_residency/file.pdf
    // To:   employees/100/id_or_residency/file.pdf
    try {
        const url = new URL(blobUrl);
        return url.pathname.slice(1); // remove leading /
    } catch {
        return null;
    }
}

function guessMimeType(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const mimeMap = {
        '.pdf': 'application/pdf',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.gif': 'image/gif',
        '.doc': 'application/msword',
        '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        '.xls': 'application/vnd.ms-excel',
        '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
    return mimeMap[ext] || 'application/octet-stream';
}

async function fetchFromVercel(blobUrl) {
    // Method 1: Try Vercel SDK get() with token (authenticated, may bypass CDN)
    try {
        const { get } = await import('@vercel/blob');
        const token = process.env.BLOB_READ_WRITE_TOKEN;
        if (token) {
            const result = await get(blobUrl, { access: 'public', token });
            if (result && result.stream) {
                const chunks = [];
                for await (const chunk of result.stream) {
                    chunks.push(chunk);
                }
                const buffer = Buffer.concat(chunks);
                const contentType = result.blob?.contentType || 'application/octet-stream';
                return { buffer, contentType, method: 'sdk-get' };
            }
        }
    } catch {
        // SDK get() failed
    }

    // Method 2: Try plain fetch on original URL
    try {
        const response = await fetch(blobUrl);
        if (response.ok) {
            const buffer = Buffer.from(await response.arrayBuffer());
            const contentType = response.headers.get('content-type') || 'application/octet-stream';
            return { buffer, contentType, method: 'cdn-fetch' };
        }
    } catch {
        // CDN fetch failed
    }
    return null;
}

function readLocalBackup(localPath) {
    try {
        const buffer = fs.readFileSync(localPath);
        const contentType = guessMimeType(localPath);
        return { buffer, contentType };
    } catch {
        return null;
    }
}

// --- Main Migration ---

async function migrateTable(tableConfig) {
    const { name, idCol, urlCol, r2Col, extraSelect, resolveBackup, tableLabel } = tableConfig;
    const label = tableLabel || name;

    // Build SELECT query
    const selectCols = [idCol, urlCol, r2Col];
    if (extraSelect) selectCols.push(extraSelect);

    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const rows = await sql.unsafe(
        `SELECT ${selectCols.join(', ')} FROM ${name} WHERE ${urlCol} IS NOT NULL AND ${r2Col} IS NULL ${limitClause}`
    );

    if (rows.length === 0) {
        console.log(`  ✓ ${label}: No rows to migrate`);
        return { total: 0, success: 0, failed: 0, skipped: 0 };
    }

    console.log(`  → ${label}: ${rows.length} rows to migrate`);

    let success = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const row of rows) {
        const blobUrl = row[urlCol];
        const id = row[idCol];

        if (!blobUrl) {
            skipped++;
            continue;
        }

        // Determine R2 key from blob URL path
        const r2Key = extractBlobPath(blobUrl);
        if (!r2Key) {
            console.log(`    ✗ [${id}] Cannot extract key from URL: ${blobUrl.substring(0, 80)}`);
            failed++;
            failures.push({ id, reason: 'Cannot extract key from URL' });
            continue;
        }

        if (DRY_RUN) {
            const backupPath = resolveBackup ? resolveBackup(row) : null;
            console.log(`    [DRY] id=${id} key=${r2Key} backup=${backupPath ? 'YES' : 'NO'}`);
            success++;
            continue;
        }

        // Fetch file content
        let fileData = null;

        // Try Vercel first (unless --backup-only)
        if (!BACKUP_ONLY) {
            fileData = await fetchFromVercel(blobUrl);
            if (fileData) {
                process.stdout.write(`    ✓ [${id}] Vercel → `);
            }
        }

        // Fall back to local backup
        if (!fileData && resolveBackup) {
            const backupPath = resolveBackup(row);
            if (backupPath) {
                fileData = readLocalBackup(backupPath);
                if (fileData) {
                    process.stdout.write(`    ✓ [${id}] Backup → `);
                }
            }
        }

        if (!fileData) {
            console.log(`    ✗ [${id}] No source available for: ${blobUrl.substring(0, 80)}`);
            failed++;
            failures.push({ id, reason: 'No source available', url: blobUrl });
            continue;
        }

        // Upload to R2
        try {
            const r2Url = await uploadToR2(r2Key, fileData.buffer, fileData.contentType);

            // Update DB
            await sql.unsafe(
                `UPDATE ${name} SET ${r2Col} = $1 WHERE ${idCol} = $2`,
                [r2Url, id]
            );

            console.log(`R2 ✓ (${(fileData.buffer.length / 1024).toFixed(1)} KB)`);
            success++;
        } catch (error) {
            console.log(`R2 ✗ ${error.message}`);
            failed++;
            failures.push({ id, reason: error.message });
        }
    }

    if (failures.length > 0 && !DRY_RUN) {
        console.log(`    Failed IDs: ${failures.map(f => f.id).join(', ')}`);
    }

    return { total: rows.length, success, failed, skipped };
}

async function main() {
    console.log('═══════════════════════════════════════════════');
    console.log('  R2 Migration Script');
    console.log(`  Mode: ${DRY_RUN ? 'DRY RUN (use --execute to migrate)' : 'EXECUTE'}`);
    if (BACKUP_ONLY) console.log('  Source: Local backups only (--backup-only)');
    if (TABLE_FILTER) console.log(`  Table filter: ${TABLE_FILTER}`);
    if (LIMIT) console.log(`  Limit: ${LIMIT} rows per table`);
    console.log('═══════════════════════════════════════════════\n');

    // Check R2 configuration
    if (!isR2StorageConfigured()) {
        console.error('ERROR: R2 Storage is not configured. Set R2_Access_Key_ID, Secret_Access_Key, Account_ID env vars.');
        process.exit(1);
    }

    // Check backup directory
    if (fs.existsSync(BACKUP_BASE)) {
        console.log(`Backup directory: ${BACKUP_BASE} ✓`);
    } else {
        console.log(`Backup directory: ${BACKUP_BASE} (not found — backup fallback disabled)`);
    }
    console.log('');

    const results = {};
    let totalAll = 0, successAll = 0, failedAll = 0, skippedAll = 0;

    for (const tableConfig of TABLES) {
        if (TABLE_FILTER && tableConfig.name !== TABLE_FILTER) continue;

        const result = await migrateTable(tableConfig);
        const label = tableConfig.tableLabel || tableConfig.name;
        results[label] = result;
        totalAll += result.total;
        successAll += result.success;
        failedAll += result.failed;
        skippedAll += result.skipped;
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════');
    for (const [label, r] of Object.entries(results)) {
        if (r.total > 0) {
            console.log(`  ${label}: ${r.success}/${r.total} migrated, ${r.failed} failed, ${r.skipped} skipped`);
        } else {
            console.log(`  ${label}: Nothing to migrate`);
        }
    }
    console.log('───────────────────────────────────────────────');
    console.log(`  TOTAL: ${successAll}/${totalAll} migrated, ${failedAll} failed, ${skippedAll} skipped`);
    if (DRY_RUN) {
        console.log('\n  ⚠ This was a DRY RUN. Run with --execute to actually migrate files.');
    }
    console.log('═══════════════════════════════════════════════\n');

    await sql.end();
}

main().catch((error) => {
    console.error('Migration failed:', error);
    sql.end().then(() => process.exit(1));
});
