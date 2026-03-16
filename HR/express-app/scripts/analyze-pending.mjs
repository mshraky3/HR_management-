import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

const sql = postgres({
    host: process.env.DATABASE_HOST,
    database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER,
    password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

const backupBase = path.resolve(import.meta.dirname, '../../backup-system/backups');

// ============ EMPLOYEE DOCUMENTS ============
console.log('=== EMPLOYEE DOCUMENTS (330 pending) ===\n');

const empPending = await sql`
  SELECT id, employee_id, document_type, file_path, file_name
  FROM employee_documents 
  WHERE file_path IS NOT NULL AND r2_file_path IS NULL
  ORDER BY employee_id, document_type
`;

console.log('Total pending:', empPending.length);

// For each pending doc, check what we ACTUALLY have as backups for that employee+type
const empBackupDir = path.join(backupBase, 'employee-documents');
let empMatchable = 0;
let empNoDir = 0;
let empMultiple = 0;

// Also check: what files are ALREADY migrated for each employee+type? 
// If a backup file was already used for a different row, it can't be reused.
const matchCandidates = [];

for (const doc of empPending) {
    const typeDir = path.join(empBackupDir, String(doc.employee_id), doc.document_type);

    if (!fs.existsSync(typeDir)) {
        empNoDir++;
        continue;
    }

    const backupFiles = fs.readdirSync(typeDir);
    if (backupFiles.length === 0) {
        empNoDir++;
        continue;
    }

    // Check how many rows for this employee+type are already migrated
    const alreadyMigrated = await sql`
    SELECT id, file_path, r2_file_path FROM employee_documents 
    WHERE employee_id = ${doc.employee_id} AND document_type = ${doc.document_type}
    AND r2_file_path IS NOT NULL
  `;

    // Pending rows for same employee+type
    const pendingForType = empPending.filter(p =>
        p.employee_id === doc.employee_id && p.document_type === doc.document_type
    );

    matchCandidates.push({
        docId: doc.id,
        empId: doc.employee_id,
        type: doc.document_type,
        backupFiles,
        migratedCount: alreadyMigrated.length,
        pendingCount: pendingForType.length,
        url: doc.file_path,
    });
    empMatchable++;
}

console.log('Have backup directory:', empMatchable);
console.log('No backup directory:', empNoDir);

// Show unique employee+type combinations where backup exists
const uniqueCombos = {};
for (const mc of matchCandidates) {
    const key = mc.empId + '/' + mc.type;
    if (!uniqueCombos[key]) {
        uniqueCombos[key] = mc;
    }
}
console.log('\nUnique emp+type combos with backups:', Object.keys(uniqueCombos).length);
for (const [key, mc] of Object.entries(uniqueCombos)) {
    console.log(`  ${key}: ${mc.backupFiles.length} backup files, ${mc.pendingCount} pending, ${mc.migratedCount} already migrated`);
}

// ============ BRANCH DOCUMENTS ============
console.log('\n\n=== BRANCH DOCUMENTS (102 pending) ===\n');

const brPending = await sql`
  SELECT id, branch_id, document_type, file_path
  FROM branch_documents 
  WHERE file_path IS NOT NULL AND r2_file_path IS NULL
  ORDER BY branch_id, document_type
`;

console.log('Total pending:', brPending.length);

const brBackupDir = path.join(backupBase, 'branch-documents');
let brMatchable = 0;
let brNoDir = 0;

for (const doc of brPending) {
    const typeDir = path.join(brBackupDir, String(doc.branch_id), doc.document_type);
    if (!fs.existsSync(typeDir)) {
        brNoDir++;
        continue;
    }
    const backupFiles = fs.readdirSync(typeDir);
    if (backupFiles.length > 0) {
        const alreadyMigrated = await sql`
      SELECT id FROM branch_documents 
      WHERE branch_id = ${doc.branch_id} AND document_type = ${doc.document_type}
      AND r2_file_path IS NOT NULL
    `;
        const pendingForType = brPending.filter(p =>
            p.branch_id === doc.branch_id && p.document_type === doc.document_type
        );

        if (pendingForType[0].id === doc.id) {  // only print once per combo
            console.log(`  br=${doc.branch_id} type=${doc.document_type}: ${backupFiles.length} backups, ${pendingForType.length} pending, ${alreadyMigrated.length} migrated`);
        }
        brMatchable++;
    } else {
        brNoDir++;
    }
}

console.log('Have backup:', brMatchable, 'No backup:', brNoDir);

// ============ BUS DATA ============
console.log('\n\n=== BUS DATA (46+49+4=99 pending) ===');
console.log('Bus backup directories:');
for (const dir of ['bus-registration', 'bus-transportation', 'driver-license', 'bus_registration_data', 'bus_transportation', 'driver_license_data']) {
    const p = path.join(backupBase, dir);
    console.log(`  ${dir}: ${fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND'}`);
}

// Check if bus data has any backups anywhere
const backupRoot = path.join(backupBase, '..');
const allBackupDirs = fs.readdirSync(backupRoot);
console.log('\nAll backup dirs:', allBackupDirs.join(', '));

await sql.end();
