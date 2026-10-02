import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { api, sql, lastOtpCode, closeAll, baseUrl } from './helpers.js';
import { up as migrate025 } from '../database/migrations/025-auth-accounts.js';
import { up as migrate026 } from '../database/migrations/026-employee-lifecycle.js';
import { COLUMNS } from '../services/employeeImportService.js';

// ids 930000-930099 belong to this file
const ID_LO = 930000;
const ID_HI = 930099;
const MAIN = { id: 930001, username: 'i_main', password: 'MainPw-123' };
const B1 = { id: 930011, username: 'i_branch1', password: 'BranchPw-1', email: 'i_b1@example.test' };
const B2 = { id: 930012, username: 'i_branch2', password: 'BranchPw-2', email: 'i_b2@example.test' };
const USERNAMES = [MAIN, B1, B2].map((a) => a.username);

let mainToken; let b1Token;

async function cleanup() {
  await sql`DELETE FROM audit_log WHERE entity_type = 'branch' AND entity_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM employees WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM login_events WHERE account_id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM users WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM branches WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
}

async function branchToken(b) {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${b.id}`;
  const login = await api('/api/auth/login', { method: 'POST', body: { username: b.username, password: b.password } });
  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: login.body.otp_session, otp: lastOtpCode() } });
  return ok.body.token;
}

async function workbook(rows, { dropColumn } = {}) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('الموظفون');
  const cols = COLUMNS.filter((c) => c.key !== dropColumn);
  ws.addRow(cols.map((c) => c.header));
  for (const r of rows) ws.addRow(cols.map((c) => r[c.key] ?? ''));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(path, token, buffer, fields = {}) {
  const form = new FormData();
  form.append('file', new Blob([buffer]), 'employees.xlsx');
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  const res = await fetch(baseUrl + path, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: res.status, body: await res.json() };
}

const good = (n) => ({
  first_name: 'أحمد', second_name: 'علي', third_name: 'حسن', fourth_name: `الاختبار${n}`,
  id_or_residency_number: `19300${String(n).padStart(5, '0')}`, nationality: 'السعودية', job_title: 'معلم', gender: 'ذكر', date_of_birth: '1990-05-17',
  phone_number: '0500000001', email: `imp${n}@example.test`, bank_iban: `SA${'0'.repeat(20)}${String(n).padStart(2, '0')}`,
  bank_name: 'مصرف الراجحي', national_address: 'ABCD1234', contract_type: 'قوى', contract_start_date: '2026-09-01', contract_end_date: '2027-06-30',
});

before(async () => {
  await migrate025(sql);
  await migrate026(sql);
  await cleanup();
  await sql`INSERT INTO users (id, username, password, role, full_name, email, is_active) VALUES (${MAIN.id}, ${MAIN.username}, ${MAIN.password}, 'main_manager', 'I Main', 'i_main@example.test', true)`;
  for (const b of [B1, B2]) {
    await sql`INSERT INTO branches (id, branch_name, branch_location, branch_type, username, password, email, is_active) VALUES (${b.id}, ${'Test ' + b.username}, 'x', 'school', ${b.username}, ${b.password}, ${b.email}, true)`;
  }
  mainToken = (await api('/api/auth/login', { method: 'POST', body: { username: MAIN.username, password: MAIN.password } })).body.token;
  b1Token = await branchToken(B1);
});

after(async () => {
  await cleanup();
  await closeAll();
  process.exit(0);
});

