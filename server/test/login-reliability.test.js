import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

process.env.NODE_ENV = 'test';
process.env.OTP_HMAC_SECRET = 'test-only-otp-pepper-32-characters-long';

const mongo = await useThrowawayDb();
const { app, closeDatabase } = mongo ? await import('../index.js') : {};
const security = await import('../security.js');
const db = mongo?.db;
const server = app && createServer(app);
if (app) {
  app.set('trust proxy', 'loopback');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const origin = server && `http://127.0.0.1:${server.address().port}`;
test.after(async () => { if (!app) return; await new Promise(resolve => server.close(resolve)); await closeDatabase(); await mongo.drop(); });

let ipCounter = 1;
const freshIp = () => `192.0.2.${ipCounter++}`;
const send = async (method, path, { body, ip = freshIp(), cookie, raw } = {}) => {
  const headers = { 'x-forwarded-for': ip };
  if (body !== undefined || raw !== undefined) headers['content-type'] = 'application/json';
  if (cookie) headers.cookie = cookie;
  const response = await fetch(`${origin}${path}`, { method, headers, body: raw ?? (body === undefined ? undefined : JSON.stringify(body)) });
  const text = await response.text();
  let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
  return { status: response.status, json, text, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
};

const good = 'StrongPass!2026';
const hash = await security.hashPassword(good);
let seq = 0;
const addCompanyRow = (n, extra = {}) => db.collection('companies').insertOne({ _id: `co${n}`, company_name: 'Co', address1: 'x', country: 'India', country_code: 'IN', city: 'Pune', contact_name: 'A B', email: `co${n}@example.test`, status: 'VERIFIED', created_at: 'now', ...extra });
async function addCompany(passwordHash = hash) {
  const n = ++seq; const userId = `OSF-90000${n}`;
  await addCompanyRow(n);
  await db.collection('users').insertOne({ _id: `u${n}`, company_id: `co${n}`, user_id: userId, password_hash: passwordHash, created_at: 'now', email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED' });
  return userId;
}
async function addStudent() {
  const n = ++seq; const email = `stu${n}@example.test`;
  await db.collection('student_users').insertOne({ _id: `s${n}`, email, password_hash: hash, email_verified: 1, account_status: 'ACTIVE', password_created_at: 'now', updated_at: 'now', created_at: 'now' });
  return email;
}
const companyLogin = (userId, opts = {}) => send('POST', '/api/auth/login', { body: { userId, password: good }, ...opts });
const studentLogin = (email, opts = {}) => send('POST', '/api/student/auth/login', { body: { email, password: good }, ...opts });

test('repeat login scenarios all succeed (second-login failure not reproduced)', { skip }, async () => {
  const ip = freshIp();
  const a = await addCompany(); const b = await addCompany();
  const first = await companyLogin(a, { ip });
  assert.equal(first.status, 200);
  assert.equal((await send('POST', '/api/auth/logout', { cookie: first.cookie, ip })).status, 200);
  assert.equal((await send('GET', '/api/auth/session', { cookie: first.cookie, ip })).status, 401, 'old cookie is dead after logout');
  const second = await companyLogin(a, { ip });
  assert.equal(second.status, 200);
  assert.equal((await send('GET', '/api/auth/session', { cookie: second.cookie, ip })).status, 200);
  // Login while still carrying a stale cookie, and straight after another account logged in on the same IP.
  assert.equal((await companyLogin(a, { ip, cookie: first.cookie })).status, 200);
  assert.equal((await companyLogin(b, { ip })).status, 200);
  assert.equal((await send('GET', '/api/auth/session', { cookie: second.cookie, ip })).status, 200, 'other login does not kill first session');
  for (let i = 0; i < 20; i++) assert.equal((await companyLogin(a, { ip })).status, 200);

  const s = await addStudent();
  const s1 = await studentLogin(s, { ip }); const s2 = await studentLogin(s, { ip, cookie: s1.cookie });
  assert.equal(s1.status, 200); assert.equal(s2.status, 200);
  assert.equal((await send('GET', '/api/student/auth/session', { cookie: s2.cookie, ip })).status, 200);
  await send('POST', '/api/student/auth/logout', { cookie: s2.cookie, ip });
  assert.equal((await studentLogin(s, { ip })).status, 200);
});

test('login works immediately after password setup', { skip }, async () => {
  const n = ++seq; const token = security.newSecret(32);
  await addCompanyRow(n);
  await db.collection('users').insertOne({ _id: `u${n}`, company_id: `co${n}`, user_id: `OSF-80000${n}`, password_hash: null, created_at: 'now', email_verified: 1, must_change_password: 1, password_setup_status: 'PENDING', setup_token_hash: security.sha256(token), setup_expires_at: Date.now() + 60_000 });
  const ip = freshIp();
  assert.equal((await send('POST', '/api/auth/setup-password', { body: { token, password: good, confirmation: good }, ip })).status, 200);
  assert.equal((await companyLogin(`OSF-80000${n}`, { ip })).status, 200);
});

test('argon2 verify errors are warned about server-side but still return the generic 401', { skip }, async t => {
  const user = await addCompany('not-a-valid-argon2-hash');
  const warn = t.mock.method(console, 'warn', () => {});
  const result = await companyLogin(user);
  assert.equal(result.status, 401);
  assert.deepEqual(result.json, { error: 'The User ID or password is incorrect.' });
  assert.equal(warn.mock.calls.length, 1);
  const logged = warn.mock.calls[0].arguments.join(' ');
  assert.equal(logged.includes('not-a-valid-argon2-hash'), false);
  assert.equal(logged.includes(good), false);
});

test('failed-login limiter: 10 failures lock that IP+identifier only, JSON 429 with Retry-After, success resets', { skip }, async () => {
  const ip = freshIp(); const user = await addCompany(); const other = await addCompany();
  const bad = () => send('POST', '/api/auth/login', { body: { userId: user, password: 'wrong' }, ip });
  for (let i = 0; i < 9; i++) assert.equal((await bad()).status, 401);
  assert.equal((await companyLogin(user, { ip })).status, 200, 'success resets the counter');
  for (let i = 0; i < 10; i++) assert.equal((await bad()).status, 401);
  const blocked = await companyLogin(user, { ip });
  assert.equal(blocked.status, 429);
  assert.equal(typeof blocked.json.error, 'string');
  assert.ok(Number(blocked.headers.get('retry-after')) > 0);
  assert.equal((await companyLogin(other, { ip })).status, 200, 'different identifier not blocked');
  assert.equal((await companyLogin(user, { ip: freshIp() })).status, 200, 'different IP not blocked');

  const student = await addStudent(); const sIp = freshIp();
  for (let i = 0; i < 10; i++) await send('POST', '/api/student/auth/login', { body: { email: student, password: 'wrong' }, ip: sIp });
  const sBlocked = await studentLogin(student, { ip: sIp });
  assert.equal(sBlocked.status, 429);
  assert.ok(Number(sBlocked.headers.get('retry-after')) > 0);
});

test('general limiter: anonymous 100/IP, session-keyed 600, health and session checks exempt, 429 is JSON', { skip }, async () => {
  const ip = freshIp(); const user = await addCompany();
  const session = await companyLogin(user);
  for (let i = 0; i < 100; i++) assert.equal((await send('GET', '/api/nope', { ip })).status, 404);
  const limited = await send('GET', '/api/nope', { ip });
  assert.equal(limited.status, 429);
  assert.equal(typeof limited.json.error, 'string');
  assert.ok(Number(limited.headers.get('retry-after')) >= 1);
  // Exempt routes keep working from the exhausted IP.
  assert.equal((await send('GET', '/api/health', { ip })).status, 200);
  assert.equal((await send('GET', '/api/auth/session', { ip, cookie: session.cookie })).status, 200);
  assert.equal((await send('GET', '/api/student/auth/session', { ip })).status, 401);
  // A signed-in session from the same IP has its own bucket.
  assert.equal((await send('GET', '/api/company/profile', { ip, cookie: session.cookie })).status, 200);
});

test('malformed cookie escape does not crash requests', { skip }, async () => {
  const cookie = 'osf_session=%E0%A4%A';
  const ip = freshIp();
  assert.equal((await send('GET', '/api/auth/session', { cookie, ip })).status, 401);
  assert.equal((await send('POST', '/api/auth/logout', { cookie, ip })).status, 200);
  assert.equal((await send('GET', '/api/student/auth/session', { cookie: 'osf_student_session=%', ip })).status, 401);
});

test('error handler hides internal error text but keeps safe client messages', { skip }, async t => {
  t.mock.method(console, 'error', () => {});
  const broken = await send('POST', '/api/auth/login', { raw: '{"userId": ', ip: freshIp() });
  assert.equal(broken.status, 400);
  assert.equal(/JSON|Unexpected|position/i.test(broken.text), false);
  const huge = await send('POST', '/api/auth/login', { raw: JSON.stringify({ userId: 'x'.repeat(40_000) }), ip: freshIp() });
  assert.equal(huge.status, 413);
  assert.equal(huge.text.includes('limit'), false);
  const safe = await send('POST', '/api/auth/setup-password', { body: { token: 'short' }, ip: freshIp() });
  assert.equal(safe.status, 410);
  assert.equal(safe.json.error, 'This password setup link is invalid or expired.');
});
