import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { api, sql, outbox, lastOtpCode, closeAll } from './helpers.js';
import { signOtpSession } from '../utils/jwt.js';
import { up as migrate025 } from '../database/migrations/025-auth-accounts.js';

const MAIN = { id: 900001, username: 't_main', password: 'MainPw-123' };
const OPS = { id: 900002, username: 't_ops', password: 'OpsPw-123', email: 't_ops@example.test' };
const BR1 = { id: 900001, username: 't_branch1', password: 'BranchPw-1', email: 't_branch1@example.test' };
// A user and a branch that share id 900003 (this happens in production data)
const CLASH_USER = { id: 900003, username: 't_clash_user', password: 'ClashPw-1' };
const CLASH_BRANCH = { id: 900003, username: 't_clash_branch', password: 'ClashBr-1', email: 't_clash@example.test' };

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

const TEST_USERNAMES = ['t_main', 't_ops', 't_ops2', 't_branch1', 't_clash_user', 't_clash_branch'];

async function cleanup() {
  await sql`DELETE FROM user_branch_assignments WHERE user_id BETWEEN 900000 AND 900099 OR branch_id BETWEEN 900000 AND 900099`;
  await sql`DELETE FROM login_events WHERE account_id BETWEEN 900000 AND 900099 OR username = ANY(${TEST_USERNAMES})`;
  await sql`DELETE FROM users WHERE id BETWEEN 900000 AND 900099 OR username = ANY(${TEST_USERNAMES})`;
  await sql`DELETE FROM branches WHERE id BETWEEN 900000 AND 900099 OR username = ANY(${TEST_USERNAMES})`;
}

let mainToken;

before(async () => {
  await migrate025(sql);
  await cleanup();
  await insertUser(MAIN, 'main_manager', 't_main@example.test');
  await insertUser(OPS, 'branch_operations_manager', OPS.email);
  await insertBranch(BR1);
  await insertUser(CLASH_USER, 'main_manager', 'clash_user@example.test');
  await insertBranch(CLASH_BRANCH);
  const res = await api('/api/auth/login', { method: 'POST', body: { username: MAIN.username, password: MAIN.password } });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  mainToken = res.body.token;
});

after(async () => {
  await cleanup();
  await closeAll();
  process.exit(0);
});

async function branchLogin(b = BR1) {
  const login = await api('/api/auth/login', { method: 'POST', body: { username: b.username, password: b.password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  assert.equal(login.body.requiresOTP, true);
  assert.ok(login.body.otp_session, 'login must return an otp_session');
  return login.body;
}

/** Full branch sign-in; returns the token. Waits out the resend cooldown by clearing the old code. */
async function branchToken(b = BR1) {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${b.id}`;
  const first = await branchLogin(b);
  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: first.otp_session, otp: lastOtpCode() } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  return ok.body.token;
}

test('main manager login returns a token and /me works', async () => {
  const me = await api('/api/auth/me', { token: mainToken });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'main_manager');
});

test('OTP endpoints cannot be used with only a username (the old bypass)', async () => {
  const sentBefore = outbox.length;
  // Old-style calls, as an attacker who knows only a username would make them
  const verify = await api('/api/auth/verify-otp', { method: 'POST', body: { username: MAIN.username, otp: '123456', isUserOTP: true } });
  assert.ok([400, 401].includes(verify.status), `verify-otp without session returned ${verify.status}`);
  assert.ok(!verify.body.token);
  const resend = await api('/api/auth/resend-otp', { method: 'POST', body: { username: OPS.username, isUserOTP: true } });
  assert.ok([400, 401].includes(resend.status));
  assert.equal(outbox.length, sentBefore, 'no code may be e-mailed without the password step');
  const forged = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: 'not-a-token', otp: '123456' } });
  assert.equal(forged.status, 401);
});

test('an otp_session for a head-office account is refused (only operations managers use the e-mail code)', async () => {
  const session = signOtpSession({ kind: 'user', id: MAIN.id, username: MAIN.username });
  const res = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: session, otp: '123456' } });
  assert.equal(res.status, 401);
  assert.ok(!res.body.token);
});

test('branch login: password -> code -> token, and the token is a branch token', async () => {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${BR1.id}`;
  const first = await branchLogin();
  const code = lastOtpCode();
  assert.match(code, /^\d{6}$/);

  const wrong = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: first.otp_session, otp: code === '000000' ? '111111' : '000000' } });
  assert.equal(wrong.status, 401);

  const ok = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: first.otp_session, otp: code } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.user.role, 'branch_manager');
  const me = await api('/api/auth/me', { token: ok.body.token });
  assert.equal(me.status, 200);
  assert.equal(me.body.user.role, 'branch_manager');
  assert.equal(me.body.user.id, BR1.id);
});

