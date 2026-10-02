import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, sql, outbox, lastOtpCode, closeAll } from './helpers.js';
import { up as migrate025 } from '../database/migrations/025-auth-accounts.js';
import { up as migrate026 } from '../database/migrations/026-employee-lifecycle.js';

// ids 910000-910099 belong to this file (auth tests use 900000-900099)
const ID_LO = 910000;
const ID_HI = 910099;
const MAIN = { id: 910001, username: 'e_main', password: 'MainPw-123' };
const OPS_EMPTY = { id: 910002, username: 'e_ops_empty', password: 'OpsPw-123', email: 'e_ops_empty@example.test' };
const OPS_B1 = { id: 910003, username: 'e_ops_b1', password: 'OpsPw-123', email: 'e_ops_b1@example.test' };
const B1 = { id: 910011, username: 'e_branch1', password: 'BranchPw-1', email: 'e_b1@example.test' };
const B2 = { id: 910012, username: 'e_branch2', password: 'BranchPw-2', email: 'e_b2@example.test' };
const USERNAMES = [MAIN, OPS_EMPTY, OPS_B1, B1, B2].map((a) => a.username);

let mainToken; let b1Token; let b2Token;
const emp = {}; // name -> id

async function insertBranch(b) {
  await sql`
    INSERT INTO branches (id, branch_name, branch_location, branch_type, username, password, email, is_active)
    VALUES (${b.id}, ${'Test ' + b.username}, 'test', 'school', ${b.username}, ${b.password}, ${b.email}, true)
  `;
}
async function insertUser(u, role, email = null) {
  await sql`
    INSERT INTO users (id, username, password, role, full_name, email, is_active)
    VALUES (${u.id}, ${u.username}, ${u.password}, ${role}, ${'Test ' + u.username}, ${email}, true)
  `;
}
async function insertEmployee(name, branchId, idNumber, extra = {}) {
  const [row] = await sql`
    INSERT INTO employees (branch_id, first_name, second_name, third_name, fourth_name, nationality,
                           id_or_residency_number, status, is_active, phone_number, bank_iban)
    VALUES (${branchId}, ${'T' + name}, 'Second', 'Third', 'Fourth', 'Saudi', ${idNumber},
            ${extra.status || 'active'}, ${(extra.status || 'active') === 'active' || extra.status === 'pending'},
            '0500000001', 'SA0000000000000000000001')
    RETURNING id
  `;
  await sql`INSERT INTO employee_branches (employee_id, branch_id, is_primary) VALUES (${row.id}, ${branchId}, true)`;
  emp[name] = row.id;
  return row.id;
}

