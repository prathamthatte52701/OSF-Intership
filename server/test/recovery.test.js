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
let failSetupMail = false;
mail.setMailSenderForTests(async message => {
  sent.push(message);
  if (failSetupMail && message.subject.includes('Set Up Your OSF')) throw new Error('test delivery failure');
  return { messageId: 'test-only' };
});

const server = app && createServer(app);
if (app) {
  app.set('trust proxy', 'loopback');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const origin = server && `http://127.0.0.1:${server.address().port}`;
const setUser = (id, fields) => db.collection('users').updateOne({ _id: id }, { $set: fields });
const getUser = id => db.collection('users').findOne({ _id: id });
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
    await db.collection('otp_challenges').updateOne({ company_id: registration.body.registrationId }, { $set: { last_sent_at: Date.now() - 61_000 } });
    const resent = await request(`/api/registrations/${registration.body.registrationId}/resend-otp`, {});
    assert.equal(resent.status, 200);
    otpMessage = sent.at(-1);
  }
  failSetupMail = !deliverInitialSetup;
  const verified = await request(`/api/registrations/${registration.body.registrationId}/verify-email`, { otp: extractOtp(otpMessage) });
  failSetupMail = false;
  assert.equal(verified.status, 200);
  assert.equal(verified.body.emailDelivery, deliverInitialSetup ? 'sent' : 'failed');
  const user = { ...await db.collection('users').findOne({ company_id: registration.body.registrationId }) };
  user.id = user._id;
  return { registration, verified, user, initialToken: extractSetupToken(sent.at(-1)) };
}

test('password setup delivery recovery persists, rotates tokens, rate-limits, completes setup, and preserves OTP flows', { skip }, async t => {
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
    await mongo.drop();
  });

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
  const completedUser = await getUser(successful.user.id);
  assert.deepEqual({ password_setup_status: completedUser.password_setup_status, must_change_password: completedUser.must_change_password, setup_token_hash: completedUser.setup_token_hash },
    { password_setup_status: 'COMPLETED', must_change_password: 0, setup_token_hash: null });
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
    state: 'Maharashtra', city: 'Pune', postal: '411001', contactName: 'Aanya Sharma', email: 'second@company.example',
  })).status, 409, 'recovery must not create another registration');

  // Simulates refresh/reopen: recovery uses the saved account email, with no registration state.
  await setUser(failed.user.id, { setup_last_sent_at: Date.now() - 61_000 });
  failSetupMail = true;
  const accepted = await request('/api/auth/resend-password-setup', { email: 'second@company.example' });
  failSetupMail = false;
  assert.equal(accepted.status, 200);
  assert.equal(accepted.body.message, 'If the account is eligible, a setup link will be sent. If it does not arrive, you can try again after 60 seconds.');
  const failedRecoveryToken = extractSetupToken(sent.at(-1));
  assert.equal((await getUser(failed.user.id)).password_setup_status, 'PENDING');
  assert.notEqual(failedRecoveryToken, failed.initialToken);
  const afterFailedDelivery = sent.length;
  assert.deepEqual((await request('/api/auth/resend-password-setup', { email: 'second@company.example' })).body, accepted.body);
  assert.equal(sent.length, afterFailedDelivery, 'failed delivery must still enforce the account cooldown');
  assert.equal((await request('/api/auth/setup-password', { token: failed.initialToken, password: 'StrongPass!2026', confirmation: 'StrongPass!2026' })).status, 410);
  await setUser(failed.user.id, { setup_last_sent_at: Date.now() - 61_000 });
  const retried = await request('/api/auth/resend-password-setup', { email: 'second@company.example' });
  assert.deepEqual(retried.body, accepted.body);
  const recoveredToken = extractSetupToken(sent.at(-1));
  assert.notEqual(recoveredToken, failedRecoveryToken);
  assert.equal((await request('/api/auth/setup-password', { token: failedRecoveryToken, password: 'StrongPass!2026', confirmation: 'StrongPass!2026' })).status, 410);
  assert.equal((await getUser(failed.user.id)).setup_token_hash,
    (await import('../security.js')).sha256(recoveredToken));

  // Account quota is durable in MongoDB; delivery failures still consume a cooldown and quota.
  await setUser(failed.user.id, { setup_resend_count: 1, setup_resend_window_started_at: Date.now() });
  for (let count = 1; count < 5; count++) {
    await setUser(failed.user.id, { setup_last_sent_at: Date.now() - 61_000 });
    await request('/api/auth/resend-password-setup', { email: 'second@company.example' });
  }
  const deliveriesBeforeLimit = sent.length;
  await setUser(failed.user.id, { setup_last_sent_at: Date.now() - 61_000 });
  assert.equal((await request('/api/auth/resend-password-setup', { email: 'second@company.example' })).status, 200);
  assert.equal(sent.length, deliveriesBeforeLimit, 'sixth account request must not send email');
  assert.equal((await getUser(failed.user.id)).setup_resend_count, 5);

  await setUser(failed.user.id, { setup_expires_at: Date.now() - 1 });
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
