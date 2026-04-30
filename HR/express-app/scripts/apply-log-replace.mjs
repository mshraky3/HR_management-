/**
 * One-time migration script: replaces console.error / console.log with
 * log.error / log.info in all route files, adding the logger import where needed.
 *
 * Run once from express-app/ then delete.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const routesDir = path.join(__dirname, '..', 'routes');

const ROUTE_FILES = [
    'academic-years.js', 'admin.js', 'archive.js', 'auth.js', 'beneficiaries.js',
    'blob-recovery.js', 'branch-documents.js', 'branch-statistics.js', 'branches.js',
    'bus-transportation-report.js', 'bus-transportation.js', 'dashboard.js', 'documents.js',
    'employee-expiry.js', 'employee-file.js', 'employees.js', 'error-report.js',
    'notifications.js', 'payroll-absences.js', 'reports.js', 'requests.js',
    'students-report.js', 'suggestions.js', 'terms.js', 'treatment-plans.js', 'users.js', 'utils.js',
];

const LOG_IMPORT = "import { log } from '../utils/logger.js';";

function addLogImport(content) {
    // Already has any logger import?
    if (/import\s+.*logger/.test(content)) return content;

    const lines = content.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i].trim())) lastImportIdx = i;
    }
    if (lastImportIdx < 0) return content;
    lines.splice(lastImportIdx + 1, 0, LOG_IMPORT);
    return lines.join('\n');
}

async function processFile(filename) {
    const filePath = path.join(routesDir, filename);
    let original;
    try {
        original = await fs.readFile(filePath, 'utf-8');
    } catch {
        console.log(`  SKIP (not found): ${filename}`);
        return;
    }

    let content = original;

    const hasConsoleError = /console\.error\(/.test(content);
    const hasConsoleLog = /console\.log\(/.test(content);

    if (!hasConsoleError && !hasConsoleLog) {
        console.log(`  = no changes:   ${filename}`);
        return;
    }

    // Add logger import if needed
    if (hasConsoleError || hasConsoleLog) {
        content = addLogImport(content);
    }

    // Replace console.error( → log.error(
    content = content.replace(/console\.error\(/g, 'log.error(');

    // Replace console.log( → log.info(
    content = content.replace(/console\.log\(/g, 'log.info(');

    if (content === original) {
        console.log(`  = no changes:   ${filename}`);
        return;
    }

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`  ✓ updated:       ${filename}`);
}

console.log('Replacing console.* with log.* across route files…\n');
for (const file of ROUTE_FILES) {
    await processFile(file);
}
console.log('\nDone.');
