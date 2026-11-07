import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

process.env.NODE_ENV = 'test';
process.env.OTP_HMAC_SECRET = 'platform-test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';
const mongo = await useThrowawayDb();
const { app, closeDatabase } = mongo ? await import('../index.js') : {};
const { sha256, newSecret, newId } = await import('../security.js');
const server = app && createServer(app);
if (app) {
  app.set('trust proxy', 'loopback');
  await new Promise(r => server.listen(0, '127.0.0.1', r));
}
const origin = server && `http://127.0.0.1:${server.address().port}`;
let seq = 100;
async function request(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${origin}${path}`, { method, headers: { 'x-forwarded-for': `203.0.113.${seq++}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
async function company(id) {
  const { db } = mongo;
  const ts = new Date().toISOString(); const acc = newId(); const token = newSecret();
  await db.collection('companies').insertOne({ _id: id, company_name: id, address1: '1 Rd', country: 'India', country_code: 'IN', city: 'Pune', contact_name: 'Owner', email: `${id}@x.example`, status: 'VERIFIED', created_at: ts, verified_at: ts });
  await db.collection('users').insertOne({ _id: acc, company_id: id, user_id: `OSF-${id}`, password_hash: 'h', created_at: ts, email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED' });
  const expires = Date.now() + 60000;
  await db.collection('sessions').insertOne({ token_hash: sha256(token), user_id: acc, expires_at: expires, expires_at_date: new Date(expires), created_at: ts });
  return `osf_session=${encodeURIComponent(token)}`;
}

test('applicant evaluation requires submission; student profile is scoped to own applicants (404 cross-company)', { skip }, async t => {
  t.after(async () => { await new Promise(r => server.close(r)); await closeDatabase(); await mongo.drop(); });
  const { db } = mongo;
  const ts = new Date().toISOString(); const future = new Date(Date.now() + 86400000).toISOString();
  const one = await company('co-one'); const two = await company('co-two');
  const acc = newId(); const sid = newId(); const chId = newId(); const appId = newId();
  await db.collection('student_users').insertOne({ _id: acc, email: 'stud@example.com', password_hash: 'h', email_verified: 1, account_status: 'ACTIVE', password_created_at: ts, updated_at: ts, created_at: ts });
  await db.collection('students').insertOne({ _id: sid, account_id: acc, full_name: 'Asha Student', college: 'Example Institute', created_at: ts, updated_at: ts });
  await db.collection('challenges').insertOne({ _id: chId, company_id: 'co-one', role_title: 'Role', task_description: 'Task', required_skills: [], status: 'PUBLISHED', application_opens_at: ts, application_closes_at: future, individual_task_duration_days: 2, created_at: ts, updated_at: ts });
  await db.collection('applications').insertOne({ _id: appId, challenge_id: chId, student_id: sid, applied_at: ts, individual_deadline: future, status: 'IN_PROGRESS', created_at: ts, updated_at: ts });

  const evalBody = { rating: 4, feedback: 'ok', isShortlisted: true };
  assert.equal((await request(`/api/company/applications/${appId}/evaluation`, { method: 'PUT', cookie: one, body: evalBody })).status, 400);
  await db.collection('submissions').insertOne({ _id: newId(), application_id: appId, created_at: ts, updated_at: ts });
  assert.equal((await request(`/api/company/applications/${appId}/evaluation`, { method: 'PUT', cookie: one, body: evalBody })).status, 400);
  await db.collection('submissions').updateOne({ application_id: appId }, { $set: { submitted_at: ts } });
  await db.collection('applications').updateOne({ _id: appId }, { $set: { status: 'SUBMITTED' } });
  assert.equal((await request(`/api/company/applications/${appId}/evaluation`, { method: 'PUT', cookie: one, body: evalBody })).status, 200);

  const ok = await request(`/api/company/applications/${appId}/student`, { cookie: one });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.student.fullName, 'Asha Student');
  assert.equal(ok.body.student.contactEmail, 'stud@example.com');
  assert.equal((await request(`/api/company/applications/${appId}/student`, { cookie: two })).status, 404);
  assert.equal((await request(`/api/company/applications/${appId}/student`)).status, 401);
});
