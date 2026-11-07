import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

process.env.NODE_ENV = 'test';
process.env.OTP_HMAC_SECRET = 'talent-test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const mongo = await useThrowawayDb();
const { app, closeDatabase } = mongo ? await import('../index.js') : {};
const { sha256, newSecret, newId } = await import('../security.js');
const db = mongo?.db;
const server = app && createServer(app);
if (app) {
  app.set('trust proxy', 'loopback');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const origin = server && `http://127.0.0.1:${server.address().port}`;
let sequence = 20;
async function call(path, cookie, method = 'GET', body) {
  const response = await fetch(`${origin}${path}`, { method, headers: { 'x-forwarded-for': `198.51.100.${sequence++}`, ...(body ? { 'content-type': 'application/json' } : {}), cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const now = () => new Date().toISOString();
async function company(id) {
  const t = now(); const accountId = newId(); const token = newSecret();
  await db.collection('companies').insertOne({ _id: id, company_name: id, address1: '1 Road', country: 'India', country_code: 'IN', city: 'Pune', contact_name: 'Owner', email: `${id}@x.example`, status: 'VERIFIED', created_at: t, verified_at: t });
  await db.collection('users').insertOne({ _id: accountId, company_id: id, user_id: `OSF-${id}`, password_hash: 'x', created_at: t, email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED' });
  const expires = Date.now() + 60000;
  await db.collection('sessions').insertOne({ token_hash: sha256(token), user_id: accountId, expires_at: expires, expires_at_date: new Date(expires), created_at: t });
  return `osf_session=${encodeURIComponent(token)}`;
}
async function student(id, skills, { visible = 1, updated = now() } = {}) {
  const t = now();
  await db.collection('student_users').insertOne({ _id: `u-${id}`, email: `${id}@s.example`, password_hash: 'x', email_verified: 1, account_status: 'ACTIVE', password_created_at: t, updated_at: t, created_at: t });
  await db.collection('students').insertOne({ _id: id, account_id: `u-${id}`, full_name: id, college: 'Test Institute', profile_visible: visible, created_at: t, updated_at: updated });
  if (skills.length) await db.collection('student_skills').insertMany(skills.map(skill => ({ _id: newId(), student_id: id, skill, created_at: t })));
}

test('talent discovery: ranking, pagination, visibility, saved note', { skip }, async t => {
  t.after(async () => { await new Promise(r => server.close(r)); await closeDatabase(); await mongo.drop(); });
  const c1 = await company('c1'); const c2 = await company('c2');

  // Best match is the OLDEST profile, so a recency-first cut would drop it.
  await student('best', ['JavaScript', 'CSS', 'SQL'], { updated: '2000-01-01T00:00:00.000Z' });
  await student('mid', ['javascript', 'css'], { updated: '2000-01-02T00:00:00.000Z' });
  for (let i = 0; i < 30; i++) await student(`one${i}`, ['JavaScript'], { updated: `2020-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` });
  let r = await call('/api/company/talent?skills=JavaScript,CSS,SQL&limit=3', c1);
  assert.deepEqual(r.body.students.map(s => s.id), ['best', 'mid', 'one29']);
  assert.deepEqual(r.body.students.map(s => s.matchCount), [3, 2, 1]);
  assert.equal(r.body.total, 32);
  r = await call('/api/company/talent?skills=JavaScript,CSS,SQL&limit=3&offset=3', c1);
  assert.equal(r.body.students[0].id, 'one28');
  r = await call('/api/company/talent?limit=500', c1);
  assert.equal(r.body.limit, 50); assert.equal(r.body.students.length, 32);

  await student('hidden', ['Rust'], { visible: 0 });
  await student('hiddenApplied', ['Rust'], { visible: 0 });
  await student('shown', ['Rust']);
  const ids = body => body.students.map(s => s.id).sort();
  const t0 = now();
  await db.collection('challenges').insertOne({ _id: 'ch1', company_id: 'c1', role_title: 'Role', task_description: 'Task', required_skills: [], application_opens_at: t0, application_closes_at: t0, individual_task_duration_days: 1, status: 'PUBLISHED', created_at: t0, updated_at: t0 });
  await db.collection('applications').insertOne({ _id: 'a1', challenge_id: 'ch1', student_id: 'hiddenApplied', applied_at: t0, individual_deadline: t0, status: 'APPLIED', created_at: t0, updated_at: t0 });
  assert.deepEqual(ids((await call('/api/company/talent?skills=Rust', c1)).body), ['hiddenApplied', 'shown']); // visible shown, hidden excluded, applied included
  assert.deepEqual(ids((await call('/api/company/talent?skills=Rust', c2)).body), ['shown']); // different company: applied student stays hidden
  assert.equal((await call('/api/company/talent/hidden', c1)).status, 404);
  assert.equal((await call('/api/company/talent/hiddenApplied', c1)).status, 200);
  assert.equal((await call('/api/company/talent/hiddenApplied', c2)).status, 404);
  assert.equal((await call('/api/company/talent/shown', c2)).status, 200);

  assert.equal((await call('/api/company/saved-students/best', c1, 'POST', { note: 'Strong' })).status, 201);
  assert.equal((await call('/api/company/saved-students', c1)).body.students[0].note, 'Strong');
});
