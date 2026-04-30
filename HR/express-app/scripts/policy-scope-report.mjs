#!/usr/bin/env node

import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(process.cwd());
const routesDir = path.join(rootDir, 'routes');
const strict = process.argv.includes('--strict');

const directScopeRegex = /req\.(query|body|params)\.(branch_id|branchId|term_id|termId)\b/g;
const ignoreToken = 'policy-scope:allow-direct';

const findJsFiles = (dirPath) => {
    const results = [];
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    for (const entry of entries) {
        const absolutePath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            results.push(...findJsFiles(absolutePath));
            continue;
        }

        if (entry.isFile() && entry.name.endsWith('.js')) {
            results.push(absolutePath);
        }
    }

    return results;
};

const files = findJsFiles(routesDir);
const findings = [];

for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (line.includes(ignoreToken)) {
            continue;
        }

        if (directScopeRegex.test(line)) {
            findings.push({
                filePath: path.relative(rootDir, filePath),
                line: index + 1,
                text: line.trim(),
            });
        }
        directScopeRegex.lastIndex = 0;
    }
}

if (findings.length === 0) {
    console.log('Policy scope report: no direct branch/term request access detected.');
    process.exit(0);
}

console.log('Policy scope report: direct branch/term request access detected.');
for (const finding of findings) {
    console.log(`- ${finding.filePath}:${finding.line} -> ${finding.text}`);
}

if (strict) {
    console.error(`Policy scope check failed with ${findings.length} finding(s).`);
    process.exit(1);
}

console.log(`Policy scope report finished with ${findings.length} finding(s). (non-blocking mode)`);
process.exit(0);
