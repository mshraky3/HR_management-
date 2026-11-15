import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, sql, lastOtpCode, closeAll, baseUrl } from './helpers.js';
import { fileStore } from '../utils/branchRecordFiles.js';
import { ensureCriticalSchema, healAndRetry } from '../database/criticalSchema.js';

// ids 940000-940099 belong to this file
const ID_LO = 940000;
const ID_HI = 940099;
const MAIN = { id: 940001, username: 'r_main', password: 'MainPw-123' };
const OPS_H1 = { id: 940002, username: 'r_ops_h1', password: 'OpsPw-123', email: 'r_ops_h1@example.test' };
const OPS_NONE = { id: 940003, username: 'r_ops_none', password: 'OpsPw-123', email: 'r_ops_none@example.test' };
const H1 = { id: 940011, username: 'r_health1', password: 'BranchPw-1', email: 'r_h1@example.test', type: 'healthcare_center' };
const H2 = { id: 940012, username: 'r_health2', password: 'BranchPw-2', email: 'r_h2@example.test', type: 'healthcare_center' };
const S1 = { id: 940013, username: 'r_school1', password: 'BranchPw-3', email: 'r_s1@example.test', type: 'school' };
const USERNAMES = [MAIN, OPS_H1, OPS_NONE, H1, H2, S1].map((a) => a.username);

let mainToken; let opsH1Token; let opsNoneToken; let h1Token; let h2Token; let s1Token;

// ---- file store stub: nothing may reach the real R2 bucket --------------------------------------------------------------
const stored = new Map(); // url -> Buffer
const removed = [];
fileStore.put = async (buffer, fileName, mimeType, branchId, kind) => {
  const url = `https://stub.invalid/branches/${branchId}/${kind}/${stored.size + 1}-${Date.now()}`;
  stored.set(url, Buffer.from(buffer));
  return { url };
};
fileStore.remove = async (url) => { removed.push(url); stored.delete(url); return true; };
fileStore.read = async (url) => {
  if (!stored.has(url)) throw new Error('not stored');
  return { buffer: stored.get(url), contentType: 'application/pdf' };
};
fileStore.directUrl = async () => null;

const PDF = (text = 'x') => Buffer.from(`%PDF-1.4\n% ${text}\n%%EOF`);

async function form(path, { method = 'POST', token, fields = {}, file } = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.append(k, String(v));
  if (file) fd.append('file', new Blob([file.bytes], { type: file.type || 'application/pdf' }), file.name || 'doc.pdf');
  const res = await fetch(baseUrl + path, { method, headers: token ? { Authorization: `Bearer ${token}` } : {}, body: fd });
  let body = null;
  try { body = await res.json(); } catch { /* not JSON */ }
  return { status: res.status, body };
}

async function insertBranch(b) {
  await sql`
    INSERT INTO branches (id, branch_name, branch_location, branch_type, username, password, email, is_active)
    VALUES (${b.id}, ${'مركز ' + b.username}, 'test', ${b.type}, ${b.username}, ${b.password}, ${b.email}, true)`;
}
async function insertUser(u, role, email = null) {
  await sql`
    INSERT INTO users (id, username, password, role, full_name, email, is_active)
    VALUES (${u.id}, ${u.username}, ${u.password}, ${role}, ${'Test ' + u.username}, ${email}, true)`;
}
async function otpToken(table, idColumn, id, creds) {
  if (table === 'branch_otp_tokens') await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${id}`;
  else await sql`DELETE FROM user_otp_tokens WHERE user_id = ${id}`;
  const login = await api('/api/auth/login', { method: 'POST', body: { username: creds.username, password: creds.password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: login.body.otp_session, otp: lastOtpCode() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return ok.body.token;
}

async function cleanup() {
  await sql`DELETE FROM branch_achievements WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`.catch(() => {});
  await sql`DELETE FROM branch_partnerships WHERE branch_id BETWEEN ${ID_LO} AND ${ID_HI}`.catch(() => {});
  await sql`DELETE FROM audit_log WHERE entity_type IN ('branch_achievement', 'branch_partnership') AND branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM user_branch_assignments WHERE user_id BETWEEN ${ID_LO} AND ${ID_HI} OR branch_id BETWEEN ${ID_LO} AND ${ID_HI}`;
  await sql`DELETE FROM login_events WHERE account_id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM users WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
  await sql`DELETE FROM branches WHERE id BETWEEN ${ID_LO} AND ${ID_HI} OR username = ANY(${USERNAMES})`;
}

