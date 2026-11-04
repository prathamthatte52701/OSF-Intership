import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const testDirectory = mkdtempSync(join(tmpdir(), 'osf-recovery-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(testDirectory, 'portal.sqlite');
process.env.OTP_HMAC_SECRET = 'test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const [{ app }, { db }, mail] = await Promise.all([
  import('../index.js'), import('../db.js'), import('../mail.js'),
]);
app.set('trust proxy', 'loopback');
const sent = [];
let failSetupMail = false;
mail.setMailSenderForTests(async message => {
  sent.push(message);
  if (failSetupMail && message.subject.includes('Set Up Your OSF')) throw new Error('test delivery failure');
  return { messageId: 'test-only' };
});

const server = createServer(app);
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let ipNumber = 10;
const request = async (path, body, ip = `198.51.100.${ipNumber++}`) => {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': ip }, body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
};
const extractOtp = message => message.text.match(/code is (\d{6})/)[1];
const extractSetupToken = message => new URL(message.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token');

async function registerAndVerify(email, { deliverInitialSetup = true, resendOtp = false } = {}) {
  const registrationMessageCount = sent.length;
  const registration = await request('/api/registrations', {
    companyName: 'Northstar Labs', pan: 'ABCPC1234F', msme: '', address1: '10 Main Street', address2: '',
    country: 'India', countryCode: 'IN', state: 'Maharashtra', city: 'Pune', postal: '411001',
    contactName: 'Aanya Sharma', email, phone: '',
  });
  assert.equal(registration.status, 201);
  let otpMessage = sent[registrationMessageCount];
  if (resendOtp) {
    db.prepare('UPDATE otp_challenges SET last_sent_at=? WHERE company_id=?').run(Date.now() - 61_000, registration.body.registrationId);
    const resent = await request(`/api/registrations/${registration.body.registrationId}/resend-otp`, {});
    assert.equal(resent.status, 200);
    otpMessage = sent.at(-1);
  }
  failSetupMail = !deliverInitialSetup;
  const verified = await request(`/api/registrations/${registration.body.registrationId}/verify-email`, { otp: extractOtp(otpMessage) });
  failSetupMail = false;
  assert.equal(verified.status, 200);
  assert.equal(verified.body.emailDelivery, deliverInitialSetup ? 'sent' : 'failed');
  const user = db.prepare(`SELECT u.*,c.email FROM users u JOIN companies c ON c.id=u.company_id WHERE c.id=?`).get(registration.body.registrationId);
  return { registration, verified, user, initialToken: extractSetupToken(sent.at(-1)) };
}

test('password setup delivery recovery persists, rotates tokens, rate-limits, completes setup, and preserves OTP flows', async t => {
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    db.close();
    rmSync(testDirectory, { recursive: true, force: true });
  });

  const legacyPath = join(testDirectory, 'legacy.sqlite');
  const legacy = new Database(legacyPath);
  legacy.exec(`CREATE TABLE companies (id TEXT PRIMARY KEY,status TEXT NOT NULL);
    CREATE TABLE users (id TEXT PRIMARY KEY,company_id TEXT NOT NULL UNIQUE,user_id TEXT NOT NULL,password_hash TEXT,
      setup_token_hash TEXT,setup_expires_at INTEGER,password_changed_at TEXT,created_at TEXT NOT NULL);
    INSERT INTO companies VALUES ('pending-setup','VERIFIED'),('completed-setup','VERIFIED'),('unverified','PENDING');
    INSERT INTO users (id,company_id,user_id,password_hash,created_at) VALUES ('u1','pending-setup','OSF-111111',NULL,'test'),('u2','completed-setup','OSF-222222','hash','test'),('u3','unverified','OSF-333333',NULL,'test');`);
  legacy.close();
  const migration = spawnSync(process.execPath, ['--input-type=module', '-e', "const {db}=await import('./db.js');db.close();"], {
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { ...process.env, DATABASE_PATH: legacyPath }, encoding: 'utf8',
  });
  assert.equal(migration.status, 0, migration.stderr);
  const migrated = new Database(legacyPath, { readonly: true });
  assert.deepEqual(migrated.prepare('SELECT email_verified,must_change_password,password_setup_status FROM users WHERE id=?').get('u1'),
    { email_verified: 1, must_change_password: 1, password_setup_status: 'PENDING' });
  assert.deepEqual(migrated.prepare('SELECT email_verified,must_change_password,password_setup_status FROM users WHERE id=?').get('u2'),
    { email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED' });
  assert.deepEqual(migrated.prepare('SELECT email_verified,must_change_password,password_setup_status FROM users WHERE id=?').get('u3'),
    { email_verified: 0, must_change_password: 1, password_setup_status: 'PENDING' });
  migrated.close();

  const successful = await registerAndVerify('first@company.example', { resendOtp: true });
  assert.equal(successful.user.email_verified, 1);
  assert.equal(successful.user.must_change_password, 1);
  assert.equal(successful.user.password_setup_status, 'PENDING');
  assert.equal(successful.user.setup_token_hash, (await import('../security.js')).sha256(successful.initialToken));
  assert.equal(successful.user.setup_token_hash.includes(successful.initialToken), false);

  const completion = await request('/api/auth/setup-password', {
    token: successful.initialToken, password: 'StrongPass!2026', confirmation: 'StrongPass!2026',
  });
  assert.equal(completion.status, 200);
  const completedUser = db.prepare('SELECT password_setup_status,must_change_password,setup_token_hash FROM users WHERE id=?').get(successful.user.id);
  assert.deepEqual(completedUser, { password_setup_status: 'COMPLETED', must_change_password: 0, setup_token_hash: null });
  const login = await request('/api/auth/login', { userId: successful.verified.body.userId, password: 'StrongPass!2026' });
  assert.equal(login.status, 200);
  const loginResponse = await fetch(`${origin}/api/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ userId: successful.verified.body.userId, password: 'StrongPass!2026' }),
  });
  const sessionCookie = loginResponse.headers.get('set-cookie').split(';')[0];
  const profileResponse = await fetch(`${origin}/api/company/profile`, { headers: { cookie: sessionCookie } });
  assert.equal(profileResponse.status, 200, 'completed setup can sign in and access the company dashboard API');

  const failed = await registerAndVerify('second@company.example', { deliverInitialSetup: false });
  assert.equal(failed.user.password_setup_status, 'PENDING');
  assert.equal((await request('/api/registrations', {
    companyName: 'Duplicate Co', pan: 'ABCPC1234F', address1: '10 Main Street', country: 'India', countryCode: 'IN',
    city: 'Pune', postal: '411001', contactName: 'Aanya Sharma', email: 'second@company.example',
  })).status, 409, 'recovery must not create another registration');

  // Simulates refresh/reopen: recovery uses the saved account email, with no registration state.
  db.prepare('UPDATE users SET setup_last_sent_at=? WHERE id=?').run(Date.now() - 61_000, failed.user.id);
  failSetupMail = true;
  const accepted = await request('/api/auth/resend-password-setup', { email: 'second@company.example' });
  failSetupMail = false;
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.message, 'If the account is eligible, a setup link will be sent. If it does not arrive, you can try again after 60 seconds.');
  const failedRecoveryToken = extractSetupToken(sent.at(-1));
  assert.equal(db.prepare("SELECT password_setup_status FROM users WHERE id=?").get(failed.user.id).password_setup_status, 'PENDING');
  assert.notEqual(failedRecoveryToken, failed.initialToken);
  const afterFailedDelivery = sent.length;
  assert.deepEqual((await request('/api/auth/resend-password-setup', { email: 'second@company.example' })).body, accepted.body);
  assert.equal(sent.length, afterFailedDelivery, 'failed delivery must still enforce the account cooldown');
  assert.equal((await request('/api/auth/setup-password', { token: failed.initialToken, password: 'StrongPass!2026', confirmation: 'StrongPass!2026' })).status, 410);
  db.prepare('UPDATE users SET setup_last_sent_at=? WHERE id=?').run(Date.now() - 61_000, failed.user.id);
  const retried = await request('/api/auth/resend-password-setup', { email: 'second@company.example' });
  assert.deepEqual(retried.body, accepted.body);
  const recoveredToken = extractSetupToken(sent.at(-1));
  assert.notEqual(recoveredToken, failedRecoveryToken);
  assert.equal((await request('/api/auth/setup-password', { token: failedRecoveryToken, password: 'StrongPass!2026', confirmation: 'StrongPass!2026' })).status, 410);
  assert.equal(db.prepare('SELECT setup_token_hash FROM users WHERE id=?').get(failed.user.id).setup_token_hash,
    (await import('../security.js')).sha256(recoveredToken));

  // Account quota is durable in SQLite; delivery failures still consume a cooldown and quota.
  db.prepare('UPDATE users SET setup_resend_count=1,setup_resend_window_started_at=? WHERE id=?').run(Date.now(), failed.user.id);
  for (let count = 1; count < 5; count++) {
    db.prepare('UPDATE users SET setup_last_sent_at=? WHERE id=?').run(Date.now() - 61_000, failed.user.id);
    await request('/api/auth/resend-password-setup', { email: 'second@company.example' });
  }
  const deliveriesBeforeLimit = sent.length;
  db.prepare('UPDATE users SET setup_last_sent_at=? WHERE id=?').run(Date.now() - 61_000, failed.user.id);
  assert.equal((await request('/api/auth/resend-password-setup', { email: 'second@company.example' })).status, 200);
  assert.equal(sent.length, deliveriesBeforeLimit, 'sixth account request must not send email');
  assert.equal(db.prepare('SELECT setup_resend_count FROM users WHERE id=?').get(failed.user.id).setup_resend_count, 5);

  db.prepare('UPDATE users SET setup_expires_at=? WHERE id=?').run(Date.now() - 1, failed.user.id);
  assert.equal((await request('/api/auth/setup-password', { token: extractSetupToken(sent.at(-1)), password: 'StrongPass!2026', confirmation: 'StrongPass!2026' })).status, 410);

  const beforeUnknown = sent.length;
  const unknown = await request('/api/auth/resend-password-setup', { email: 'not-found@example.test' });
  assert.equal(unknown.status, 200);
  assert.deepEqual(unknown.body, accepted.body);
  assert.equal(sent.length, beforeUnknown);

  const limitedIp = '203.0.113.77';
  assert.equal((await request('/api/auth/resend-password-setup', { email: 'not-found@example.test' }, limitedIp)).status, 200);
  for (let attempt = 0; attempt < 5; attempt++) {
    assert.equal((await request('/api/auth/resend-password-setup', { email: 'not-found@example.test' }, limitedIp)).status, 429);
  }
});