test('template downloads as an xlsx with the Arabic headers', async () => {
  const res = await fetch(`${baseUrl}/api/employee-import/template`, { headers: { Authorization: `Bearer ${b1Token}` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /spreadsheetml/);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(Buffer.from(await res.arrayBuffer()));
  assert.equal(wb.worksheets[0].getRow(1).getCell(1).value, 'الاسم الأول');
});

test('preview validates every row and writes nothing', async () => {
  const buffer = await workbook([
    good(1),
    { ...good(2), id_or_residency_number: '12345' },          // bad id
    { ...good(3), gender: 'x' },                               // bad gender
    { ...good(4), first_name: '' },                            // missing name
    { ...good(1), first_name: 'مكرر' },                        // duplicate of row 1 inside the file
  ]);
  const res = await upload('/api/employee-import/preview', b1Token, buffer);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { counts, rows } = res.body.data;
  assert.deepEqual(counts, { total: 5, ok: 1, error: 3, duplicate: 1 });
  assert.equal(rows[0].status, 'ok');
  assert.equal(rows[0].data.id_type, 'citizen');
  assert.match(rows[0].data.date_of_birth_hijri, /^\d{2}\/\d{2}\/\d{4}$/);
  assert.equal(rows[4].status, 'duplicate');
  const [n] = await sql`SELECT COUNT(*)::int AS n FROM employees WHERE branch_id = ${B1.id}`;
  assert.equal(n.n, 0);
});

test('a file without the required columns is refused with a clear message', async () => {
  const res = await upload('/api/employee-import/preview', b1Token, await workbook([good(1)], { dropColumn: 'id_or_residency_number' }));
  assert.equal(res.status, 400);
  assert.match(res.body.message, /رقم الهوية/);
  const notExcel = await upload('/api/employee-import/preview', b1Token, Buffer.from('not a spreadsheet'));
  assert.equal(notExcel.status, 400);
});

test('commit creates only the valid rows, as active/incomplete with a primary branch link; re-validates what the client sends', async () => {
  const buffer = await workbook([good(11), good(12)]);
  const preview = await upload('/api/employee-import/preview', b1Token, buffer);
  const raws = preview.body.data.rows.filter((r) => r.status === 'ok').map((r) => r.raw);
  // tamper: a bad row sneaks into the commit payload
  raws.push({ ...good(13), id_or_residency_number: 'abc' });

  const res = await api('/api/employee-import/commit', { method: 'POST', token: b1Token, body: { rows: raws } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.created, 2, JSON.stringify(res.body.data.results));
  assert.equal(res.body.data.skipped, 1);

  const rows = await sql`
    SELECT e.status, e.is_active, e.data_completion_status, e.branch_id, e.gender, e.employee_id_number, e.id_or_residency_number,
           (SELECT is_primary FROM employee_branches eb WHERE eb.employee_id = e.id AND eb.branch_id = e.branch_id) AS primary_link
    FROM employees e WHERE e.branch_id = ${B1.id} ORDER BY e.id`;
  assert.equal(rows.length, 2);
  for (const r of rows) {
    assert.equal(r.status, 'active');
    assert.equal(r.is_active, true);
    assert.equal(r.data_completion_status, 'incomplete');
    assert.equal(r.gender, 'male');
    assert.equal(r.primary_link, true);
    assert.equal(r.employee_id_number, r.id_or_residency_number);
  }

  // a second import of the same people creates nothing
  const again = await api('/api/employee-import/commit', { method: 'POST', token: b1Token, body: { rows: [good(11)] } });
  assert.equal(again.body.data.created, 0);
});

test('a branch manager always imports into their own branch; the head office must name one', async () => {
  const res = await api('/api/employee-import/commit', { method: 'POST', token: b1Token, body: { branch_id: B2.id, rows: [good(21)] } });
  assert.equal(res.status, 200);
  const [n] = await sql`SELECT COUNT(*)::int AS n FROM employees WHERE branch_id = ${B2.id}`;
  assert.equal(n.n, 0, 'branch_id in the body must be ignored for a branch manager');

  const noBranch = await api('/api/employee-import/commit', { method: 'POST', token: mainToken, body: { rows: [good(22)] } });
  assert.equal(noBranch.status, 400);
  const asMain = await api('/api/employee-import/commit', { method: 'POST', token: mainToken, body: { branch_id: B2.id, rows: [good(22)] } });
  assert.equal(asMain.status, 200, JSON.stringify(asMain.body));
  assert.equal(asMain.body.data.created, 1);
});