async function cleanup() {
  await sql`DELETE FROM audit_log WHERE entity_type = 'employee' AND entity_id IN (SELECT id FROM employees WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI})`;
  await sql`DELETE FROM audit_log WHERE entity_type = 'branch' AND entity_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM employee_documents WHERE employee_id IN (SELECT id FROM employees WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI})`;
  await sql`DELETE FROM employees WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM user_branch_assignments WHERE user_id BETWEEN ${ID_LO} AND ${ID_HI} OR branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM login_events WHERE account_id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM users WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM branches WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
}

async function branchToken(b) {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${b.id}`;
  const login = await api('/api/auth/login', { method: 'POST', body: { username: b.username, password: b.password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: login.body.otp_session, otp: lastOtpCode() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return ok.body.token;
}
async function opsToken(u) {
  await sql`DELETE FROM user_otp_tokens WHERE user_id = ${u.id}`;
  const login = await api('/api/auth/login', { method: 'POST', body: { username: u.username, password: u.password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: login.body.otp_session, otp: lastOtpCode() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return ok.body.token;
}

before(async () => {
  await migrate025(sql);
  await migrate026(sql);
  await cleanup();
  await insertUser(MAIN, 'main_manager', 'e_main@example.test');
  await insertUser(OPS_EMPTY, 'branch_operations_manager', OPS_EMPTY.email);
  await insertUser(OPS_B1, 'branch_operations_manager', OPS_B1.email);
  await insertBranch(B1);
  await insertBranch(B2);
  await sql`INSERT INTO user_branch_assignments (user_id, branch_id) VALUES (${OPS_B1.id}, ${B1.id})`;

  await insertEmployee('b1a', B1.id, '1910000001');
  await insertEmployee('b1b', B1.id, '1910000002');
  await insertEmployee('b1c', B1.id, '1910000003');
  await insertEmployee('b2a', B2.id, '1910000011');
  await insertEmployee('b2b', B2.id, '1910000012');

  const login = await api('/api/auth/login', { method: 'POST', body: { username: MAIN.username, password: MAIN.password } });
  mainToken = login.body.token;
  b1Token = await branchToken(B1);
  b2Token = await branchToken(B2);
});

after(async () => {
  await cleanup();
  await closeAll();
  process.exit(0);
});

test('migration 026 leaves every employee with exactly one primary branch link', async () => {
  const [noPrimary] = await sql`
    SELECT COUNT(*)::int AS n FROM employees e
    WHERE e.branch_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM employee_branches eb WHERE eb.employee_id = e.id AND eb.is_primary)`;
  assert.equal(noPrimary.n, 0);
  const [multi] = await sql`
    SELECT COUNT(*)::int AS n FROM (SELECT employee_id FROM employee_branches WHERE is_primary GROUP BY 1 HAVING COUNT(*) > 1) x`;
  assert.equal(multi.n, 0);
});

test('operations manager: no assignments sees nothing; assigned sees only their branch; no single-employee access', async () => {
  const emptyToken = await opsToken(OPS_EMPTY);
  const list = await api('/api/employees', { token: emptyToken });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 0, 'an ops manager without branches must not see all employees');
  const paginated = await api('/api/employees/paginated', { token: emptyToken });
  assert.equal(paginated.status, 200);
  assert.equal((paginated.body.data ?? paginated.body.employees ?? []).length, 0);

  const token = await opsToken(OPS_B1);
  const mine = await api('/api/employees', { token });
  assert.equal(mine.status, 200);
  assert.ok(mine.body.data.length >= 3);
  assert.ok(mine.body.data.every((e) => e.branch_id === B1.id));

  for (const path of [`/api/employees/${emp.b1a}`, `/api/employees/${emp.b2a}`, `/api/employees/${emp.b1a}/documents`, `/api/employees/${emp.b1a}/history`]) {
    assert.equal((await api(path, { token })).status, 403, path);
  }
  const status = await api(`/api/employees/${emp.b1a}/status`, { method: 'PUT', token, body: { status: 'resigned' } });
  assert.equal(status.status, 403);
});

test('branch manager sees and changes only their own branch employees', async () => {
  assert.equal((await api(`/api/employees/${emp.b1a}`, { token: b1Token })).status, 200);
  assert.equal((await api(`/api/employees/${emp.b2a}`, { token: b1Token })).status, 403);
  assert.equal((await api(`/api/employees/${emp.b2a}/documents`, { token: b1Token })).status, 403);
  const status = await api(`/api/employees/${emp.b2a}/status`, { method: 'PUT', token: b1Token, body: { status: 'resigned' } });
  assert.equal(status.status, 403);
  const [row] = await sql`SELECT status FROM employees WHERE id = ${emp.b2a}`;
  assert.equal(row.status, 'active');
});

test('branch manager statistics work (a scoped branch list used to crash the query and wedge the connection)', async () => {
  const res = await api('/api/employees/statistics', { token: b1Token });
  assert.equal(res.status, 200);
  assert.ok(res.body.success !== false);
  // the connection pool must still answer afterwards
  assert.equal((await api(`/api/employees/${emp.b1a}`, { token: b1Token })).status, 200);
});

test('offboarding: reason, last working day, history; branch manager cannot restore, main manager can', async () => {
  const off = await api(`/api/employees/${emp.b1a}/offboard`, {
    method: 'POST', token: b1Token,
    body: { status: 'resigned', reason: 'Moved abroad', last_working_day: '2026-09-30', exit_notes: 'handover done', rehire_eligible: true }
  });
  assert.equal(off.status, 200, JSON.stringify(off.body));
  const [row] = await sql`SELECT status, is_active, status_change_reason, last_working_day, rehire_eligible FROM employees WHERE id = ${emp.b1a}`;
  assert.equal(row.status, 'resigned');
  assert.equal(row.is_active, false);
  assert.equal(row.status_change_reason, 'Moved abroad');
  assert.equal(String(row.last_working_day.toISOString?.().slice(0, 10) ?? row.last_working_day).slice(0, 10), '2026-09-30');
  assert.equal(row.rehire_eligible, true);

  const history = await api(`/api/employees/${emp.b1a}/history`, { token: mainToken });
  assert.equal(history.status, 200);
  assert.equal(history.body.data.status_history[0].to_status, 'resigned');
  assert.equal(history.body.data.status_history[0].actor_kind, 'branch');
  assert.ok(history.body.data.audit.some((a) => a.action === 'archive'));

  const badReason = await api(`/api/employees/${emp.b1b}/offboard`, { method: 'POST', token: b1Token, body: { status: 'active' } });
  assert.equal(badReason.status, 400);

  const tryRestore = await api(`/api/employees/${emp.b1a}/status`, { method: 'PUT', token: b1Token, body: { status: 'active' } });
  assert.equal(tryRestore.status, 403);

  const restore = await api(`/api/employees/${emp.b1a}/status`, { method: 'PUT', token: mainToken, body: { status: 'active' } });
  assert.equal(restore.status, 200, JSON.stringify(restore.body));
  const [after] = await sql`SELECT status, is_active, last_working_day FROM employees WHERE id = ${emp.b1a}`;
  assert.equal(after.status, 'active');
  assert.equal(after.is_active, true);
  assert.equal(after.last_working_day, null);
});

test('partial update: only the sent fields change, identity edit is head-office only, bad input is refused', async () => {
  // branch manager: phone only (no names required)
  const phone = await api(`/api/employees/${emp.b1b}`, { method: 'PUT', token: b1Token, body: { phone_number: '0511111111' } });
  assert.equal(phone.status, 200, JSON.stringify(phone.body));
  const [afterPhone] = await sql`SELECT phone_number, first_name, bank_iban FROM employees WHERE id = ${emp.b1b}`;
  assert.equal(afterPhone.phone_number, '0511111111');
  assert.equal(afterPhone.first_name, 'Tb1b');
  assert.equal(afterPhone.bank_iban, 'SA0000000000000000000001');

  // invalid phone refused
  const bad = await api(`/api/employees/${emp.b1b}`, { method: 'PUT', token: b1Token, body: { phone_number: '12345' } });
  assert.equal(bad.status, 400);

  // branch manager cannot change the ID number; it is reported as ignored
  const idAttempt = await api(`/api/employees/${emp.b1b}`, {
    method: 'PUT', token: b1Token, body: { id_or_residency_number: '1999999999', email: 'x@example.test' }
  });
  assert.equal(idAttempt.status, 200, JSON.stringify(idAttempt.body));
  assert.deepEqual(idAttempt.body.ignored_fields, ['id_or_residency_number']);
  const [stillSame] = await sql`SELECT id_or_residency_number FROM employees WHERE id = ${emp.b1b}`;
  assert.equal(stillSame.id_or_residency_number, '1910000002');

  // head office can correct it; Arabic-Indic digits are normalised; duplicates are refused
  const fix = await api(`/api/employees/${emp.b1b}`, { method: 'PUT', token: mainToken, body: { id_or_residency_number: '١٩١٠٠٠٠١٠٢' } });
  assert.equal(fix.status, 200, JSON.stringify(fix.body));
  const [fixed] = await sql`SELECT id_or_residency_number FROM employees WHERE id = ${emp.b1b}`;
  assert.equal(fixed.id_or_residency_number, '1910000102');
  const dup = await api(`/api/employees/${emp.b1b}`, { method: 'PUT', token: mainToken, body: { id_or_residency_number: '1910000001' } });
  assert.equal(dup.status, 409);

  // clearing an optional field really clears it
  const clear = await api(`/api/employees/${emp.b1b}`, { method: 'PUT', token: mainToken, body: { email: '' } });
  assert.equal(clear.status, 200);
  const [cleared] = await sql`SELECT email FROM employees WHERE id = ${emp.b1b}`;
  assert.equal(cleared.email, null);

  // stale edit guard
  const [fresh] = await sql`SELECT updated_at FROM employees WHERE id = ${emp.b1b}`;
  const stale = await api(`/api/employees/${emp.b1b}`, {
    method: 'PUT', token: mainToken,
    body: { phone_number: '0522222222', expected_updated_at: new Date(fresh.updated_at.getTime() - 5000).toISOString() }
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'STALE_EMPLOYEE');

  // nothing valid to update
  const none = await api(`/api/employees/${emp.b1b}`, { method: 'PUT', token: mainToken, body: { not_a_field: 1 } });
  assert.equal(none.status, 400);

  // audit trail has the field changes
  const history = await api(`/api/employees/${emp.b1b}/history`, { token: mainToken });
  assert.ok(history.body.data.audit.some((a) => a.action === 'update'));
});

test('transfer removes the old link; archived employees cannot be transferred; bulk transfer reports per employee', async () => {
  const t = await api(`/api/employees/${emp.b1c}/transfer`, { method: 'PUT', token: mainToken, body: { target_branch_id: B2.id } });
  assert.equal(t.status, 200, JSON.stringify(t.body));
  const links = await sql`SELECT branch_id, is_primary FROM employee_branches WHERE employee_id = ${emp.b1c}`;
  assert.deepEqual(links.map((l) => [l.branch_id, l.is_primary]), [[B2.id, true]]);
  // the old branch no longer sees them
  assert.equal((await api(`/api/employees/${emp.b1c}`, { token: b1Token })).status, 403);

  const keep = await api(`/api/employees/${emp.b1c}/transfer`, { method: 'PUT', token: mainToken, body: { target_branch_id: B1.id, keep_old_as_secondary: true } });
  assert.equal(keep.status, 200);
  const links2 = await sql`SELECT branch_id, is_primary FROM employee_branches WHERE employee_id = ${emp.b1c} ORDER BY branch_id`;
  assert.equal(links2.length, 2);
  assert.equal(links2.filter((l) => l.is_primary).length, 1);

  await sql`UPDATE employees SET status = 'resigned', is_active = false WHERE id = ${emp.b2b}`;
  const bulk = await api('/api/employees/bulk/transfer', {
    method: 'POST', token: mainToken, body: { employee_ids: [emp.b2b, emp.b2a], target_branch_id: B1.id }
  });
  assert.equal(bulk.status, 200, JSON.stringify(bulk.body));
  const byId = Object.fromEntries(bulk.body.data.map((r) => [r.id, r]));
  assert.equal(byId[emp.b2b].ok, false);
  assert.equal(byId[emp.b2b].code, 'EMPLOYEE_ARCHIVED');
  assert.equal(byId[emp.b2a].ok, true);
  // put them back for the next tests
  await api(`/api/employees/${emp.b2a}/transfer`, { method: 'PUT', token: mainToken, body: { target_branch_id: B2.id } });
  await sql`UPDATE employees SET status = 'active', is_active = true WHERE id = ${emp.b2b}`;
});

test('bulk archive: a branch manager can only archive their own branch employees', async () => {
  const res = await api('/api/employees/bulk/archive', {
    method: 'POST', token: b1Token, body: { employee_ids: [emp.b1b, emp.b2b], status: 'contract_ended', reason: 'End of year' }
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const byId = Object.fromEntries(res.body.data.map((r) => [r.id, r]));
  assert.equal(byId[emp.b1b].ok, true);
  assert.equal(byId[emp.b2b].ok, false);
  assert.equal(byId[emp.b2b].code, 'FORBIDDEN');
  const [b2b] = await sql`SELECT status FROM employees WHERE id = ${emp.b2b}`;
  assert.equal(b2b.status, 'active');
  await api(`/api/employees/${emp.b1b}/status`, { method: 'PUT', token: mainToken, body: { status: 'active' } });
});

test('create ignores client-supplied status and year; link-to-branch needs the ID number; duplicates are minimal', async () => {
  const create = await api('/api/employees', {
    method: 'POST', token: b1Token,
    body: {
      first_name: 'New', second_name: 'Hire', third_name: 'Third', fourth_name: 'Fourth',
      id_or_residency_number: '1910000555', job_title: 'Teacher', phone_number: '0533333333', email: 'newhire@example.test',
      gender: 'male', bank_iban: 'SA0000000000000000000555', bank_name: 'Test Bank', national_address: 'ABCD1234',
      nationality: 'Saudi', date_of_birth_hijri: '01/01/1410', date_of_birth_gregorian: '1989-08-02',
      status: 'resigned', academic_year: '19-20', branch_id: B1.id
    }
  });
  assert.ok([200, 201].includes(create.status), JSON.stringify(create.body));
  const newId = create.body.data.id;
  emp.newHire = newId;
  const [row] = await sql`SELECT status, is_active, academic_year FROM employees WHERE id = ${newId}`;
  assert.equal(row.status, 'active');
  assert.equal(row.is_active, true);
  assert.notEqual(row.academic_year, '19-20');

  // link: B1 manager wants B2's employee: needs the matching ID number
  const noProof = await api('/api/employees/link-to-branch', { method: 'POST', token: b1Token, body: { employee_id: emp.b2a } });
  assert.equal(noProof.status, 403);
  const wrongProof = await api('/api/employees/link-to-branch', { method: 'POST', token: b1Token, body: { employee_id: emp.b2a, id_or_residency_number: '1111111111' } });
  assert.equal(wrongProof.status, 403);
  const proof = await api('/api/employees/link-to-branch', { method: 'POST', token: b1Token, body: { employee_id: emp.b2a, id_or_residency_number: '1910000011' } });
  assert.equal(proof.status, 200, JSON.stringify(proof.body));

  const dup = await api('/api/employees/check-duplicate', { method: 'POST', token: b1Token, body: { id_or_residency_number: '1910000011' } });
  assert.equal(dup.status, 200);
  assert.equal(dup.body.hasDuplicates, true);
  assert.deepEqual(Object.keys(dup.body.duplicates[0]).sort(), ['branch_name', 'id', 'name', 'status']);
});

test('document search is limited to the branch manager’s employees', async () => {
  await sql`INSERT INTO employee_documents (employee_id, document_type, file_name, file_path, mime_type, is_active)
            VALUES (${emp.b1b}, 'passport', 'zz-scope-b1.pdf', 'x', 'application/pdf', true),
                   (${emp.b2b}, 'passport', 'zz-scope-b2.pdf', 'x', 'application/pdf', true)`;
  const res = await api('/api/documents?search=zz-scope', { token: b1Token });
  assert.equal(res.status, 200);
  const names = res.body.data.map((d) => d.file_name);
  assert.ok(names.includes('zz-scope-b1.pdf'));
  assert.ok(!names.includes('zz-scope-b2.pdf'), 'must not return another branch’s documents');
  const asMain = await api('/api/documents?search=zz-scope', { token: mainToken });
  assert.equal(asMain.body.data.filter((d) => d.file_name.startsWith('zz-scope')).length, 2);
});

test('deactivating a branch archives its employees atomically; reactivating restores exactly them', async () => {
  await sql`UPDATE employees SET status = 'pending' WHERE id = ${emp.b2a}`;
  await sql`UPDATE employees SET status = 'resigned', is_active = false WHERE id = ${emp.b2b}`; // already left: must stay archived
  await sql`INSERT INTO user_branch_assignments (user_id, branch_id) VALUES (${OPS_B1.id}, ${B2.id}) ON CONFLICT DO NOTHING`;

  const del = await api(`/api/branches/${B2.id}`, { method: 'DELETE', token: mainToken });
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.ok(del.body.archivedEmployeesCount >= 1);
  const [a] = await sql`SELECT status, archived_via_branch_id FROM employees WHERE id = ${emp.b2a}`;
  assert.equal(a.status, 'other');
  assert.equal(a.archived_via_branch_id, B2.id);
  const [b] = await sql`SELECT status, archived_via_branch_id FROM employees WHERE id = ${emp.b2b}`;
  assert.equal(b.status, 'resigned');
  assert.equal(b.archived_via_branch_id, null);
  const assignments = await sql`SELECT 1 FROM user_branch_assignments WHERE branch_id = ${B2.id}`;
  assert.equal(assignments.length, 0);
  // the branch's session ends
  assert.equal((await api('/api/auth/me', { token: b2Token })).status, 401);

  // restoring an employee of a deactivated branch is refused
  const blocked = await api(`/api/employees/${emp.b2a}/status`, { method: 'PUT', token: mainToken, body: { status: 'active' } });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error, 'BRANCH_INACTIVE_FOR_RESTORE');

  const back = await api(`/api/branches/${B2.id}/reactivate`, { method: 'POST', token: mainToken, body: {} });
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(back.body.restoredEmployeesCount, 1);
  const [restored] = await sql`SELECT status, is_active FROM employees WHERE id = ${emp.b2a}`;
  assert.equal(restored.status, 'pending', 'previous status is restored');
  assert.equal(restored.is_active, true);
  const [still] = await sql`SELECT status FROM employees WHERE id = ${emp.b2b}`;
  assert.equal(still.status, 'resigned');
});

test('PDF report routes refuse another branch’s data and employee lists are never browser-cached', async () => {
  const students = await api('/api/students-report/generate-pdf', { method: 'POST', token: b1Token, body: { branchId: B2.id } });
  assert.equal(students.status, 403);
  const buses = await api('/api/bus-transportation/generate-pdf', { method: 'POST', token: b1Token, body: { branchId: B2.id } });
  assert.equal(buses.status, 403);

  const res = await fetch(`${(await import('./helpers.js')).baseUrl}/api/employees`, { headers: { Authorization: `Bearer ${mainToken}` } });
  assert.match(res.headers.get('cache-control'), /no-store/);
});
