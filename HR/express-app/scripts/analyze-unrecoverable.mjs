import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';

const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

console.log('=== UNRECOVERABLE EMPLOYEE DOCUMENTS (13) ===\n');
const empPending = await sql`
  SELECT ed.id, ed.employee_id, ed.document_type, ed.file_name, ed.is_active,
    e.first_name as emp_name
  FROM employee_documents ed
  LEFT JOIN employees e ON e.id = ed.employee_id
  WHERE ed.file_path IS NOT NULL AND ed.r2_file_path IS NULL
  ORDER BY ed.employee_id, ed.document_type
`;

for (const row of empPending) {
    // Check if there's a working version of this doc type for this employee
    const [working] = await sql`
    SELECT id FROM employee_documents 
    WHERE employee_id = ${row.employee_id} AND document_type = ${row.document_type}
    AND r2_file_path IS NOT NULL AND is_active = true
    ORDER BY id DESC LIMIT 1
  `;
    const hasWorking = working ? `YES (id=${working.id})` : 'NO';
    console.log(`  id=${row.id} emp=${row.employee_id} (${row.emp_name}) type=${row.document_type} active=${row.is_active} has_working_version=${hasWorking}`);
}

console.log('\n=== UNRECOVERABLE BRANCH DOCUMENTS (41) ===\n');
const brPending = await sql`
  SELECT bd.id, bd.branch_id, bd.document_type, bd.file_name, bd.is_active,
    b.branch_name as branch_name
  FROM branch_documents bd
  LEFT JOIN branches b ON b.id = bd.branch_id
  WHERE bd.file_path IS NOT NULL AND bd.r2_file_path IS NULL
  ORDER BY bd.branch_id, bd.document_type
`;

for (const row of brPending) {
    const [working] = await sql`
    SELECT id FROM branch_documents 
    WHERE branch_id = ${row.branch_id} AND document_type = ${row.document_type}
    AND r2_file_path IS NOT NULL AND is_active = true
    ORDER BY id DESC LIMIT 1
  `;
    const hasWorking = working ? `YES (id=${working.id})` : 'NO';
    console.log(`  id=${row.id} br=${row.branch_id} (${row.branch_name}) type=${row.document_type} active=${row.is_active} has_working_version=${hasWorking}`);
}

console.log('\n=== UNRECOVERABLE BUS DATA (99) ===\n');

const busReg = await sql`
  SELECT bus_id, registration_document_url FROM bus_registration_data 
  WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL`;
const drvLic = await sql`
  SELECT bus_id, license_document_url FROM driver_license_data 
  WHERE license_document_url IS NOT NULL AND r2_license_document_url IS NULL`;
const busTr = await sql`
  SELECT id, lease_contract_document_url FROM bus_transportation 
  WHERE lease_contract_document_url IS NOT NULL AND r2_lease_contract_document_url IS NULL`;

console.log(`Bus registration: ${busReg.length} (bus_ids: ${busReg.map(r => r.bus_id).join(', ')})`);
console.log(`Driver license: ${drvLic.length} (bus_ids: ${drvLic.map(r => r.bus_id).join(', ')})`);
console.log(`Bus transport: ${busTr.length} (ids: ${busTr.map(r => r.id).join(', ')})`);

// Summary
let empHasWorking = 0, empNoWorking = 0;
for (const row of empPending) {
    const [w] = await sql`SELECT 1 FROM employee_documents WHERE employee_id = ${row.employee_id} AND document_type = ${row.document_type} AND r2_file_path IS NOT NULL AND is_active = true LIMIT 1`;
    if (w) empHasWorking++; else empNoWorking++;
}
let brHasWorking = 0, brNoWorking = 0;
for (const row of brPending) {
    const [w] = await sql`SELECT 1 FROM branch_documents WHERE branch_id = ${row.branch_id} AND document_type = ${row.document_type} AND r2_file_path IS NOT NULL AND is_active = true LIMIT 1`;
    if (w) brHasWorking++; else brNoWorking++;
}

console.log('\n=== SUMMARY ===');
console.log(`Employee docs: ${empHasWorking} have working version (can archive broken), ${empNoWorking} NEED re-upload`);
console.log(`Branch docs: ${brHasWorking} have working version (can archive broken), ${brNoWorking} NEED re-upload`);
console.log(`Bus data: ALL 99 NEED re-upload (no backups ever existed)`);

await sql.end();
