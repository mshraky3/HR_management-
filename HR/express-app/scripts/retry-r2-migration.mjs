#!/usr/bin/env node

/**
 * R2 Migration Retry Script
 * 
 * Checks if the Vercel Blob CDN is accessible, then migrates
 * remaining files that couldn't be migrated due to CDN outage.
 * 
 * Usage:
 *   node scripts/retry-r2-migration.mjs              # Check CDN + dry run
 *   node scripts/retry-r2-migration.mjs --execute     # Check CDN + migrate if accessible
 *   node scripts/retry-r2-migration.mjs --status      # Just show migration status
 */

import dotenv from 'dotenv';
dotenv.config();

import postgres from 'postgres';
import fs from 'fs';
import path from 'path';
import { uploadToR2 } from '../utils/r2Storage.js';
import { isR2StorageConfigured } from '../config/r2Storage.js';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');
const STATUS_ONLY = args.includes('--status');

// Database connection
const sql = postgres({
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: 'require',
    max: 3,
    idle_timeout: 30,
    connect_timeout: 10,
});

const TABLES = [
    { name: 'employee_documents', urlCol: 'file_path', r2Col: 'r2_file_path', idCol: 'id' },
    { name: 'branch_documents', urlCol: 'file_path', r2Col: 'r2_file_path', idCol: 'id' },
    { name: 'bus_registration_data', urlCol: 'registration_document_url', r2Col: 'r2_registration_document_url', idCol: 'bus_id' },
    { name: 'driver_license_data', urlCol: 'license_document_url', r2Col: 'r2_license_document_url', idCol: 'bus_id' },
    { name: 'bus_transportation', urlCol: 'lease_contract_document_url', r2Col: 'r2_lease_contract_document_url', idCol: 'id' },
];

async function getStatus() {
    console.log('\n📊 Migration Status:');
    console.log('═══════════════════════════════════════════');
    let totalPending = 0;
    let totalMigrated = 0;

    for (const table of TABLES) {
        const [pending] = await sql.unsafe(
            `SELECT COUNT(*) as count FROM ${table.name} WHERE ${table.urlCol} IS NOT NULL AND ${table.r2Col} IS NULL`
        );
        const [migrated] = await sql.unsafe(
            `SELECT COUNT(*) as count FROM ${table.name} WHERE ${table.r2Col} IS NOT NULL`
        );
        const p = parseInt(pending.count);
        const m = parseInt(migrated.count);
        totalPending += p;
        totalMigrated += m;
        const icon = p === 0 ? '✓' : '⚠';
        console.log(`  ${icon} ${table.name}: ${m} migrated, ${p} pending`);
    }
    console.log('───────────────────────────────────────────');
    console.log(`  Total: ${totalMigrated} migrated, ${totalPending} pending`);
    console.log('═══════════════════════════════════════════\n');
    return totalPending;
}

async function checkCDN() {
    console.log('🔍 Checking Vercel Blob CDN status...');

    // Get a sample URL from the pending files
    const [sample] = await sql.unsafe(
        `SELECT file_path FROM employee_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL LIMIT 1`
    );

    if (!sample) {
        // Try other tables
        for (const table of TABLES) {
            const [s] = await sql.unsafe(
                `SELECT ${table.urlCol} as url FROM ${table.name} WHERE ${table.urlCol} IS NOT NULL AND ${table.r2Col} IS NULL LIMIT 1`
            );
            if (s) {
                return testUrl(s.url);
            }
        }
        console.log('  ✓ No pending files — nothing to check');
        return true;
    }

    return testUrl(sample.file_path);
}

async function testUrl(url) {
    try {
        const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
        if (resp.ok) {
            console.log(`  ✓ CDN is ACCESSIBLE (status ${resp.status})`);
            return true;
        } else {
            console.log(`  ✗ CDN returns ${resp.status} ${resp.statusText}`);
            if (resp.status === 503) {
                const body = await resp.text();
                const region = body.match(/([a-z]{3}\d+)::/)?.[1] || 'unknown';
                console.log(`    Region: ${region} — "The deployment is currently unavailable"`);
            }
            return false;
        }
    } catch (e) {
        console.log(`  ✗ CDN unreachable: ${e.message}`);
        return false;
    }
}

