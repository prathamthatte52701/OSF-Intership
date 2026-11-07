import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

process.env.NODE_ENV = 'test';
process.env.OTP_HMAC_SECRET = 'test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const mongo = await useThrowawayDb();
const { app, closeDatabase } = mongo ? await import('../index.js') : {};
const mail = await import('../mail.js');
const db = mongo?.db;
const sent = [];
mail.setMailSenderForTests(async message => { sent.push(message); return { messageId: 'test-only' }; });
const server = app && createServer(app);
if (app) {
  app.set('trust proxy', 'loopback');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const origin = server && `http://127.0.0.1:${server.address().port}`;
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
const studentUserId = async email => (await db.collection('student_users').findOne({ email }))._id;
const sessionCount = async email => db.collection('student_sessions').countDocuments({ student_user_id: await studentUserId(email) });
const setOtp = async (email, fields) => db.collection('student_otp_challenges').updateOne({ student_user_id: await studentUserId(email) }, { $set: fields });

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
  if (!app) return;
  await new Promise(resolve => server.close(resolve));
  await closeDatabase();
  await mongo.drop();
});

test('change-password verifies current password and keeps only the current session', { skip }, async () => {
  const email = 'change@example.com';
  await makeStudent(email);
  const current = await login(email); const other = await login(email);
  assert.equal(await sessionCount(email), 2);
  assert.equal((await api('/student/auth/change-password', { body: { currentPassword: NEW_PASSWORD, newPassword: NEW_PASSWORD } })).status, 401);
  assert.equal((await api('/student/auth/change-password', { cookie: current, body: { currentPassword: 'WrongPass!2026x', newPassword: NEW_PASSWORD } })).status, 400);
  assert.equal((await api('/student/auth/change-password', { cookie: current, body: { currentPassword: PASSWORD, newPassword: 'weak' } })).status, 400);
  assert.equal(await sessionCount(email), 2);
  const ok = await api('/student/auth/change-password', { cookie: current, body: { currentPassword: PASSWORD, newPassword: NEW_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.equal(await sessionCount(email), 1);
  assert.equal((await api('/student/auth/session', { method: 'GET', cookie: current })).status, 200);
  assert.equal((await api('/student/auth/session', { method: 'GET', cookie: other })).status, 401);
  assert.equal((await api('/student/auth/login', { body: { email, password: PASSWORD } })).status, 401);
  await login(email, NEW_PASSWORD);
});

test('logout-all deletes every session and clears the cookie, only for the caller', { skip }, async () => {
  await makeStudent('all@example.com'); await makeStudent('bystander@example.com');
  const a = await login('all@example.com'); await login('all@example.com');
  await login('bystander@example.com');
  assert.equal((await api('/student/auth/logout-all')).status, 401);
  const result = await api('/student/auth/logout-all', { cookie: a });
  assert.equal(result.status, 200);
  assert.match(result.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal(await sessionCount('all@example.com'), 0);
  assert.equal(await sessionCount('bystander@example.com'), 1);
});

test('forgot-password is generic, sends only for eligible accounts, and enforces cooldown and IP limit', { skip }, async () => {
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
  await setOtp('forgot@example.com', { last_sent_at: Date.now() - 61_000 });
  assert.ok((await requestReset('forgot@example.com')).message);
  // Unverified and suspended accounts get the same response but no code.
  const before = sent.length;
  assert.deepEqual((await api('/student/auth/forgot-password', { body: { email: unverified } })).body, missing.result.body);
  await db.collection('student_users').updateOne({ email: 'forgot@example.com' }, { $set: { account_status: 'SUSPENDED' } });
  await setOtp('forgot@example.com', { last_sent_at: 0 });
  await api('/student/auth/forgot-password', { body: { email: 'forgot@example.com' } });
  assert.equal(sent.length, before);
  await db.collection('student_users').updateOne({ email: 'forgot@example.com' }, { $set: { account_status: 'ACTIVE' } });
  // 5 requests per hour per IP.
  const ip = '203.0.113.99';
  for (let i = 0; i < 5; i += 1) assert.equal((await api('/student/auth/forgot-password', { body: { email: 'nobody@example.com' }, ip })).status, 200);
  assert.equal((await api('/student/auth/forgot-password', { body: { email: 'nobody@example.com' }, ip })).status, 429);
});

test('reset-password succeeds with the code, kills all sessions, and rejects reuse', { skip }, async () => {
  const email = 'reset@example.com';
  await makeStudent(email); await login(email); await login(email);
  const { message } = await requestReset(email);
  const otp = otpFrom(message);
  const wrong = otp === '000000' ? '111111' : '000000';
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp: wrong, newPassword: NEW_PASSWORD } })).status, 400);
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp, newPassword: 'weak' } })).status, 400);
  const ok = await api('/student/auth/reset-password', { body: { email, otp, newPassword: NEW_PASSWORD } });
  assert.equal(ok.status, 200);
  assert.equal(await sessionCount(email), 0);
  assert.equal((await api('/student/auth/login', { body: { email, password: PASSWORD } })).status, 401);
  await login(email, NEW_PASSWORD);
  assert.equal((await api('/student/auth/reset-password', { body: { email, otp, newPassword: PASSWORD } })).status, 400);
});

test('reset-password rejects expired codes and locks after five wrong attempts', { skip }, async () => {
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
  await setOtp(expiring, { expires_at: Date.now() - 1000 });
  assert.equal((await api('/student/auth/reset-password', { body: { email: expiring, otp: code, newPassword: NEW_PASSWORD } })).status, 410);
  assert.equal((await api('/student/auth/reset-password', { body: { email: 'nobody@example.com', otp: code, newPassword: NEW_PASSWORD } })).status, 400);
});

test('profileVisible defaults on and round-trips through GET and PUT /student/profile', { skip }, async () => {
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
