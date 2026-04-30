/**
 * One-time migration script: adds handleRouteError import and replaces
 * all res.status(500).json({...}) blocks in route files.
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
    'students-report.js', 'suggestions.js', 'terms.js', 'treatment-plans.js', 'users.js',
];

const IMPORT_LINE = "import { handleRouteError } from '../utils/routeErrorHandler.js';";

function addImport(content) {
    if (content.includes('handleRouteError')) return content; // already there

    const lines = content.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
        if (/^import\s/.test(lines[i].trim())) lastImportIdx = i;
    }
    if (lastImportIdx < 0) return content;
    lines.splice(lastImportIdx + 1, 0, IMPORT_LINE);
    return lines.join('\n');
}

/**
 * Replace all res.status(500).json({...}) patterns.
 *
 * Handles both single-line and multi-line forms.
 * Extracts the Arabic message and passes it to handleRouteError.
 *
 * Pattern handled (with or without leading `return`):
 *   res.status(500).json({
 *     success: false,
 *     message: 'ARABIC_MESSAGE',
 *     error: error.message      <-- optional
 *   });
 *
 * Also handles the form where message comes before success:false (rare).
 */
function replaceErrors(content) {
    // Match the whole res.status(500).json({...}); block (including optional `return`)
    // The lazy [^}]* after message captures anything until the closing brace
    return content.replace(
        /(return\s+)?res\.status\(500\)\.json\(\{([^}]*)\}\s*\);/g,
        (match, ret, body) => {
            // Extract the message value from the body
            const msgMatch = body.match(/message:\s*['"]([^'"]+)['"]/);
            const msg = msgMatch ? msgMatch[1] : 'حدث خطأ في الخادم';
            const retStr = ret ? 'return ' : '';
            return `${retStr}handleRouteError(error, req, res, '${msg}');`;
        }
    );
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

    let content = addImport(original);
    content = replaceErrors(content);

    if (content === original) {
        console.log(`  = no changes:   ${filename}`);
        return;
    }

    await fs.writeFile(filePath, content, 'utf-8');
    console.log(`  ✓ updated:       ${filename}`);
}

console.log('Applying handleRouteError across route files…\n');
for (const file of ROUTE_FILES) {
    await processFile(file);
}
console.log('\nDone.');
