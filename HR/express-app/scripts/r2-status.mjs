import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';

const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

console.log('=== R2 MIGRATION STATUS ===\n');

// Employee documents
const emp = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE file_path IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_file_path IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE file_path IS NOT NULL AND r2_file_path IS NULL) as pending
FROM employee_documents`;
console.log(`Employee Documents:  ${emp[0].has_r2} migrated / ${emp[0].has_file} with files (${emp[0].pending} pending) [${emp[0].total} total rows]`);

// Branch documents
const br = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE file_path IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_file_path IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE file_path IS NOT NULL AND r2_file_path IS NULL) as pending
FROM branch_documents`;
console.log(`Branch Documents:    ${br[0].has_r2} migrated / ${br[0].has_file} with files (${br[0].pending} pending) [${br[0].total} total rows]`);

// Requests
const req = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE attachment_url IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_attachment_url IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE attachment_url IS NOT NULL AND r2_attachment_url IS NULL) as pending
FROM requests`;
console.log(`Requests:            ${req[0].has_r2} migrated / ${req[0].has_file} with files (${req[0].pending} pending) [${req[0].total} total rows]`);

// Notifications
const notif = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE attachment_url IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_attachment_url IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE attachment_url IS NOT NULL AND r2_attachment_url IS NULL) as pending
FROM notifications`;
console.log(`Notifications:       ${notif[0].has_r2} migrated / ${notif[0].has_file} with files (${notif[0].pending} pending) [${notif[0].total} total rows]`);

// Bus registration
const busReg = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE registration_document_url IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_registration_document_url IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL) as pending
FROM bus_registration_data`;
console.log(`Bus Registration:    ${busReg[0].has_r2} migrated / ${busReg[0].has_file} with files (${busReg[0].pending} pending) [${busReg[0].total} total rows]`);

// Driver license
const drvLic = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE license_document_url IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_license_document_url IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE license_document_url IS NOT NULL AND r2_license_document_url IS NULL) as pending
FROM driver_license_data`;
console.log(`Driver License:      ${drvLic[0].has_r2} migrated / ${drvLic[0].has_file} with files (${drvLic[0].pending} pending) [${drvLic[0].total} total rows]`);

// Bus transportation
const busTrans = await sql`SELECT 
  count(*) as total,
  count(*) FILTER (WHERE lease_contract_document_url IS NOT NULL) as has_file,
  count(*) FILTER (WHERE r2_lease_contract_document_url IS NOT NULL) as has_r2,
  count(*) FILTER (WHERE lease_contract_document_url IS NOT NULL AND r2_lease_contract_document_url IS NULL) as pending
FROM bus_transportation`;
console.log(`Bus Transportation:  ${busTrans[0].has_r2} migrated / ${busTrans[0].has_file} with files (${busTrans[0].pending} pending) [${busTrans[0].total} total rows]`);

// Totals
const totalFiles = [emp, br, req, notif, busReg, drvLic, busTrans].reduce((s, r) => s + Number(r[0].has_file), 0);
const totalR2 = [emp, br, req, notif, busReg, drvLic, busTrans].reduce((s, r) => s + Number(r[0].has_r2), 0);
const totalPending = [emp, br, req, notif, busReg, drvLic, busTrans].reduce((s, r) => s + Number(r[0].pending), 0);

console.log(`\n─────────────────────────────────────────`);
console.log(`TOTAL:               ${totalR2} migrated / ${totalFiles} with files (${totalPending} pending)`);
console.log(`Migration progress:  ${(totalR2 / totalFiles * 100).toFixed(1)}%`);

// Pending breakdown by category
if (totalPending > 0) {
    console.log(`\n=== PENDING FILES BREAKDOWN ===\n`);

    const empPending = await sql`SELECT id, employee_id, document_type FROM employee_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL ORDER BY employee_id`;
    if (empPending.length > 0) {
        console.log(`Employee docs (${empPending.length}):`);
        for (const r of empPending) console.log(`  id=${r.id} emp=${r.employee_id}/${r.document_type}`);
    }

    const brPending = await sql`SELECT id, branch_id, document_type, is_active FROM branch_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL ORDER BY branch_id`;
    if (brPending.length > 0) {
        console.log(`\nBranch docs (${brPending.length}):`);
        const active = brPending.filter(r => r.is_active);
        const inactive = brPending.filter(r => !r.is_active);
        if (active.length > 0) { console.log(`  Active (${active.length}):`); for (const r of active) console.log(`    id=${r.id} br=${r.branch_id}/${r.document_type}`); }
        if (inactive.length > 0) console.log(`  Inactive/archived (${inactive.length}): these are old superseded versions`);
    }

    const busPending = Number(busReg[0].pending) + Number(drvLic[0].pending) + Number(busTrans[0].pending);
    if (busPending > 0) {
        console.log(`\nBus data (${busPending}): ${busReg[0].pending} registration + ${drvLic[0].pending} license + ${busTrans[0].pending} transport`);
    }
}

await sql.end();
