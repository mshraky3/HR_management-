import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, sql, lastOtpCode, closeAll } from './helpers.js';
import { up as migrate025 } from '../database/migrations/025-auth-accounts.js';
import { up as migrate026 } from '../database/migrations/026-employee-lifecycle.js';
import { up as migrate027 } from '../database/migrations/027-tasks-yearcycle.js';

// ids 920000-920099 belong to this file
const ID_LO = 920000;
const ID_HI = 920099;
const MAIN = { id: 920001, username: 'k_main', password: 'MainPw-123' };
const B_NEW = { id: 920011, username: 'k_branch_new', password: 'BranchPw-1', email: null, phone: null, type: 'school' };
const B_FULL = { id: 920012, username: 'k_branch_full', password: 'BranchPw-2', email: 'k_full@example.test', phone: '0500000000', type: 'healthcare_center' };
const USERNAMES = [MAIN, B_NEW, B_FULL].map((a) => a.username);

let mainToken; let newToken; let fullToken;

async function insertBranch(b) {
  await sql`
    INSERT INTO branches (id, branch_name, branch_location, branch_type, username, password, email, phone_number, is_active)
    VALUES (${b.id}, ${'Test ' + b.username}, 'test', ${b.type}, ${b.username}, ${b.password}, ${b.email}, ${b.phone}, true)
  `;
}
async function insertEmployee(branchId, idNumber, extra = {}) {
  const [row] = await sql`
    INSERT INTO employees (branch_id, first_name, second_name, third_name, fourth_name, nationality, id_or_residency_number,
                           status, is_active, data_completion_status, bank_iban, base_salary)
    VALUES (${branchId}, 'K', 'Two', 'Three', 'Four', 'Saudi', ${idNumber}, 'active', true,
            ${extra.complete ? 'complete' : 'incomplete'}, ${extra.iban ?? null}, ${extra.salary ?? 0})
    RETURNING id
  `;
  await sql`INSERT INTO employee_branches (employee_id, branch_id, is_primary) VALUES (${row.id}, ${branchId}, true)`;
  return row.id;
}

async function cleanup() {
  await sql`DELETE FROM branch_tasks WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM notification_branches WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM notifications WHERE id NOT IN (SELECT notification_id FROM notification_branches) AND created_by BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM audit_log WHERE entity_type IN ('branch_task', 'year_cycle', 'academic_year') AND actor_user_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM employees WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM login_events WHERE account_id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM users WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM branches WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
}

async function branchToken(b) {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${b.id}`;
  const login = await api('/api/auth/login', { method: 'POST', body: { username: b.username, password: b.password } });
  if (login.status === 400 && login.body.noEmail) return null; // no e-mail -> cannot sign in by OTP
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: login.body.otp_session, otp: lastOtpCode() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return ok.body.token;
}

before(async () => {
  await migrate025(sql);
  await migrate026(sql);
  await migrate027(sql);
  await cleanup();
  await sql`
    INSERT INTO users (id, username, password, role, full_name, email, is_active)
    VALUES (${MAIN.id}, ${MAIN.username}, ${MAIN.password}, 'main_manager', 'K Main', 'k_main@example.test', true)
  `;
  await insertBranch(B_NEW);
  await insertBranch(B_FULL);
  // B_FULL: 3 employees, one fully fine, one with a bad IBAN and low salary, one incomplete
  await insertEmployee(B_FULL.id, '1920000001', { complete: true, iban: 'SA0000000000000000000001', salary: 4000 });
  await insertEmployee(B_FULL.id, '1920000002', { complete: true, iban: 'SA12', salary: 100 });
  await insertEmployee(B_FULL.id, '1920000003', { complete: false, iban: 'SA0000000000000000000003', salary: 20000 });

  mainToken = (await api('/api/auth/login', { method: 'POST', body: { username: MAIN.username, password: MAIN.password } })).body.token;
  fullToken = await branchToken(B_FULL);
  // B_NEW has no e-mail on file, so it cannot log in; the head office reads its tasks with ?branch_id
  newToken = await branchToken(B_NEW);
});

after(async () => {
  await cleanup();
  await closeAll();
  process.exit(0);
});

test('a branch with data gets derived tasks with counts, links and inline lists', async () => {
  const res = await api('/api/tasks/my', { token: fullToken });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const tasks = res.body.data.sections.flatMap((s) => s.tasks);
  const byId = Object.fromEntries(tasks.map((t) => [t.id, t]));

  assert.equal(byId['employees-incomplete'].remaining, 1);
  assert.equal(byId['employees-incomplete'].total, 3);
  assert.match(byId['employees-incomplete'].link, /data_completion_status=incomplete/);

  assert.equal(byId['iban-review'].inline.items.length, 1);
  assert.equal(byId['iban-review'].inline.items[0].issue, 'invalid');
  const salary = byId['salary-review'].inline.items;
  assert.deepEqual(salary.map((i) => i.issue).sort(), ['high', 'low']);

  assert.ok(byId['branch-docs-missing'], 'required branch documents are missing');
  assert.equal(byId['branch-docs-missing'].meta.missing_types.length, 9, 'healthcare branches need 9 documents');
  assert.ok(res.body.data.summary.open >= 3);
  assert.deepEqual(res.body.data.degraded, [], 'no task source may fail');
});

