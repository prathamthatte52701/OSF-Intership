import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const testDirectory = mkdtempSync(join(tmpdir(), 'osf-student-account-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(testDirectory, 'portal.sqlite');
process.env.OTP_HMAC_SECRET = 'test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const [{ app }, { db }, mail] = await Promise.all([import('../index.js'), import('../db.js'), import('../mail.js')]);
app.set('trust proxy', 'loopback');
const sent = [];
mail.setMailSenderForTests(async message => { sent.push(message); return { messageId: 'test-only' }; });
const server = createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let ipNumber = 10;
const api = async (path, { method = 'POST', body, cookie, ip = `198.51.100.${ipNumber++}` } = {}) => {
  const response = await fetch(`${origin}/api${path}`, {
    method, headers: { 'content-type': 'application/json', 'x-forwarded-for': ip, ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => ({})), headers: response.headers };
};
const PASSWORD = 'StrongPass!2026';
const NEW_PASSWORD = 'BrandNewPass!2027';
const otpFrom = message => message.text.match(/is (\d{6})/)[1];
const sessionCount = email => db.prepare('SELECT COUNT(*) AS n FROM student_sessions WHERE student_user_id=(SELECT id FROM student_users WHERE email=?)').get(email).n;

async function makeStudent(email) {
  const before = sent.length;
  assert.equal((await api('/student/auth/register', { body: { email, password: PASSWORD } })).status, 201);
  assert.equal((await api('/student/auth/verify-email', { body: { email, otp: otpFrom(sent[before]) } })).status, 200);
}
async function login(email, password = PASSWORD) {
  const result = await api('/student/auth/login', { body: { email, password } });
  assert.equal(result.status, 200);
  return result.headers.get('set-cookie').split(';')[0];
}
async function requestReset(email, ip) {
  const before = sent.length;
  const result = await api('/student/auth/forgot-password', { body: { email }, ip });
  return { result, message: sent.length > before ? sent.at(-1) : null };
}

test.after(async () => {
  await new Promise(resolve => server.close(resolve));
  db.close();
  rmSync(testDirectory, { recursive: true, force: true });
});

test('change-password verifies current password and keeps only the current session', async () => {
  const email = 'change@example.com';
  await makeStudent(email);
  const current = await login(email); const other = await login(email);
  assert.equal(sessionCount(email), 2);
  assert.equal((await api('/student/auth/change-password', { body: { currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD } })).status, 401);
  assert.equal((await api('/student/auth/change-password', { cookie: current, body: { currentPassword: 'WrongPass!2026x', newPassword: NEW_PASSWORD } })).status, 400);
  assert.equal((await api('/student/auth/change-password', { cookie: current, body: { currentPassword: PASSWORD, newPassword: 'weak' } })).status, 400);
  assert.equal(sessionCount(email), 2);
  const ok = await api('/student/auth/change-password', { cookie: current, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.equal(sessionCount(email), 1);
  assert.equal((await api('/student/auth/session', { method: 'GET', cookie: current })).status, 200);
  assert.equal((await api('/student/auth/session', { method: 'GET', cookie: other })).status, 401);
  assert.equal((await api('/student/auth/login', { body: { email, password: PASSWORD } })).status, 401);
  await login(email, NEW_PASSWORD);
});

test('logout-all deletes every session and clears the cookie, only for the caller', async () => {
  await makeStudent('all@example.com'); await makeStudent('bystander@example.com');
  const a = await login('all@example.com'); await login('all@example.com');
  await login('bystander@example.com');
  assert.equal((await api('/student/auth/logout-all')).status, 401);
  const result = await api('/student/auth/logout-all', { cookie: a });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(sessionCount('all@example.com'), 0);
  assert.equal(sessionCount('bystander@example.com'), 1);
});

test('forgot-password is generic, sends only for eligible accounts, and enforces cooldown and IP limit', async () => {
  await makeStudent('forgot@example.com');
  const unverified = 'unverified@example.com';
  await api('/student/auth/register', { body: { email: unverified, password: PASSWORD } });
  const missing = await requestReset('nobody@example.com');
  const exists = await requestReset('forgot@example.com');
  assert.equal(missing.result.status, 200);
  assert.deepEqual(exists.result.body, missing.result.body);
  assert.equal(missing.message, null);
  assert.ok(exists.message);
  assert.equal(exists.message.to, 'forgot@example.com');
  // 60-second cooldown per account, even from another IP.
  const again = await requestReset('forgot@example.com');
  assert.equal(again.result.status, 200); assert.equal(again.message, null);
  db.prepare('UPDATE student_otp_challenges SET last_sent_at=? WHERE student_user_id=(SELECT id FROM student_users WHERE email=?)').run(Date.now() - 61_000, 'forgot@example.com');
  assert.ok((await requestReset('forgot@example.com')).message);
  // Unverified and suspended accounts get the same response but no code.
  const before = sent.length;
  assert.deepEqual((await api('/student/auth/forgot-password', { body: { email: unverified } })).body, missing.result.body);
  db.prepare("UPDATE student_users SET account_status='SUSPENDED' WHERE email=?").run('forgot@example.com');
  db.prepare('UPDATE student_otp_challenges SET last_sent_at=0 WHERE student_user_id=(SELECT id FROM student_users WHERE email=?)').run('forgot@example.com');
  await api('/student/auth/forgot-password', { body: { email: 'forgot@example.com' } });
  assert.equal(sent.length, before);
  db.prepare("UPDATE student_users SET account_status='ACTIVE' WHERE email=?").run('forgot@example.com');
  // 5 requests per hour per IP.
  const ip = '203.0.113.99';
  for (let i = 0; i < 5; i += 1) assert.equal((await api('/student/auth/forgot-password', { body: { email: 'nobody@example.com' }, ip })).status, 200);
  assert.equal((await api('/student/auth/forgot-password', { body: { email: 'nobody@example.com' }, ip })).status, 429);
});

test('reset-password succeeds with the code, kills all sessions, and rejects reuse', async () => {
  const email = 'reset@example.com';
  await makeStudent(email); await login(email); await login(email);
  const { message } = await requestReset(email);
  const otp = otpFrom(message);
  const wrong = otp === '000000' ? '111111' : '000000';
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp: wrong, newPassword: NEW_PASSWORD } })).status, 400);
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp, newPassword: 'weak' } })).status, 400);
  const ok = await api('/student/auth/reset-password', { body: { email, otp, newPassword: NEW_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.equal(sessionCount(email), 0);
  assert.equal((await api('/student/auth/login', { body: { email, password: PASSWORD } })).status, 401);
  await login(email, NEW_PASSWORD);
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp, newPassword: PASSWORD } })).status, 400);
});