test('parallel OTP guesses cannot exceed the attempt cap', async () => {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${BR1.id}`;
  const first = await branchLogin();
  const code = lastOtpCode();
  const wrongCode = code === '555555' ? '444444' : '555555';
  const results = await Promise.all(
    Array.from({ length: 25 }, () =>
      api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: first.otp_session, otp: wrongCode } }))
  );
  const evaluated = results.filter((r) => r.status === 401 && /المحاولات المتبقية/.test(r.body?.message || '')).length;
  assert.ok(evaluated <= 5, `only 5 guesses may be evaluated, got ${evaluated}`);
  // Locked now: even the right code no longer works
  const late = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: first.otp_session, otp: code } });
  assert.notEqual(late.status, 200);
  assert.ok(!late.body.token);
});

test('wrong passwords lock the account; unlock restores access', async () => {
  await sql`DELETE FROM branch_otp_tokens WHERE branch_id = ${BR1.id}`;
  const bad = { username: BR1.username, password: 'wrong-password' };
  let last;
  for (let i = 0; i < 6; i++) last = await api('/api/auth/login', { method: 'POST', body: bad });
  assert.equal(last.status, 429);
  assert.equal(last.body.locked, true);

  const stillLocked = await api('/api/auth/login', { method: 'POST', body: { username: BR1.username, password: BR1.password } });
  assert.equal(stillLocked.status, 429);

  const unlock = await api(`/api/branches/${BR1.id}/unlock`, { method: 'POST', token: mainToken });
  assert.equal(unlock.status, 200);
  const again = await api('/api/auth/login', { method: 'POST', body: { username: BR1.username, password: BR1.password } });
  assert.equal(again.status, 200);
});

test('user id and branch id may collide: a branch token resolves to the branch, not the user', async () => {
  const token = await branchToken(CLASH_BRANCH);
  const me = await api('/api/auth/me', { token });
  assert.equal(me.body.user.role, 'branch_manager');
  assert.equal(me.body.user.username, CLASH_BRANCH.username);
});

test('a disabled branch is signed out immediately', async () => {
  const token = await branchToken();
  assert.equal((await api('/api/auth/me', { token })).status, 200);
  await sql`UPDATE branches SET is_active = false WHERE id = ${BR1.id}`;
  const after = await api('/api/auth/me', { token });
  assert.equal(after.status, 401);
  assert.equal(after.body.code, 'AUTH_DISABLED');
  await sql`UPDATE branches SET is_active = true WHERE id = ${BR1.id}`;
});

test('changing the password signs out other sessions and returns a new token', async () => {
  const oldToken = await branchToken();
  const change = await api('/api/auth/change-password', {
    method: 'PUT', token: oldToken, body: { current_password: BR1.password, new_password: 'BranchPw-2' }
  });
  assert.equal(change.status, 200, JSON.stringify(change.body));
  assert.equal((await api('/api/auth/me', { token: oldToken })).body.code, 'AUTH_REVOKED');
  assert.equal((await api('/api/auth/me', { token: change.body.token })).status, 200);
  BR1.password = 'BranchPw-2';
  const wrongCurrent = await api('/api/auth/change-password', {
    method: 'PUT', token: change.body.token, body: { current_password: 'nope-nope', new_password: 'BranchPw-3' }
  });
  assert.equal(wrongCurrent.status, 401);
});

test('branch and operations managers never receive passwords; the head office does', async () => {
  const mainList = await api('/api/branches', { token: mainToken });
  assert.equal(mainList.status, 200);
  const mine = mainList.body.data.find((b) => b.id === BR1.id);
  assert.equal(typeof mine.password, 'string');
  assert.equal('token_version' in mine, false);

  const token = await branchToken();
  const asBranch = await api('/api/branches', { token });
  assert.equal(asBranch.status, 200);
  for (const b of asBranch.body.data) assert.equal('password' in b, false);
  const one = await api(`/api/branches/${BR1.id}`, { token });
  assert.equal('password' in one.body.data, false);

  await sql`INSERT INTO user_branch_assignments (user_id, branch_id) VALUES (${OPS.id}, ${BR1.id}) ON CONFLICT DO NOTHING`;
  await sql`DELETE FROM user_otp_tokens WHERE user_id = ${OPS.id}`;
  const opsLogin = await api('/api/auth/login', { method: 'POST', body: { username: OPS.username, password: OPS.password } });
  assert.equal(opsLogin.status, 200, JSON.stringify(opsLogin.body));
  const opsOk = await api('/api/auth/verify-otp', { method: 'POST', body: { otp_session: opsLogin.body.otp_session, otp: lastOtpCode() } });
  assert.equal(opsOk.status, 200, JSON.stringify(opsOk.body));
  const asOps = await api('/api/branches', { token: opsOk.body.token });
  assert.equal(asOps.status, 200);
  assert.ok(asOps.body.data.length >= 1);
  for (const b of asOps.body.data) assert.equal('password' in b, false);
});

test('branch manager cannot change the login e-mail directly', async () => {
  const token = await branchToken();
  const res = await api('/api/branches/my-branch', { method: 'PUT', token, body: { email: 'attacker@example.test' } });
  assert.equal(res.status, 403);
  const phone = await api('/api/branches/my-branch', { method: 'PUT', token, body: { phone_number: '0500000000' } });
  assert.equal(phone.status, 200, JSON.stringify(phone.body));
});

test('account management: username clashes, self-disable, reset-password, atomic create with branches', async () => {
  const clash = await api('/api/users', { method: 'POST', token: mainToken, body: { username: BR1.username, password: 'Whatever1', full_name: 'x' } });
  assert.equal(clash.status, 400);

  const self = await api(`/api/users/${MAIN.id}`, { method: 'DELETE', token: mainToken });
  assert.equal(self.status, 400);

  const create = await api('/api/users', {
    method: 'POST', token: mainToken,
    body: { username: 't_ops2', password: 'OpsTwo-123', full_name: 'Ops Two', role: 'branch_operations_manager', email: 't_ops2@example.test', assigned_branch_ids: [BR1.id, CLASH_BRANCH.id] }
  });
  assert.equal(create.status, 201, JSON.stringify(create.body));
  const assigned = await api(`/api/users/${create.body.data.id}/assigned-branches`, { token: mainToken });
  assert.deepEqual([...assigned.body.data].sort(), [BR1.id, CLASH_BRANCH.id].sort());

  const reset = await api(`/api/users/${create.body.data.id}/reset-password`, { method: 'POST', token: mainToken, body: {} });
  assert.equal(reset.status, 200);
  assert.ok(reset.body.data.temporary_password.length >= 8);

  const del = await api(`/api/users/${create.body.data.id}`, { method: 'DELETE', token: mainToken });
  assert.equal(del.status, 200);
  const disabled = await api('/api/users?status=disabled&role=branch_operations_manager', { token: mainToken });
  assert.ok(disabled.body.data.some((u) => u.id === create.body.data.id));
  const re = await api(`/api/users/${create.body.data.id}/reactivate`, { method: 'PUT', token: mainToken });
  assert.equal(re.status, 200);
});
