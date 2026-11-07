import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

process.env.NODE_ENV = 'test';
process.env.OTP_HMAC_SECRET = 'platform-test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const mongo = await useThrowawayDb();
const { app, closeDatabase } = mongo ? await import('../index.js') : {};
const [{ sha256, newSecret, newId }, mail] = await Promise.all([import('../security.js'), import('../mail.js')]);
const db = mongo?.db;
const sentMail = [];
mail.setMailSenderForTests(async message => { sentMail.push(message); return { messageId: 'platform-test-only' }; });
const server = app && createServer(app);
if (app) {
  app.set('trust proxy', 'loopback');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
}
const origin = server && `http://127.0.0.1:${server.address().port}`;
let sequence = 20;
let testUploadPath;
async function request(path, { method = 'GET', body, cookie, headers = {}, raw } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { 'x-forwarded-for': `198.51.100.${sequence++}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...headers },
    ...(body !== undefined ? { body: JSON.stringify(body) } : raw !== undefined ? { body: raw } : {}),
  });
  const payload = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;
  return { status: response.status, body: payload, headers: response.headers, raw: payload == null ? await response.arrayBuffer() : null };
}
async function companySession(companyId, email) {
  const timestamp = new Date().toISOString();
  const accountId = newId(); const token = newSecret();
  await db.collection('companies').insertOne({ _id: companyId, company_name: 'Test Company', address1: '1 Test Road', country: 'India', country_code: 'IN', city: 'Pune', contact_name: 'Company Owner', email, status: 'VERIFIED', created_at: timestamp, verified_at: timestamp });
  await db.collection('users').insertOne({ _id: accountId, company_id: companyId, user_id: `OSF-${companyId}`, password_hash: 'test-only-hash', created_at: timestamp, email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED' });
  const expires = Date.now() + 60000;
  await db.collection('sessions').insertOne({ token_hash: sha256(token), user_id: accountId, expires_at: expires, expires_at_date: new Date(expires), created_at: timestamp });
  return { cookie: `osf_session=${encodeURIComponent(token)}`, accountId };
}


async function studentSession(email) {
  const accountId = newId(); const studentId = newId(); const ts = new Date().toISOString(); const token = newSecret();
  await db.collection('student_users').insertOne({ _id: accountId, email, password_hash: 'test-hash', email_verified: 1, account_status: 'ACTIVE', password_created_at: ts, updated_at: ts, created_at: ts });
  await db.collection('students').insertOne({ _id: studentId, account_id: accountId, full_name: 'Audit Student', created_at: ts, updated_at: ts });
  const expires = Date.now() + 60000;
  await db.collection('student_sessions').insertOne({ token_hash: sha256(token), student_user_id: accountId, expires_at: expires, expires_at_date: new Date(expires), created_at: ts });
  return { cookie: `osf_student_session=${encodeURIComponent(token)}`, studentId };
}

test('T14 audit fixes: edit lock, public window, assessment privacy, drafts, uploads', { skip }, async t => {
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await closeDatabase(); await mongo.drop(); });
  const company = await companySession('audit-co', 'audit@co.example');
  const student = await studentSession('audit-student@example.com');
  const now = Date.now();
  const base = { roleTitle: 'Audit Role', taskDescription: 'Do the thing.', requiredSkills: ['JavaScript'], applicationOpensAt: new Date(now - 3600000).toISOString(), applicationClosesAt: new Date(now + 86400000).toISOString(), individualTaskDurationDays: 2 };
  const create = async overrides => (await request('/api/company/challenges', { method: 'POST', cookie: company.cookie, body: { ...base, ...overrides } }));

  // F5: empty skills rejected; edit only while DRAFT
  assert.equal((await create({ requiredSkills: [] })).status, 400);
  const challengeId = (await create({})).body.challenge.id;
  assert.equal((await request(`/api/company/challenges/${challengeId}`, { method: 'PUT', cookie: company.cookie, body: { requiredSkills: [] } })).status, 400);
  assert.equal((await request(`/api/company/challenges/${challengeId}`, { method: 'PUT', cookie: company.cookie, body: { roleTitle: 'Edited' } })).status, 200);
  assert.equal((await request(`/api/company/challenges/${challengeId}/publish`, { method: 'POST', cookie: company.cookie })).status, 200);
  assert.equal((await request(`/api/company/challenges/${challengeId}`, { method: 'PUT', cookie: company.cookie, body: { roleTitle: 'Late edit' } })).status, 409);

  // F7: only open windows are listed; limit/offset supported
  const futureId = (await create({ roleTitle: 'Future', applicationOpensAt: new Date(now + 3600000).toISOString(), applicationClosesAt: new Date(now + 7200000).toISOString() })).body.challenge.id;
  assert.equal((await request(`/api/company/challenges/${futureId}/publish`, { method: 'POST', cookie: company.cookie })).status, 200);
  const secondId = (await create({ roleTitle: 'Second' })).body.challenge.id;
  await request(`/api/company/challenges/${secondId}/publish`, { method: 'POST', cookie: company.cookie });
  const listed = (await request('/api/challenges')).body.challenges.map(c => c.id);
  assert.equal(listed.includes(futureId), false);
  assert.equal(listed.includes(challengeId) && listed.includes(secondId), true);
  assert.equal((await request('/api/challenges?limit=1')).body.challenges.length, 1);
  assert.equal((await request('/api/challenges?limit=1&offset=1')).body.challenges.length, 1);
  assert.equal((await request('/api/challenges?offset=5')).body.challenges.length, 0);

  // F9: assessment detail has no questions; attempt does
  const assessmentId = (await request('/api/company/assessments', { method: 'POST', cookie: company.cookie, body: { title: 'Quiz', relatedSkill: 'JavaScript', durationMinutes: 30 } })).body.assessment.id;
  await request(`/api/company/assessments/${assessmentId}/questions`, { method: 'POST', cookie: company.cookie, body: { questionText: 'Q?', optionA: 'a', optionB: 'b', optionC: 'c', optionD: 'd', correctAnswer: 'B' } });
  await request(`/api/company/assessments/${assessmentId}/publish`, { method: 'POST', cookie: company.cookie });
  const detail = await request(`/api/student/assessments/${assessmentId}`, { cookie: student.cookie });
  assert.equal(detail.status, 200);
  assert.equal('questions' in detail.body.assessment, false);
  const attempt = await request(`/api/student/assessments/${assessmentId}/attempts`, { method: 'POST', cookie: student.cookie, body: {} });
  assert.equal(attempt.body.attempt.questions.length, 1);
  assert.equal(JSON.stringify(attempt.body).includes('correctAnswer'), false);

  // S1 drafts, F6 upload replacement, evaluated lock
  const applicationId = (await request(`/api/student/challenges/${challengeId}/applications`, { method: 'POST', cookie: student.cookie, body: {} })).body.application.id;
  const draftPath = `/api/student/applications/${applicationId}/draft`;
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { supportingInformation: 'x' } })).status, 409);
  await request(`/api/student/applications/${applicationId}/start`, { method: 'POST', cookie: student.cookie, body: {} });
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { supportingInformation: 'work in progress', githubUrl: 'https://github.com/a/b' } })).status, 200);
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { githubUrl: 'not a url' } })).status, 400);
  const saved = (await request(`/api/student/applications/${applicationId}/submission`, { cookie: student.cookie })).body.submission;
  assert.equal(saved.supportingInformation, 'work in progress');
  assert.equal(saved.submittedAt, null);
  assert.equal((await db.collection('applications').findOne({ _id: applicationId })).status, 'IN_PROGRESS');

  const filePath = key => fileURLToPath(new URL(`../uploads/${key}`, import.meta.url));
  const upload = name => request(`/api/student/applications/${applicationId}/file`, { method: 'PUT', cookie: student.cookie, raw: Buffer.from(name), headers: { 'content-type': 'application/octet-stream', 'x-file-name': `${name}.txt`, 'x-file-mime': 'text/plain' } });
  const first = await upload('one'); assert.equal(first.status, 201);
  const firstKey = (await db.collection('submission_files').findOne({ _id: first.body.file.id })).storage_key;
  assert.equal(existsSync(filePath(firstKey)), true);
  const second = await upload('two'); assert.equal(second.status, 201);
  const secondKey = (await db.collection('submission_files').findOne({ _id: second.body.file.id })).storage_key;
  assert.equal(existsSync(filePath(firstKey)), false);
  assert.equal(await db.collection('submission_files').countDocuments({ application_id: applicationId }), 1);
  assert.equal((await db.collection('submissions').findOne({ application_id: applicationId })).file_reference, second.body.file.id);
  assert.equal((await request(`/api/student/applications/${applicationId}/submission`, { method: 'PUT', cookie: student.cookie, body: { githubUrl: 'https://github.com/a/b' } })).status, 200);
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { supportingInformation: 'late' } })).status, 409);

  assert.equal((await request(`/api/company/applications/${applicationId}/evaluation`, { method: 'PUT', cookie: company.cookie, body: { rating: 4, isShortlisted: false } })).status, 200);
  assert.equal((await upload('three')).status, 400);
  assert.equal((await request(`/api/student/applications/${applicationId}/submission`, { method: 'PUT', cookie: student.cookie, body: { githubUrl: 'https://github.com/a/c' } })).status, 400);
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { supportingInformation: 'after eval' } })).status, 400);
  rmSync(filePath(secondKey), { force: true });
});
