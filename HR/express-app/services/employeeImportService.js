/**
 * Employee import from Excel: template, preview (validates, writes nothing) and commit.
 *
 * Imported employees are created with the basics and stay "incomplete" until documents and the remaining
 * fields are added in the app; the point is to get a branch's people in quickly instead of one form at a time.
 * Preview and commit run the SAME validation, and commit re-validates what the client sends back.
 */

import ExcelJS from 'exceljs';
import sql from '../config/database.js';
import { Employee } from '../models/Employee.js';
import { isSaudiNationality } from '../utils/employeeRules.js';
import { gregorianToHijri, formatHijriToString } from '../utils/dateConverter.js';
import { normalizeEmployeeInput, validateEmployeeFields, toAsciiDigits } from '../utils/employeeFieldValidators.js';
import { recordAudit } from './auditService.js';
import { clearByPrefix } from '../utils/simpleCache.js';

export const MAX_IMPORT_ROWS = 500;

/** key -> Arabic header shown in the template. Order = column order. */
export const COLUMNS = [
  { key: 'first_name', header: 'الاسم الأول', required: true, width: 16 },
  { key: 'second_name', header: 'الاسم الثاني', required: true, width: 16 },
  { key: 'third_name', header: 'الاسم الثالث', required: true, width: 16 },
  { key: 'fourth_name', header: 'الاسم الرابع', required: true, width: 16 },
  { key: 'id_or_residency_number', header: 'رقم الهوية/الإقامة', required: true, width: 20 },
  { key: 'nationality', header: 'الجنسية', required: true, width: 14 },
  { key: 'job_title', header: 'المسمى الوظيفي', required: true, width: 22 },
  { key: 'gender', header: 'الجنس (ذكر/أنثى)', required: true, width: 16 },
  { key: 'date_of_birth', header: 'تاريخ الميلاد الميلادي (YYYY-MM-DD)', required: true, width: 26 },
  { key: 'phone_number', header: 'رقم الجوال (05xxxxxxxx)', required: false, width: 20 },
  { key: 'email', header: 'البريد الإلكتروني', required: false, width: 26 },
  { key: 'bank_iban', header: 'الآيبان (SA…)', required: false, width: 30 },
  { key: 'bank_name', header: 'البنك', required: false, width: 18 },
  { key: 'national_address', header: 'العنوان الوطني المختصر', required: false, width: 20 },
  { key: 'contract_type', header: 'نوع العقد (قوى/ورقي)', required: false, width: 18 },
  { key: 'contract_start_date', header: 'بداية العقد (YYYY-MM-DD)', required: false, width: 22 },
  { key: 'contract_end_date', header: 'نهاية العقد (YYYY-MM-DD)', required: false, width: 22 },
];

const norm = (v) => String(v ?? '').replace(/[ً-ٰٟـ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const HEADER_TO_KEY = new Map(COLUMNS.map((c) => [norm(c.header), c.key]));
// Also accept the header without the bracketed hint
for (const c of COLUMNS) HEADER_TO_KEY.set(norm(c.header.replace(/\s*\(.*\)\s*$/, '')), c.key);

export async function buildTemplate() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الموظفون', { views: [{ rightToLeft: true, state: 'frozen', ySplit: 1 }] });
  ws.columns = COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  head.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  head.height = 34;
  COLUMNS.forEach((c, i) => {
    head.getCell(i + 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c.required ? 'FF215F9A' : 'FF64748B' } };
  });
  ws.addRow({
    first_name: 'محمد', second_name: 'أحمد', third_name: 'علي', fourth_name: 'السالم', id_or_residency_number: '1000000000',
    nationality: 'السعودية', job_title: 'معلم', gender: 'ذكر', date_of_birth: '1990-05-17', phone_number: '0500000000',
    email: 'name@example.com', bank_iban: 'SA0000000000000000000000', bank_name: 'مصرف الراجحي', national_address: 'ABCD1234',
    contract_type: 'قوى', contract_start_date: '2026-09-01', contract_end_date: '2027-06-30',
  });
  ws.getRow(2).font = { color: { argb: 'FF94A3B8' }, italic: true };

  const info = wb.addWorksheet('تعليمات', { views: [{ rightToLeft: true }] });
  info.columns = [{ width: 100 }];
  [
    'عبّئ بيانات الموظفين ابتداءً من السطر الثالث (السطر الثاني مثال، احذفه).',
    'الأعمدة الزرقاء مطلوبة، والرمادية اختيارية ويمكن إكمالها لاحقاً داخل النظام.',
    'رقم الهوية/الإقامة 10 أرقام. الآيبان يبدأ بـ SA ويتكون من 24 خانة. الجوال يبدأ بـ 05.',
    'التواريخ بصيغة YYYY-MM-DD ميلادي. يُحسب التاريخ الهجري تلقائياً.',
    'الموظفون المكررون (نفس رقم الهوية) لا يُضافون ويظهرون في المعاينة.',
    `الحد الأقصى ${MAX_IMPORT_ROWS} موظف في الملف الواحد. المستندات تُرفع لاحقاً من ملف الموظف.`,
  ].forEach((t) => info.addRow([t]));
  return wb.xlsx.writeBuffer();
}

