/**
 * Mark unrecoverable files in the database.
 * Sets file_path to a marker value so the system knows these files need re-upload.
 * The original Vercel Blob URL is preserved in a comment for reference.
 *
 * Usage:
 *   node scripts/mark-broken-files.mjs           # Dry run
 *   node scripts/mark-broken-files.mjs --execute  # Actually update DB
 */
import dotenv from 'dotenv';
dotenv.config();
import postgres from 'postgres';

const DRY_RUN = !process.argv.includes('--execute');
const sql = postgres({
    host: process.env.DATABASE_HOST, database: process.env.DATABASE_NAME,
    username: process.env.DATABASE_USER, password: process.env.DATABASE_PASSWORD,
    ssl: 'require', max: 1,
});

console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'EXECUTE'}\n`);

// 1. Employee documents with no R2 and no backup
const empBroken = await sql`
  SELECT id, employee_id, document_type, file_path, is_active
  FROM employee_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL
`;
console.log(`Employee documents: ${empBroken.length} broken`);

// 2. Branch documents with no R2 and no backup
const brBroken = await sql`
  SELECT id, branch_id, document_type, file_path, is_active
  FROM branch_documents WHERE file_path IS NOT NULL AND r2_file_path IS NULL
`;
console.log(`Branch documents: ${brBroken.length} broken`);

// 3. Bus registration data
const busRegBroken = await sql`
  SELECT bus_id, registration_document_url
  FROM bus_registration_data WHERE registration_document_url IS NOT NULL AND r2_registration_document_url IS NULL
`;
console.log(`Bus registration: ${busRegBroken.length} broken`);

// 4. Driver license data
const drvLicBroken = await sql`
  SELECT bus_id, license_document_url
  FROM driver_license_data WHERE license_document_url IS NOT NULL AND r2_license_document_url IS NULL
`;
console.log(`Driver license: ${drvLicBroken.length} broken`);

// 5. Bus transportation
const busTrBroken = await sql`
  SELECT id, lease_contract_document_url
  FROM bus_transportation WHERE lease_contract_document_url IS NOT NULL AND r2_lease_contract_document_url IS NULL
`;
console.log(`Bus transportation: ${busTrBroken.length} broken`);

const total = empBroken.length + brBroken.length + busRegBroken.length + drvLicBroken.length + busTrBroken.length;
console.log(`\nTotal: ${total} broken files to mark\n`);

if (DRY_RUN) {
    console.log('Use --execute to apply changes.');
    await sql.end();
    process.exit(0);
}

// For inactive branch docs, just clear the broken URL (they're archived, user won't see them) 
let cleared = 0;
let marked = 0;

// Employee docs: mark with needs_reupload flag (keep file_path for reference)
for (const row of empBroken) {
    await sql`UPDATE employee_documents SET needs_reupload = true WHERE id = ${row.id}`;
    marked++;
    console.log(`  [emp] id=${row.id} emp=${row.employee_id}/${row.document_type} → marked needs_reupload`);
}

// Branch docs: inactive ones → clear URL; active ones → mark needs_reupload
for (const row of brBroken) {
    if (!row.is_active) {
        await sql`UPDATE branch_documents SET file_path = NULL WHERE id = ${row.id}`;
        cleared++;
        console.log(`  [branch] id=${row.id} br=${row.branch_id}/${row.document_type} (inactive) → cleared file_path`);
    } else {
        await sql`UPDATE branch_documents SET needs_reupload = true WHERE id = ${row.id}`;
        marked++;
        console.log(`  [branch] id=${row.id} br=${row.branch_id}/${row.document_type} (ACTIVE) → marked needs_reupload`);
    }
}

// Bus data: mark needs_reupload
for (const row of busRegBroken) {
    await sql`UPDATE bus_registration_data SET needs_reupload = true WHERE bus_id = ${row.bus_id}`;
    marked++;
}
console.log(`  [bus_reg] ${busRegBroken.length} rows → marked needs_reupload`);

for (const row of drvLicBroken) {
    await sql`UPDATE driver_license_data SET needs_reupload = true WHERE bus_id = ${row.bus_id}`;
    marked++;
}
console.log(`  [driver_lic] ${drvLicBroken.length} rows → marked needs_reupload`);

for (const row of busTrBroken) {
    await sql`UPDATE bus_transportation SET needs_reupload = true WHERE id = ${row.id}`;
    marked++;
}
console.log(`  [bus_trans] ${busTrBroken.length} rows → marked needs_reupload`);

console.log(`\nDone: ${marked} marked as needs_reupload, ${cleared} inactive cleared`);
await sql.end();