before(async () => {
  await api('/api/health'); // waits for the startup schema guard (it must create the new tables from migration 030)
  await cleanup();
  await insertUser(MAIN, 'main_manager', 'r_main@example.test');
  await insertUser(OPS_H1, 'branch_operations_manager', OPS_H1.email);
  await insertUser(OPS_NONE, 'branch_operations_manager', OPS_NONE.email);
  for (const b of [H1, H2, S1]) await insertBranch(b);
  await sql`INSERT INTO user_branch_assignments (user_id, branch_id) VALUES (${OPS_H1.id}, ${H1.id})`;

  mainToken = (await api('/api/auth/login', { method: 'POST', body: { username: MAIN.username, password: MAIN.password } })).body.token;
  h1Token = await otpToken('branch_otp_tokens', 'branch_id', H1.id, H1);
  h2Token = await otpToken('branch_otp_tokens', 'branch_id', H2.id, H2);
  s1Token = await otpToken('branch_otp_tokens', 'branch_id', S1.id, S1);
  opsH1Token = await otpToken('user_otp_tokens', 'user_id', OPS_H1.id, OPS_H1);
  opsNoneToken = await otpToken('user_otp_tokens', 'user_id', OPS_NONE.id, OPS_NONE);
});

after(async () => {
  await cleanup();
  await closeAll();
  process.exit(0);
});

// ---- schema -------------------------------------------------------------------------------------------------------------
test('migration 030 created both tables and recorded itself', async () => {
  const tables = await sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('branch_achievements', 'branch_partnerships')`;
  assert.equal(tables.length, 2);
  const [m] = await sql`SELECT 1 AS ok FROM schema_migrations WHERE name = '030-branch-achievements-partnerships.js'`;
  assert.ok(m, 'the schema guard ran migration 030');
});

test('partner_type is constrained in the database as well', async () => {
  await assert.rejects(() => sql`INSERT INTO branch_partnerships (branch_id, partner_name, partner_type) VALUES (${H1.id}, 'x', 'other')`, /check/i);
});

// ---- authentication -------------------------------------------------------------------------------------------------------
test('every route needs a login', async () => {
  for (const base of ['/api/branch-achievements', '/api/branch-partnerships']) {
    assert.equal((await api(base)).status, 401);
    assert.equal((await api(`${base}/1`)).status, 401);
    assert.equal((await api(base, { method: 'POST', body: {} })).status, 401);
  }
});

// ---- achievements ---------------------------------------------------------------------------------------------------------
let ach1; let ach2;

test('achievements: a healthcare branch adds an entry without a file', async () => {
  const res = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'شهادة شكر من وزارة الصحة', description: 'تقديراً لجهود المركز' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.title, 'شهادة شكر من وزارة الصحة');
  assert.equal(res.body.data.has_file, false);
  assert.equal('file_path' in res.body.data, false, 'storage location is never returned');
  ach1 = res.body.data.id;
});

test('achievements: a title is required, a bad date is refused', async () => {
  const noTitle = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, description: 'x' } });
  assert.equal(noTitle.status, 400);
  assert.match(noTitle.body.message, /مطلوب/);
  const longTitle = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'ع'.repeat(256) } });
  assert.equal(longTitle.status, 400);
  const badDate = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'x', achievement_date: '2025-13-45' } });
  assert.equal(badDate.status, 400);
});

test('achievements: both calendars are stored whichever one is typed', async () => {
  const res = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'درع التميز', issuer: 'جمعية', achievement_date: '2025-03-04' } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.match(String(res.body.data.achievement_date), /^2025-03-04/);
  assert.match(String(res.body.data.achievement_date_hijri), /^\d{2}\/\d{2}\/14\d{2}$/);
  ach2 = res.body.data.id;
  const hijriOnly = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'هجري فقط', achievement_date_hijri: '04/09/1446' } });
  assert.equal(hijriOnly.status, 201, JSON.stringify(hijriOnly.body));
  assert.match(String(hijriOnly.body.data.achievement_date), /^\d{4}-\d{2}-\d{2}/);
});

test('achievements: upload with an Arabic-named PDF, download it back, replace and remove it', async () => {
  const created = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'مع ملف' }, file: { bytes: PDF('one'), name: 'شهادة الشكر.pdf' } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const id = created.body.data.id;
  assert.equal(created.body.data.has_file, true);
  assert.equal(created.body.data.file_name, 'شهادة الشكر.pdf');
  assert.equal(created.body.data.mime_type, 'application/pdf');

  const dl = await fetch(`${baseUrl}/api/branch-achievements/${id}/download`, { headers: { Authorization: `Bearer ${h1Token}` } });
  assert.equal(dl.status, 200);
  assert.equal(decodeURIComponent(dl.headers.get('content-disposition').match(/filename="(.+)"/)[1]), 'شهادة الشكر.pdf');
  assert.equal((await dl.arrayBuffer()).byteLength, PDF('one').length);

  const before = removed.length;
  const replaced = await form(`/api/branch-achievements/${id}`, { method: 'PUT', token: h1Token, fields: { title: 'مع ملف جديد' }, file: { bytes: PDF('two'), name: 'new.pdf' } });
  assert.equal(replaced.status, 200, JSON.stringify(replaced.body));
  assert.equal(replaced.body.data.file_name, 'new.pdf');
  assert.equal(replaced.body.data.title, 'مع ملف جديد');
  assert.equal(removed.length, before + 1, 'the old file was deleted after the update succeeded');

  const stripped = await form(`/api/branch-achievements/${id}`, { method: 'PUT', token: h1Token, fields: { remove_file: 'true' } });
  assert.equal(stripped.status, 200);
  assert.equal(stripped.body.data.has_file, false);
  assert.equal(stripped.body.data.title, 'مع ملف جديد', 'fields that are not sent are kept');
  const gone = await fetch(`${baseUrl}/api/branch-achievements/${id}/download`, { headers: { Authorization: `Bearer ${h1Token}` } });
  assert.equal(gone.status, 404);
});

test('achievements: a file that is not a real PDF/image is refused and nothing is stored', async () => {
  const before = stored.size;
  const fake = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'مزيف' }, file: { bytes: Buffer.from('MZ not a pdf'), name: 'x.pdf' } });
  assert.equal(fake.status, 400);
  const exe = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'exe' }, file: { bytes: Buffer.from('x'), name: 'x.exe', type: 'application/octet-stream' } });
  assert.ok(exe.status === 400, `got ${exe.status}`);
  assert.equal(stored.size, before);
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM branch_achievements WHERE branch_id = ${H1.id} AND title IN ('مزيف', 'exe')`;
  assert.equal(n, 0);
});

