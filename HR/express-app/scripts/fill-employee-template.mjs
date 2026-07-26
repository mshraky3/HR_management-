/**
 * fill-employee-template.mjs
 *
 * Reads every employee from the database and writes them into a copy of
 * "HR Employee Template.xlsx", preserving the template's exact structure
 * (sheet name "NEW EMPLOYEES", header row, column layout and cell formats).
 *
 * The original template file is NOT modified. Output is written to a new file:
 *   HR Employees Filled.xlsx  (repo root)
 *
 * Run from the express-app directory:
 *   node scripts/fill-employee-template.mjs
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import ExcelJS from 'exceljs';

const __dirname = path.dirname(fileURLToPath(import.meta.url)); // express-app/scripts
const repoRoot = path.resolve(__dirname, '../../');

// Load the express-app/.env BEFORE importing the db config (which reads process.env
// at import time). dotenv does not override already-set vars, so this wins.
dotenv.config({ path: path.join(__dirname, '../.env') });

const { default: sql } = await import('../config/database.js');

const TEMPLATE_PATH = path.join(repoRoot, 'HR Employee Template.xlsx');
const OUTPUT_PATH = path.join(repoRoot, 'HR Employees Filled.xlsx');
const SHEET_NAME = 'NEW EMPLOYEES';
const HEADER_ROW = 1;
const EXAMPLE_ROWS = 2; // template rows 2 & 3 hold sample data

// ---------- value helpers ----------

const arabicFullName = (e) =>
  [e.first_name, e.second_name, e.third_name, e.fourth_name]
    .map((s) => (s || '').trim())
    .filter(Boolean)
    .join(' ');

const genderLabel = (g) => (g === 'male' ? 'Male' : g === 'female' ? 'Female' : g || '');

const idTypeLabel = (t) =>
  t === 'citizen' ? 'National ID' : t === 'resident' ? 'Iqama' : t || '';

const onWorkStatus = (s) => (s === 'active' ? 'active' : 'Inactive');

const workStatusLabel = (s) => {
  const map = {
    active: 'in the job',
    pending: 'Pending',
    terminated: 'Terminated',
    terminated_article_80: 'Terminated',
    terminated_article_77: 'Terminated',
    resigned: 'Resigned',
    contract_ended: 'Contract Ended',
    non_renewal: 'Non Renewal',
    other: 'Other',
  };
  return map[s] || s || '';
};

// Postgres DECIMAL comes back as a string; turn into a real number for Excel.
const num = (v) => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
};

// employee_id_number is VARCHAR but the template stores it as a number when numeric.
const numOrText = (v) => {
  if (v === null || v === undefined || v === '') return null;
  return /^\d+$/.test(String(v).trim()) ? Number(v) : v;
};

// A Postgres DATE arrives as a JS Date. Return a Date for real date-typed cells.
const asDate = (v) => (v ? new Date(v) : null);

// For the IDExpiry column the template stores a "YYYY-MM-DD" string, not a date value.
const isoDateString = (v) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

// Template column letter -> function producing the cell value from an employee row.
// Columns not listed here are intentionally left blank (no DB source / template constants).
const COLUMN_MAP = {
  B: (e) => numOrText(e.employee_id_number),          // EmployeeNo
  C: (e) => e.bank_iban || null,                       // IBAN
  E: (e) => arabicFullName(e) || null,                 // FirstName  (Arabic name per user choice)
  G: (e) => arabicFullName(e) || null,                 // FirstName_A
  I: (e) => genderLabel(e.gender),                     // Gender
  J: (e) => e.nationality || null,                     // Nationality
  K: (e) => e.religion || null,                        // Religion
  L: (e) => e.marital_status || null,                  // MartialStatus
  M: (e) => asDate(e.date_of_birth_gregorian),         // BirthDate (date cell)
  N: (e) => e.national_address || null,                // Address1
  O: (e) => e._branch_location || null,                // Location  (from primary branch)
  Q: (e) => e.phone_number || null,                    // Mobile
  R: (e) => e.email || null,                           // EMail
  S: (e) => idTypeLabel(e.id_type),                    // IDType
  T: (e) => (e.id_or_residency_number || null),        // IDNo (kept as text)
  U: (e) => isoDateString(e.id_expiry_date_gregorian), // IDExpiry (YYYY-MM-DD string)
  V: (e) => e._branch_name || null,                    // ORGANIZATION UNIT (primary branch)
  W: (e) => e.job_title || null,                       // Title
  X: (e) => onWorkStatus(e.status),                    // OnWorkStatus
  Y: (e) => workStatusLabel(e.status),                 // EmployeeWorkStatus
  AB: (e) => asDate(e.contract_start_date_gregorian),  // JoinDate (date cell)
  AC: (e) => asDate(e.contract_end_date_gregorian),    // LastWorkDate (date cell)
  AF: (e) => e.bank_name || null,                      // Bank
  AH: (e) => e.bank_iban || null,                      // BankAccountID
  AL: (e) => num(e.base_salary),                       // BasicSalary
  AO: (e) => num(e.transportation_allowance),          // Transportation
  AS: (e) => num(e.other_allowances),                  // Other Allowance
  BO: (e) => e.occupation || null,                     // Visa Professions
};

async function main() {
  console.log('Loading template:', TEMPLATE_PATH);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(TEMPLATE_PATH);

  const ws = workbook.getWorksheet(SHEET_NAME);
  if (!ws) throw new Error(`Sheet "${SHEET_NAME}" not found in template`);
  const maxCol = ws.columnCount;

  // Capture the per-column cell styles from the first example row so every data
  // row we write keeps the template's number/date formats, borders and font.
  const styleByCol = {};
  for (let c = 1; c <= maxCol; c++) {
    styleByCol[c] = ws.getCell(HEADER_ROW + 1, c).style;
  }

  console.log('Querying employees...');
  const employees = await sql`
    SELECT e.*,
           b.branch_name     AS _branch_name,
           b.branch_location AS _branch_location
    FROM employees e
    LEFT JOIN branches b ON e.branch_id = b.id
    ORDER BY e.id
  `;
  console.log(`Fetched ${employees.length} employees.`);

  // Remove the two sample rows, keeping the header row intact.
  ws.spliceRows(HEADER_ROW + 1, EXAMPLE_ROWS);

  employees.forEach((emp, i) => {
    const rowNum = HEADER_ROW + 1 + i;
    // Re-apply template styles to the whole row so formats stay consistent.
    for (let c = 1; c <= maxCol; c++) {
      ws.getCell(rowNum, c).style = styleByCol[c];
    }
    for (const [col, fn] of Object.entries(COLUMN_MAP)) {
      const value = fn(emp);
      if (value !== null && value !== undefined) {
        ws.getCell(`${col}${rowNum}`).value = value;
      }
    }
  });

  await workbook.xlsx.writeFile(OUTPUT_PATH);
  console.log('Wrote:', OUTPUT_PATH);

  // Report DB fields that have real data but no column in the template.
  const unmapped = [
    'housing_allowance',
    'end_of_service_allowance',
    'annual_leave_allowance',
  ];
  const dropped = unmapped.filter((f) =>
    employees.some((e) => e[f] !== null && e[f] !== undefined && Number(e[f]) !== 0)
  );
  if (dropped.length) {
    console.log(
      '\nNOTE: these DB fields have data but no matching template column (left out):',
      dropped.join(', ')
    );
  }

  await sql.end({ timeout: 5 });
}

main().catch(async (err) => {
  console.error('FAILED:', err);
  try { await sql.end({ timeout: 5 }); } catch {}
  process.exit(1);
});
