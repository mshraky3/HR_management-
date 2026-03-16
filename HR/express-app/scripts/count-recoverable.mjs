import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';
import fs from 'fs';
import path from 'path';

const BACKUP_BASE = path.resolve(import.meta.dirname, '../../backup-system/backups');
const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

// Employee docs
const empPending = await sql`SELECT id, employee_id, document_type, file_path 
  FROM employee_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL`;

let empYes = 0, empNo = 0;
const empNoList = [];
for (const row of empPending) {
    const dir = path.join(BACKUP_BASE, 'employee-documents', String(row.employee_id), row.document_type);
    let found = false;
    if (fs.existsSync(dir)) {
        const dirFiles = fs.readdirSync(dir);
        for (const f of dirFiles) {
            if (!f.startsWith('.')) { found = true; break; }
        }
    }
    if (found) empYes++;
    else { empNo++; empNoList.push(`id=${row.id} emp=${row.employee_id}/${row.document_type}`); }
}
console.log(`Employee docs: ${empYes} recoverable, ${empNo} unrecoverable (of ${empPending.length})`);
if (empNoList.length > 0) console.log('  No backup:', empNoList.join(', '));

// Branch docs
const brPending = await sql`SELECT id, branch_id, document_type, file_path 
  FROM branch_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL`;

let brYes = 0, brNo = 0;
const brNoList = [];
for (const row of brPending) {
    const dir = path.join(BACKUP_BASE, 'branch-documents', String(row.branch_id), row.document_type);
    let found = false;
    if (fs.existsSync(dir)) {
        const dirFiles = fs.readdirSync(dir);
        for (const f of dirFiles) {
            if (!f.startsWith('.')) { found = true; break; }
        }
    }
    if (found) brYes++;
    else { brNo++; brNoList.push(`id=${row.id} br=${row.branch_id}/${row.document_type}`); }
}
console.log(`Branch docs: ${brYes} recoverable, ${brNo} unrecoverable (of ${brPending.length})`);
if (brNoList.length > 0) console.log('  No backup:', brNoList.join(', '));

// Bus data
const busR = await sql`SELECT count(*) as c FROM bus_registration_data WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL`;
const drvL = await sql`SELECT count(*) as c FROM driver_license_data WHERE license_document_url IS NOT NULL AND r2_license_document_url IS NULL`;
const busT = await sql`SELECT count(*) as c FROM bus_transportation WHERE lease_contract_document_url IS NOT NULL AND r2_lease_contract_document_url IS NULL`;
const busTotal = Number(busR[0].c) + Number(drvL[0].c) + Number(busT[0].c);
console.log(`Bus data: 0 recoverable, ${busTotal} unrecoverable (${busR[0].c} bus_reg + ${drvL[0].c} driver_lic + ${busT[0].c} bus_trans)`);

const totalPending = empPending.length + brPending.length + busTotal;
const totalRecoverable = empYes + brYes;
const totalUnrecoverable = empNo + brNo + busTotal;
console.log(`\nSUMMARY: ${totalRecoverable} recoverable + ${totalUnrecoverable} unrecoverable = ${totalPending} total pending`);

await sql.end();