test('achievements: list, search and edit', async () => {
  const list = await api('/api/branch-achievements', { token: h1Token });
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length >= 3);
  assert.ok(list.body.data.every((r) => r.branch_id === H1.id));
  const found = await api('/api/branch-achievements?search=' + encodeURIComponent('درع'), { token: h1Token });
  assert.deepEqual(found.body.data.map((r) => r.id), [ach2]);
  const wild = await api('/api/branch-achievements?search=' + encodeURIComponent('%'), { token: h1Token });
  assert.equal(wild.body.data.length, 0, '% is matched literally, not as a wildcard');
  const edit = await form(`/api/branch-achievements/${ach1}`, { method: 'PUT', token: h1Token, fields: { description: 'وصف محدّث', issuer: 'وزارة الصحة' } });
  assert.equal(edit.status, 200);
  assert.equal(edit.body.data.description, 'وصف محدّث');
  assert.equal(edit.body.data.title, 'شهادة شكر من وزارة الصحة');
  const clear = await form(`/api/branch-achievements/${ach1}`, { method: 'PUT', token: h1Token, fields: { issuer: '' } });
  assert.equal(clear.body.data.issuer, null);
});

test('achievements: a plain JSON update (the SPA edit without a file) works and clears dates', async () => {
  const created = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'JSON', achievement_date: '2025-03-04' } });
  const id = created.body.data.id;
  const upd = await api(`/api/branch-achievements/${id}`, { method: 'PUT', token: h1Token, body: { title: 'JSON محدّث', description: 'وصف', achievement_date: '', achievement_date_hijri: '' } });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.data.title, 'JSON محدّث');
  assert.equal(upd.body.data.achievement_date, null);
  assert.equal(upd.body.data.achievement_date_hijri, null);
  const noTitle = await api(`/api/branch-achievements/${id}`, { method: 'PUT', token: h1Token, body: { title: '   ' } });
  assert.equal(noTitle.status, 400);
});