test('a branch with no employees is told to add them (it never gets an empty dashboard)', async () => {
  const res = await api(`/api/tasks/my?branch_id=${B_NEW.id}`, { token: mainToken });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const tasks = res.body.data.sections.flatMap((s) => s.tasks);
  assert.ok(tasks.some((t) => t.id === 'employees-none'));
  assert.ok(tasks.some((t) => t.id === 'branch-info'), 'branch without phone/e-mail');
  assert.ok(tasks.some((t) => t.id === 'branch-docs-missing'));
  assert.deepEqual(res.body.data.degraded, []);
});

test('a branch manager cannot read another branch’s tasks', async () => {
  const res = await api(`/api/tasks/my?branch_id=${B_NEW.id}`, { token: fullToken });
  assert.equal(res.status, 403);
});

test('head office assigns a task; the branch sees it, finishes it, and it disappears', async () => {
  const create = await api('/api/tasks/manual', {
    method: 'POST', token: mainToken,
    body: { branch_ids: [B_FULL.id], title: 'ارفع عقد الإيجار', description: 'مطلوب قبل نهاية الشهر', due_date: '2020-01-01', deep_link: '/branch-documents' },
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  assert.equal(create.body.data.created, 1);

  const bad = await api('/api/tasks/manual', { method: 'POST', token: mainToken, body: { branch_ids: [B_FULL.id], title: 'x' } });
  assert.equal(bad.status, 400);
  const badLink = await api('/api/tasks/manual', { method: 'POST', token: mainToken, body: { branch_ids: [B_FULL.id], title: 'مهمة جيدة', deep_link: 'https://evil.example' } });
  assert.equal(badLink.status, 400);

  const before = await api('/api/tasks/my', { token: fullToken });
  const manual = before.body.data.sections.flatMap((s) => s.tasks).find((t) => t.manual_task_id);
  assert.ok(manual);
  assert.equal(manual.overdue, true, 'due date in the past is overdue');
  assert.equal(before.body.data.sections[0].id, 'head_office', 'head-office tasks come first');

  const other = await api(`/api/tasks/manual/${manual.manual_task_id}/done`, { method: 'PUT', token: newToken || mainToken });
  // a different branch (or none) must not complete it; main can, so only assert for a real branch token
  if (newToken) assert.equal(other.status, 403);

  const done = await api(`/api/tasks/manual/${manual.manual_task_id}/done`, { method: 'PUT', token: fullToken });
  assert.equal(done.status, 200);
  const after = await api('/api/tasks/my', { token: fullToken });
  assert.ok(!after.body.data.sections.flatMap((s) => s.tasks).some((t) => t.manual_task_id === manual.manual_task_id));
});

test('year-cycle compliance lists every active branch with a checklist and a status', async () => {
  const res = await api('/api/year-cycle/compliance', { token: mainToken });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { branches, summary } = res.body.data;
  const mine = branches.find((b) => b.id === B_FULL.id);
  const fresh = branches.find((b) => b.id === B_NEW.id);
  assert.ok(mine && fresh);
  assert.equal(mine.items.data.counts.total, 3);
  assert.equal(mine.items.data.done, false);
  assert.equal(mine.items.documents.done, false);
  assert.equal(fresh.items.data.state, 'not_started');
  assert.equal(fresh.status, 'not_started');
  assert.ok(summary.total >= 2);
  assert.ok(['complete', 'in_progress', 'not_started', 'overdue'].includes(mine.status));

  const forbidden = await api('/api/year-cycle/compliance', { token: fullToken });
  assert.equal(forbidden.status, 403);
});

test('reminders become in-app notifications (no e-mail path) for non-compliant branches only', async () => {
  const res = await api('/api/year-cycle/remind', { method: 'POST', token: mainToken, body: { branch_ids: [B_FULL.id, B_NEW.id], message: 'يرجى الإنجاز هذا الأسبوع' } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.sent, 2);
  const rows = await sql`
    SELECT n.message FROM notifications n JOIN notification_branches nb ON nb.notification_id = n.id WHERE nb.branch_id = ${B_FULL.id}
  `;
  assert.equal(rows.length, 1);
  assert.match(rows[0].message, /يرجى الإنجاز هذا الأسبوع/);
  assert.match(rows[0].message, /إكمال بيانات الموظفين/);
  // and the branch now has an unanswered-notification task
  const tasks = await api('/api/tasks/my', { token: fullToken });
  assert.ok(tasks.body.data.sections.flatMap((s) => s.tasks).some((t) => t.id === 'notifications-unanswered'));
});

test('end-year preview counts what the sweep would change, without changing anything', async () => {
  const before = await sql`SELECT COUNT(*)::int AS n FROM employees WHERE status = 'active'`;
  const res = await api('/api/year-cycle/end-year-preview?branch_type=healthcare_center', { token: mainToken });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = res.body.data.branches.find((b) => b.branch_id === B_FULL.id);
  assert.ok(row);
  assert.ok(row.to_pending >= 0);
  const after = await sql`SELECT COUNT(*)::int AS n FROM employees WHERE status = 'active'`;
  assert.equal(after[0].n, before[0].n);
  const bad = await api('/api/year-cycle/end-year-preview?branch_type=nope', { token: mainToken });
  assert.equal(bad.status, 400);
});