function cellText(cell) {
  const v = cell?.value;
  if (v == null) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellText({ value: v.result });
    if ('text' in v) return String(v.text ?? '').trim();
    if ('richText' in v) return v.richText.map((r) => r.text).join('').trim();
  }
  return String(v).trim();
}

const toIsoDate = (value) => {
  const t = toAsciiDigits(String(value || '')).trim();
  if (!t) return null;
  const iso = t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const dmy = t.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  let y; let m; let d;
  if (iso) [, y, m, d] = iso; else if (dmy) [, d, m, y] = dmy; else return 'invalid';
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) return 'invalid';
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
};

const GENDER = { ذكر: 'male', male: 'male', m: 'male', انثى: 'female', أنثى: 'female', female: 'female', f: 'female' };

/** Reads the workbook into raw row objects { rowNumber, values } keyed by column key. */
export async function parseWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('الملف لا يحتوي على أوراق');

  const headerRow = ws.getRow(1);
  const keyByCol = new Map();
  headerRow.eachCell((cell, col) => {
    const key = HEADER_TO_KEY.get(norm(cellText(cell))) || HEADER_TO_KEY.get(norm(cellText(cell).replace(/\s*\(.*\)\s*$/, '')));
    if (key) keyByCol.set(col, key);
  });
  const missing = COLUMNS.filter((c) => c.required && ![...keyByCol.values()].includes(c.key)).map((c) => c.header);
  if (missing.length > 0) {
    const err = new Error(`أعمدة مطلوبة غير موجودة في الملف: ${missing.join('، ')}. حمّل القالب واستخدمه كما هو.`);
    err.code = 'MISSING_COLUMNS';
    throw err;
  }

  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    if (rowNumber === 1) return;
    const values = {};
    let any = false;
    for (const [col, key] of keyByCol) {
      const text = cellText(row.getCell(col));
      if (text) any = true;
      values[key] = text;
    }
    if (!any) return;
    // Skip the untouched example row of the template
    if (values.id_or_residency_number === '1000000000' && values.first_name === 'محمد' && values.email === 'name@example.com') return;
    rows.push({ rowNumber, values });
  });
  if (rows.length > MAX_IMPORT_ROWS) {
    const err = new Error(`الملف يحتوي ${rows.length} صفاً. الحد الأقصى ${MAX_IMPORT_ROWS}.`);
    err.code = 'TOO_MANY_ROWS';
    throw err;
  }
  return rows;
}