test('search also matches the branch name (head office view)', async () => {
  const hit = await api('/api/branch-achievements?search=' + encodeURIComponent(H1.username), { token: mainToken });
  assert.ok(hit.body.data.length >= 1);
  assert.ok(hit.body.data.every((r) => r.branch_id === H1.id));
});

// ---- access control ---------------------------------------------------------------------------------------------------------
test('access: another branch cannot see, read, edit, download or delete a record', async () => {
  const list = await api('/api/branch-achievements', { token: h2Token });
  assert.equal(list.status, 200);
  assert.equal(list.body.data.length, 0);
  assert.equal((await api(`/api/branch-achievements?branch_id=${H1.id}`, { token: h2Token })).status, 403);
  assert.equal((await api(`/api/branch-achievements/${ach1}`, { token: h2Token })).status, 403);
  assert.equal((await api(`/api/branch-achievements/${ach1}/download`, { token: h2Token })).status, 403);
  assert.equal((await form(`/api/branch-achievements/${ach1}`, { method: 'PUT', token: h2Token, fields: { title: 'hijack' } })).status, 403);
  assert.equal((await api(`/api/branch-achievements/${ach1}`, { method: 'DELETE', token: h2Token })).status, 403);
  assert.equal((await form('/api/branch-achievements', { token: h2Token, fields: { branch_id: H1.id, title: 'للفرع الآخر' } })).status, 403);
  const [row] = await sql`SELECT title, is_active FROM branch_achievements WHERE id = ${ach1}`;
  assert.equal(row.title, 'شهادة شكر من وزارة الصحة');
  assert.equal(row.is_active, true);
});

test('access: a school branch cannot use the healthcare sections', async () => {
  const create = await form('/api/branch-achievements', { token: s1Token, fields: { branch_id: S1.id, title: 'مدرسة' } });
  assert.equal(create.status, 400);
  assert.match(create.body.message, /الرعاية الصحية/);
  const partner = await form('/api/branch-partnerships', { token: s1Token, fields: { branch_id: S1.id, partner_name: 'x', partner_type: 'private' } });
  assert.equal(partner.status, 400);
  const asMain = await form('/api/branch-achievements', { token: mainToken, fields: { branch_id: S1.id, title: 'مدرسة' } });
  assert.equal(asMain.status, 400, 'the head office cannot add them to a school either');
});

test('access: operations manager sees and edits only the assigned branch', async () => {
  const mine = await form('/api/branch-achievements', { token: opsH1Token, fields: { branch_id: H1.id, title: 'من مسؤول العمليات' } });
  assert.equal(mine.status, 201, JSON.stringify(mine.body));
  const other = await form('/api/branch-achievements', { token: opsH1Token, fields: { branch_id: H2.id, title: 'فرع غير مسند' } });
  assert.equal(other.status, 403);

  const h2Rec = await form('/api/branch-achievements', { token: mainToken, fields: { branch_id: H2.id, title: 'سجل الفرع الثاني' } });
  assert.equal(h2Rec.status, 201);
  const list = await api('/api/branch-achievements', { token: opsH1Token });
  assert.ok(list.body.data.length >= 1);
  assert.ok(list.body.data.every((r) => r.branch_id === H1.id));
  assert.equal((await api(`/api/branch-achievements/${h2Rec.body.data.id}`, { token: opsH1Token })).status, 403);
  assert.equal((await api(`/api/branch-achievements/${h2Rec.body.data.id}`, { method: 'DELETE', token: opsH1Token })).status, 403);
  assert.equal((await api(`/api/branch-achievements?branch_id=${H2.id}`, { token: opsH1Token })).status, 403);

  const none = await api('/api/branch-achievements', { token: opsNoneToken });
  assert.equal(none.status, 200);
  assert.equal(none.body.data.length, 0, 'no assignments means no records');
  assert.equal((await form('/api/branch-achievements', { token: opsNoneToken, fields: { branch_id: H1.id, title: 'x' } })).status, 403);
});

