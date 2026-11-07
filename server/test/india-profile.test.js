import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { validateRegistration, validateCompanyProfile } from '../validation.js';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

process.env.NODE_ENV = 'test';
process.env.OTP_HMAC_SECRET = 'test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const mongo = await useThrowawayDb();
const { app, closeDatabase } = mongo ? await import('../index.js') : {};
const [{ sha256 }, mail] = await Promise.all([import('../security.js'), import('../mail.js')]);
mail.setMailSenderForTests(async () => ({ messageId: 'india-test-only' }));
const server = app && createServer(app);
if (app) await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = server && `http://127.0.0.1:${server.address().port}`;
const baseRegistration = {
  companyName: 'Northstar Labs', address1: '10 Main Street', state: 'Maharashtra', city: 'Pune',
  postal: '000123', contactName: 'Aanya Sharma', email: 'india@company.example', phone: '',
};
const post = async (path, body, cookie = '') => {
  const response = await fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: await response.json(), headers: response.headers };
};

test('India-only registration validation accepts optional PAN and preserves PIN strings', () => {
  const emptyPan = validateRegistration({ ...baseRegistration, pan: '', country: 'India', countryCode: 'IN' });
  assert.equal(emptyPan.pan, null);
  assert.equal(emptyPan.msme, null);
  assert.equal(emptyPan.country, 'India');
  assert.equal(emptyPan.countryCode, 'IN');
  assert.equal(emptyPan.postal, '000123');
  assert.equal(emptyPan.phone, null);
  assert.equal(validateRegistration({ ...baseRegistration, pan: null }).pan, null);
  assert.equal(validateRegistration({ ...baseRegistration }).pan, null);

  assert.equal(validateRegistration({ ...baseRegistration, pan: 'abcpn1234f' }).pan, 'ABCPN1234F');
  for (const pan of ['ABCDE1234', 'ABCDE1234X', 'invalid']) {
    assert.throws(() => validateRegistration({ ...baseRegistration, pan }), /valid Indian PAN/);
  }
  assert.throws(() => validateRegistration({ ...baseRegistration, companyName: '' }), /valid company name/);
  assert.throws(() => validateRegistration({ ...baseRegistration, contactName: '' }), /valid contact name/);
  assert.throws(() => validateRegistration({ ...baseRegistration, email: 'not-an-email' }), /valid email/);
});

test('registration rejects foreign country, invalid state/city, PIN, and non-Indian phone', () => {
  assert.throws(() => validateRegistration({ ...baseRegistration, country: 'United States', countryCode: 'US' }), /Only companies based in India/);
  assert.throws(() => validateRegistration({ ...baseRegistration, state: '' }), /valid Indian state/);
  assert.throws(() => validateRegistration({ ...baseRegistration, city: '' }), /city in the chosen/);
  assert.throws(() => validateRegistration({ ...baseRegistration, city: 'Unknown City' }), /city in the chosen/);
  for (const postal of ['12345', '1234567', '12A456']) {
    assert.throws(() => validateRegistration({ ...baseRegistration, postal }), /six-digit Indian PIN/);
  }
  assert.throws(() => validateRegistration({ ...baseRegistration, phone: '+1 415 555 2671' }), /valid Indian phone/);
  assert.equal(validateRegistration({ ...baseRegistration, phone: '9876543210' }).phone, '+919876543210');
});