/** Validates + normalises one raw row. Returns { data, errors }. `data` is ready for Employee.create. */
export function validateRow(values) {
  const errors = [];
  const body = { ...values };
  normalizeEmployeeInput(body);

  for (const c of COLUMNS) {
    if (c.required && !body[c.key]) errors.push(`${c.header.replace(/\s*\(.*\)\s*$/, '')} مطلوب`);
  }

  const gender = GENDER[norm(body.gender)];
  if (body.gender && !gender) errors.push('الجنس يجب أن يكون ذكر أو أنثى');

  const dob = toIsoDate(body.date_of_birth);
  if (dob === 'invalid') errors.push('تاريخ الميلاد غير صالح (استخدم YYYY-MM-DD)');
  const start = toIsoDate(body.contract_start_date);
  const end = toIsoDate(body.contract_end_date);
  if (start === 'invalid') errors.push('بداية العقد غير صالحة');
  if (end === 'invalid') errors.push('نهاية العقد غير صالحة');

  const fieldErrors = validateEmployeeFields({
    id_or_residency_number: body.id_or_residency_number, phone_number: body.phone_number, email: body.email,
    bank_iban: body.bank_iban, national_address: body.national_address,
    contract_start_date_gregorian: start !== 'invalid' ? start : null, contract_end_date_gregorian: end !== 'invalid' ? end : null,
  });
  errors.push(...fieldErrors);

  if (dob && dob !== 'invalid') {
    const age = (Date.now() - new Date(dob).getTime()) / (365.25 * 86400000);
    if (age < 16 || age > 100) errors.push('تاريخ الميلاد غير منطقي');
  }

  const saudi = isSaudiNationality(body.nationality);
  const hijri = dob && dob !== 'invalid' ? formatHijriToString(gregorianToHijri(dob)) : null;

  const data = {
    first_name: body.first_name, second_name: body.second_name, third_name: body.third_name, fourth_name: body.fourth_name,
    id_or_residency_number: body.id_or_residency_number,
    nationality: body.nationality,
    id_type: saudi ? 'citizen' : 'resident',
    job_title: body.job_title,
    occupation: body.job_title,
    gender: gender || null,
    date_of_birth_gregorian: dob && dob !== 'invalid' ? dob : null,
    date_of_birth_hijri: hijri,
    phone_number: body.phone_number || null,
    email: body.email || null,
    bank_iban: body.bank_iban || null,
    bank_name: body.bank_name || null,
    national_address: body.national_address || null,
    contract_type: body.contract_type || null,
    contract_start_date_gregorian: start && start !== 'invalid' ? start : null,
    contract_end_date_gregorian: end && end !== 'invalid' ? end : null,
  };
  return { data, errors };
}

/** Preview: validates every row and flags duplicates (already in the system, or repeated in the file). */
export async function previewRows(rows) {
  const results = rows.map((r) => ({ row: r.rowNumber, raw: r.values, ...validateRow(r.values) }));

  const ids = results.map((r) => r.data.id_or_residency_number).filter(Boolean);
  const existing = ids.length
    ? await sql`
        SELECT e.id_or_residency_number AS id_number, e.status, b.branch_name
        FROM employees e LEFT JOIN branches b ON b.id = e.branch_id
        WHERE e.id_or_residency_number = ANY(${ids}::text[])`
    : [];
  const existingBy = new Map(existing.map((e) => [e.id_number, e]));
  const seen = new Set();

  return results.map((r) => {
    const id = r.data.id_or_residency_number;
    let status = r.errors.length > 0 ? 'error' : 'ok';
    const out = { row: r.row, status, errors: r.errors, data: r.data, raw: r.raw };
    if (id && existingBy.has(id)) {
      const e = existingBy.get(id);
      out.status = 'duplicate';
      out.errors = [`مسجل مسبقاً في النظام (${e.branch_name || 'فرع غير معروف'}، الحالة: ${e.status || 'active'})`];
    } else if (id && seen.has(id)) {
      out.status = 'duplicate';
      out.errors = ['مكرر داخل الملف نفسه'];
    }
    if (id) seen.add(id);
    return out;
  });
}

/** Commit: re-validates the rows the client sends back, creates the valid ones in one transaction. */
export async function commitRows({ branchId, rawRows, actor, userId }) {
  const checked = await previewRows(rawRows.map((values, i) => ({ rowNumber: i + 2, values })));
  const toCreate = checked.filter((r) => r.status === 'ok');

  const created = await sql.begin(async (tx) => {
    const ids = [];
    for (const r of toCreate) {
      const employee = await Employee.create({
        ...r.data,
        branch_id: branchId,
        employee_id_number: r.data.id_or_residency_number,
        status: undefined, // server decides: active
        data_completion_status: 'incomplete',
        created_by: userId,
        updated_by: userId,
      }, tx);
      await tx`
        INSERT INTO employee_branches (employee_id, branch_id, is_primary, added_by)
        VALUES (${employee.id}, ${branchId}, true, ${userId})
        ON CONFLICT (employee_id, branch_id) DO UPDATE SET is_primary = true
      `;
      ids.push(employee.id);
    }
    await recordAudit({
      entityType: 'branch', entityId: branchId, action: 'employee_import', actor, branchId,
      changes: { created: ids.length, skipped: checked.length - ids.length },
    }, { db: tx, strict: true });
    return ids;
  });

  clearByPrefix(`dashboard:summary:${branchId}`);
  clearByPrefix('branch-statistics');
  clearByPrefix('employees');
  return { created: created.length, skipped: checked.length - created.length, results: checked.map(({ row, status, errors }) => ({ row, status, errors })) };
}