test('reset-password rejects expired codes and locks after five wrong attempts', async () => {
  const email = 'lock@example.com';
  await makeStudent(email);
  const otp = otpFrom((await requestReset(email)).message);
  const wrong = otp === '000000' ? '111111' : '000000';
  for (let i = 0; i < 5; i += 1) assert.equal((await api('/student/auth/reset-password', { body: { email, otp: wrong, newPassword: NEW_PASSWORD } })).status, 400);
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp, newPassword: NEW_PASSWORD } })).status, 429);
  assert.equal((await api('/student/auth/login', { body: { email, password: PASSWORD } })).status, 200);

  const expiring = 'expired@example.com';
  await makeStudent(expiring);
  const code = otpFrom((await requestReset(expiring)).message);
  db.prepare('UPDATE student_otp_challenges SET expires_at=? WHERE student_user_id=(SELECT id FROM student_users WHERE email=?)').run(Date.now() - 1000, expiring);
  assert.equal((await api('/student/auth/reset-password', { body: { email: expiring, otp: code, newPassword: NEW_PASSWORD } })).status, 410);
  assert.equal((await api('/student/auth/reset-password', { body: { email: 'nobody@example.com', otp: code, newPassword: NEW_PASSWORD } })).status, 400);
});

test('profileVisible defaults on and round-trips through GET and PUT /student/profile', async () => {
  await makeStudent('visible@example.com');
  const cookie = await login('visible@example.com');
  const created = await api('/student/profile', { method: 'PUT', cookie, body: { fullName: 'Vi Sible', skills: ['React'] } });
  assert.equal(created.status, 200);
  assert.equal(created.body.profile.profileVisible, true);
  const hidden = await api('/student/profile', { method: 'PUT', cookie, body: { fullName: 'Vi Sible', skills: ['React'], profileVisible: false } });
  assert.equal(hidden.body.profile.profileVisible, false);
  assert.equal((await api('/student/profile', { method: 'GET', cookie })).body.profile.profileVisible, false);
  // Omitting the field on a later save leaves the stored choice untouched.
  const kept = await api('/student/profile', { method: 'PUT', cookie, body: { fullName: 'Vi Sible', skills: ['React'] } });
  assert.equal(kept.body.profile.profileVisible, false);
  assert.equal((await api('/student/profile', { method: 'PUT', cookie, body: { fullName: 'Vi Sible', skills: [], profileVisible: 'no' } })).status, 400);
  const shown = await api('/student/profile', { method: 'PUT', cookie, body: { fullName: 'Vi Sible', skills: ['React'], profileVisible: true } });
  assert.equal(shown.body.profile.profileVisible, true);
});