function extractBlobPath(blobUrl) {
    try {
        return new URL(blobUrl).pathname.slice(1);
    } catch {
        return null;
    }
}

async function migrateTable(table) {
    const rows = await sql.unsafe(
        `SELECT ${table.idCol}, ${table.urlCol} FROM ${table.name} WHERE ${table.urlCol} IS NOT NULL AND ${table.r2Col} IS NULL`
    );

    if (rows.length === 0) return { success: 0, failed: 0 };

    console.log(`\n  → ${table.name}: ${rows.length} files to migrate`);
    let success = 0, failed = 0;

    for (const row of rows) {
        const url = row[table.urlCol];
        const id = row[table.idCol];
        const r2Key = extractBlobPath(url);

        if (!r2Key) {
            console.log(`    ✗ [${id}] Bad URL`);
            failed++;
            continue;
        }

        try {
            const resp = await fetch(url, { signal: AbortSignal.timeout(30000) });
            if (!resp.ok) {
                if (resp.status === 503) {
                    console.log(`    ✗ [${id}] CDN still 503 — stopping this table`);
                    failed += rows.length - success - failed;
                    return { success, failed };
                }
                console.log(`    ✗ [${id}] HTTP ${resp.status}`);
                failed++;
                continue;
            }

            const buffer = Buffer.from(await resp.arrayBuffer());
            const contentType = resp.headers.get('content-type') || 'application/octet-stream';

            const r2Url = await uploadToR2(r2Key, buffer, contentType);
            await sql.unsafe(
                `UPDATE ${table.name} SET ${table.r2Col} = $1 WHERE ${table.idCol} = $2`,
                [r2Url, id]
            );

            console.log(`    ✓ [${id}] → R2 (${(buffer.length / 1024).toFixed(1)} KB)`);
            success++;
        } catch (e) {
            console.log(`    ✗ [${id}] ${e.message}`);
            failed++;
        }
    }

    return { success, failed };
}

async function main() {
    console.log('═══════════════════════════════════════════');
    console.log('  R2 Migration Retry');
    console.log('═══════════════════════════════════════════');

    const pending = await getStatus();

    if (pending === 0) {
        console.log('🎉 All files have been migrated to R2!');
        await sql.end();
        return;
    }

    if (STATUS_ONLY) {
        await sql.end();
        return;
    }

    const cdnOk = await checkCDN();

    if (!cdnOk) {
        console.log('\n❌ Vercel CDN is still down. Cannot migrate remaining files.');
        console.log('   Options:');
        console.log('   1. Run this script again later: node scripts/retry-r2-migration.mjs --execute');
        console.log('   2. Contact Vercel support about the CDN outage');
        console.log('   3. Re-upload affected documents through the app (they will go directly to R2)');
        console.log('\n   The app continues to work — new uploads go to R2 automatically.');
        console.log('   Existing migrated files (R2) are unaffected.\n');
        await sql.end();
        return;
    }

    if (!EXECUTE) {
        console.log('\n✓ CDN is accessible! Run with --execute to migrate remaining files.');
        await sql.end();
        return;
    }

    // Check R2 config
    if (!isR2StorageConfigured()) {
        console.error('ERROR: R2 not configured. Set R2_Access_Key_ID, Secret_Access_Key, Account_ID.');
        await sql.end();
        process.exit(1);
    }

    console.log('\n🚀 Starting migration...');
    let totalSuccess = 0, totalFailed = 0;

    for (const table of TABLES) {
        const { success, failed } = await migrateTable(table);
        totalSuccess += success;
        totalFailed += failed;
    }

    console.log('\n═══════════════════════════════════════════');
    console.log(`  Results: ${totalSuccess} migrated, ${totalFailed} failed`);
    console.log('═══════════════════════════════════════════');

    await getStatus();
    await sql.end();
}

main().catch(e => {
    console.error('Fatal error:', e.message);
    process.exit(1);
});