test('access: the main manager sees every branch and can filter by branch', async () => {
  const all = await api('/api/branch-achievements', { token: mainToken });
  const branches = new Set(all.body.data.filter((r) => r.branch_id >= ID_LO && r.branch_id <= ID_HI).map((r) => r.branch_id));
  assert.ok(branches.has(H1.id) && branches.has(H2.id));
  const only = await api(`/api/branch-achievements?branch_id=${H2.id}`, { token: mainToken });
  assert.ok(only.body.data.length >= 1 && only.body.data.every((r) => r.branch_id === H2.id));
  assert.ok(only.body.data[0].branch_name.startsWith('مركز'), 'rows carry the branch name');
});

test('delete is soft: the row disappears from lists and by-id reads, and the audit trail records it', async () => {
  const created = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'سيحذف' }, file: { bytes: PDF('del'), name: 'd.pdf' } });
  const id = created.body.data.id;
  const del = await api(`/api/branch-achievements/${id}`, { method: 'DELETE', token: h1Token });
  assert.equal(del.status, 200);
  assert.equal((await api(`/api/branch-achievements/${id}`, { token: h1Token })).status, 404);
  assert.ok(!(await api('/api/branch-achievements', { token: h1Token })).body.data.some((r) => r.id === id));
  const [row] = await sql`SELECT is_active, file_path FROM branch_achievements WHERE id = ${id}`;
  assert.equal(row.is_active, false);
  assert.ok(row.file_path, 'the file is kept so a mistake can be undone');
  const audit = await sql`SELECT action, actor_kind, actor_branch_id FROM audit_log WHERE entity_type = 'branch_achievement' AND entity_id = ${id} ORDER BY id`;
  assert.deepEqual(audit.map((a) => a.action), ['create', 'delete']);
  assert.equal(audit[0].actor_kind, 'branch');
  assert.equal(audit[0].actor_branch_id, H1.id);
  assert.equal((await api('/api/branch-achievements/abc', { token: h1Token })).status, 400);
});