test('registration API enforces India and email uniqueness; profile API is authenticated and logout revokes session', { skip }, async t => {
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    await closeDatabase();
    await mongo.drop();
  });
  const { db } = mongo;
  const addSession = (tokenHash, userRowId) => {
    const expires = Date.now() + 60_000;
    return db.collection('sessions').insertOne({ token_hash: tokenHash, user_id: userRowId, expires_at: expires, expires_at_date: new Date(expires), created_at: new Date().toISOString() });
  };
  const addUser = (_id, company_id, user_id) => db.collection('users').insertOne({ _id, company_id, user_id, password_hash: 'test-hash', created_at: new Date().toISOString(), email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED' });
  const company = id => db.collection('companies').findOne({ _id: id });

  const health = await fetch(`${origin}/api/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).ok, true);
  const foreign = await post('/api/registrations', { ...baseRegistration, country: 'Canada', countryCode: 'CA' });
  assert.equal(foreign.status, 400);
  const created = await post('/api/registrations', { ...baseRegistration, country: 'India', countryCode: 'IN', pan: '' });
  assert.equal(created.status, 201);
  const stored = await db.collection('companies').findOne({ _id: created.body.registrationId }, { projection: { _id: 0, pan: 1, country: 1, country_code: 1, postal: 1, phone_e164: 1 } });
  assert.deepEqual(stored, { pan: null, country: 'India', country_code: 'IN', postal: '000123', phone_e164: null });
  assert.equal((await post('/api/registrations', { ...baseRegistration, email: 'INDIA@COMPANY.EXAMPLE' })).status, 409);

  const companyId = created.body.registrationId;
  await addUser('profile-user', companyId, 'india-profile-user');
  const token = 'test-session-token-for-india-profile';
  await addSession(sha256(token), 'profile-user');
  const cookie = `osf_session=${encodeURIComponent(token)}`;

  assert.equal((await fetch(`${origin}/api/company/profile`)).status, 401);
  const profileResponse = await fetch(`${origin}/api/company/profile`, { headers: { cookie } });
  assert.equal(profileResponse.status, 200);
  const profile = (await profileResponse.json()).company;
  const registeredAt = (await company(companyId)).created_at;
  assert.equal(profile.registeredAt, registeredAt);
  assert.equal(profile.emailVerified, 1);
  const payload = {
    companyName: 'Northstar Research', pan: '', msme: '', address1: '22 Residency Road', address2: '',
    state: 'Maharashtra', city: 'Pune', postal: '001234', contactName: 'Aanya Sharma', phone: '9876543210',
    email: 'attacker@invalid.example', companyId: 'some-other-company',
  };
  const saved = await post('/api/company/profile', payload, cookie);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.company.registeredAt, registeredAt);
  assert.equal(saved.body.company.emailVerified, 1);
  assert.equal(saved.body.company.email, 'india@company.example');
  assert.equal(saved.body.company.pan, null);
  assert.equal(saved.body.company.postal, '001234');
  assert.equal(saved.body.company.phone, '+919876543210');
  assert.equal((await company(companyId)).city, 'Pune');
  assert.equal((await post('/api/company/profile', { ...payload, city: 'Unknown City' }, cookie)).status, 400);
  assert.equal((await company(companyId)).city, 'Pune');
  assert.throws(() => validateCompanyProfile({ ...payload, country: 'Singapore' }, 'india@company.example'), /Only companies based in India/);
  assert.equal((await post('/api/company/profile', payload)).status, 401);

  await db.collection('companies').insertOne({ _id: 'legacy-company', company_name: 'Legacy Example', address1: '1 Old Road', country: 'Canada', country_code: 'CA', city: 'Toronto', contact_name: 'Legacy User', email: 'legacy@company.example', status: 'VERIFIED', created_at: new Date().toISOString() });
  await addUser('legacy-user', 'legacy-company', 'legacy-profile-user');
  const legacyToken = 'test-session-token-for-legacy-profile';
  await addSession(sha256(legacyToken), 'legacy-user');
  assert.equal((await post('/api/company/profile', payload, `osf_session=${legacyToken}`)).status, 409);
  const legacy = await company('legacy-company');
  assert.deepEqual({ country: legacy.country, country_code: legacy.country_code, city: legacy.city }, { country: 'Canada', country_code: 'CA', city: 'Toronto' });

  const logout = await post('/api/auth/logout', {}, cookie);
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get('set-cookie'), /Max-Age=0/);
  assert.equal((await fetch(`${origin}/api/company/profile`, { headers: { cookie } })).status, 401);
});