// ---- partnerships -----------------------------------------------------------------------------------------------------------
test('partnerships: government and private partners, validation and filters', async () => {
  const gov = await form('/api/branch-partnerships', { token: h1Token, fields: { branch_id: H1.id, partner_name: 'أمانة المنطقة', partner_type: 'government', service_type: 'ترخيص', contract_start_date: '2025-01-01', contract_end_date: '2026-01-01' } });
  assert.equal(gov.status, 201, JSON.stringify(gov.body));
  assert.equal(gov.body.data.partner_type, 'government');
  assert.match(String(gov.body.data.contract_end_date_hijri), /^\d{2}\/\d{2}\/\d{4}$/);
  const priv = await form('/api/branch-partnerships', { token: h1Token, fields: { branch_id: H1.id, partner_name: 'شركة النقل المتحدة', partner_type: 'private', service_type: 'نقل بالحافلات', contact_name: 'أحمد', contact_phone: '0501234567' }, file: { bytes: PDF('contract'), name: 'عقد النقل.pdf' } });
  assert.equal(priv.status, 201, JSON.stringify(priv.body));
  assert.equal(priv.body.data.has_file, true);

  assert.equal((await form('/api/branch-partnerships', { token: h1Token, fields: { branch_id: H1.id, partner_name: 'x', partner_type: 'ngo' } })).status, 400);
  assert.equal((await form('/api/branch-partnerships', { token: h1Token, fields: { branch_id: H1.id, partner_type: 'private' } })).status, 400);
  assert.equal((await form('/api/branch-partnerships', { token: h1Token, fields: { branch_id: H1.id, partner_name: 'x' } })).status, 400);
  const backwards = await form('/api/branch-partnerships', { token: h1Token, fields: { branch_id: H1.id, partner_name: 'x', partner_type: 'private', contract_start_date: '2026-05-01', contract_end_date: '2026-01-01' } });
  assert.equal(backwards.status, 400);
  assert.match(backwards.body.message, /نهاية العقد/);

  const govOnly = await api('/api/branch-partnerships?partner_type=government', { token: h1Token });
  assert.deepEqual(govOnly.body.data.map((r) => r.partner_name), ['أمانة المنطقة']);
  const privOnly = await api('/api/branch-partnerships?partner_type=private', { token: h1Token });
  assert.deepEqual(privOnly.body.data.map((r) => r.partner_name), ['شركة النقل المتحدة']);
  const search = await api('/api/branch-partnerships?search=' + encodeURIComponent('حافلات'), { token: h1Token });
  assert.equal(search.body.data.length, 1);
  assert.equal((await api('/api/branch-partnerships', { token: h1Token })).body.data.length, 2);

  // update: changing the start so the end is before it is rejected against the STORED end date
  const bad = await form(`/api/branch-partnerships/${gov.body.data.id}`, { method: 'PUT', token: h1Token, fields: { contract_start_date: '2027-01-01' } });
  assert.equal(bad.status, 400);
  const ok = await form(`/api/branch-partnerships/${gov.body.data.id}`, { method: 'PUT', token: h1Token, fields: { partner_type: 'private' } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.partner_type, 'private');

  // another branch can neither see nor touch them
  assert.equal((await api('/api/branch-partnerships', { token: h2Token })).body.data.length, 0);
  assert.equal((await api(`/api/branch-partnerships/${priv.body.data.id}/download`, { token: h2Token })).status, 403);
  assert.equal((await api(`/api/branch-partnerships/${priv.body.data.id}`, { method: 'DELETE', token: opsNoneToken })).status, 403);
  const dl = await fetch(`${baseUrl}/api/branch-partnerships/${priv.body.data.id}/download`, { headers: { Authorization: `Bearer ${opsH1Token}` } });
  assert.equal(dl.status, 200, 'the assigned operations manager can download');
});

test('upload-url: refuses without access, for schools and for unsupported types', async () => {
  const body = (extra) => ({ file_name: 'a.pdf', content_type: 'application/pdf', size: 5 * 1024 * 1024, ...extra });
  assert.equal((await api('/api/branch-achievements/upload-url', { method: 'POST', token: h2Token, body: body({ branch_id: H1.id }) })).status, 403);
  assert.equal((await api('/api/branch-achievements/upload-url', { method: 'POST', token: s1Token, body: body({ branch_id: S1.id }) })).status, 400);
  assert.equal((await api('/api/branch-partnerships/upload-url', { method: 'POST', token: h1Token, body: body({ branch_id: H1.id, content_type: 'application/zip' }) })).status, 400);
  assert.equal((await api('/api/branch-partnerships/upload-url', { method: 'POST', token: h1Token, body: body({ branch_id: H1.id, size: 40 * 1024 * 1024 }) })).status, 400);
});

test('a direct-upload key of another branch is refused', async () => {
  const res = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'x', direct_upload_key: `branches/${H2.id}/achievements/evil.pdf`, file_name: 'evil.pdf' } });
  assert.equal(res.status, 400);
  const traversal = await form('/api/branch-achievements', { token: h1Token, fields: { branch_id: H1.id, title: 'x', direct_upload_key: `branches/${H1.id}/achievements/../../${H2.id}/x.pdf`, file_name: 'x.pdf' } });
  assert.equal(traversal.status, 400);
});

test('deleting a branch removes its records (foreign key cascade)', async () => {
  const [{ n }] = await sql`SELECT COUNT(*)::int AS n FROM branch_achievements WHERE branch_id = ${H2.id}`;
  assert.ok(n >= 1);
  await sql`DELETE FROM user_branch_assignments WHERE branch_id = ${H2.id}`;
  await sql`DELETE FROM branches WHERE id = ${H2.id}`;
  const [{ m }] = await sql`SELECT COUNT(*)::int AS m FROM branch_achievements WHERE branch_id = ${H2.id}`;
  assert.equal(m, 0);
});

// ---- schema repair (kept last: it drops and recreates a table) -----------------------------------------------------------------
test('the critical-schema guard recreates a missing table, and healAndRetry repairs on 42P01', async () => {
  await sql`DROP TABLE IF EXISTS branch_partnerships`;
  const result = await ensureCriticalSchema();
  assert.equal(result.errorCode, null);
  assert.ok(result.applied.includes('table:branch_partnerships'), JSON.stringify(result));
  assert.equal((await sql`SELECT to_regclass('branch_partnerships') AS t`)[0].t, 'branch_partnerships');

  await sql`DROP TABLE branch_partnerships`;
  let calls = 0;
  await healAndRetry(async () => { calls += 1; await sql`SELECT COUNT(*) FROM branch_partnerships`; });
  assert.equal(calls, 2);

  // the route itself survives a vanished table too
  await sql`DROP TABLE branch_achievements`;
  const list = await api('/api/branch-achievements', { token: mainToken });
  assert.equal(list.status, 200, JSON.stringify(list.body));
  assert.deepEqual(list.body.data, []);
});
