import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const testDirectory = mkdtempSync(join(tmpdir(), 'osf-audit-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(testDirectory, 'audit.sqlite');
process.env.OTP_HMAC_SECRET = 'platform-test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const [{ app }, { db }, { sha256 }, { newSecret, newId }, mail] = await Promise.all([
  import('../index.js'), import('../db.js'), import('../security.js'), import('../security.js'), import('../mail.js'),
]);
const sentMail = [];
mail.setMailSenderForTests(async message => { sentMail.push(message); return { messageId: 'platform-test-only' }; });
const server = createServer(app);
app.set('trust proxy', 'loopback');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
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
function companySession(companyId, email) {
  const timestamp = new Date().toISOString();
  const accountId = newId(); const token = newSecret();
  db.prepare(`INSERT INTO companies(id,company_name,address1,country,country_code,city,contact_name,email,status,created_at,verified_at)
    VALUES (?,?,?,'India','IN','Pune','Company Owner',?,'VERIFIED',?,?)`).run(companyId, 'Test Company', '1 Test Road', email, timestamp, timestamp);
  db.prepare(`INSERT INTO users(id,company_id,user_id,password_hash,created_at,email_verified,must_change_password,password_setup_status)
    VALUES (?,?,?, 'test-only-hash',?,1,0,'COMPLETED')`).run(accountId, companyId, `OSF-${companyId}`, timestamp);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha256(token), accountId, Date.now() + 60000, timestamp);
  return { cookie: `osf_session=${encodeURIComponent(token)}`, accountId };
}


function studentSession(email) {
  const accountId = newId(); const studentId = newId(); const ts = new Date().toISOString(); const token = newSecret();
  db.prepare(`INSERT INTO student_users(id,email,password_hash,email_verified,account_status,password_created_at,updated_at,created_at)
    VALUES (?,?,'test-hash',1,'ACTIVE',?,?,?)`).run(accountId, email, ts, ts, ts);
  db.prepare('INSERT INTO students(id,account_id,full_name,created_at,updated_at) VALUES (?,?,?,?,?)').run(studentId, accountId, 'Audit Student', ts, ts);
  db.prepare('INSERT INTO student_sessions(token_hash,student_user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha256(token), accountId, Date.now() + 60000, ts);
  return { cookie: `osf_student_session=${encodeURIComponent(token)}`, studentId };
}

test('T14 audit fixes: edit lock, public window, assessment privacy, drafts, uploads', async t => {
  t.after(async () => { await new Promise(resolve => server.close(resolve)); db.close(); rmSync(testDirectory, { recursive: true, force: true }); });
  const company = companySession('audit-co', 'audit@co.example');
  const student = studentSession('audit-student@example.com');
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
  assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get(applicationId).status, 'IN_PROGRESS');

  const filePath = key => fileURLToPath(new URL(`../uploads/${key}`, import.meta.url));
  const upload = name => request(`/api/student/applications/${applicationId}/file`, { method: 'PUT', cookie: student.cookie, raw: Buffer.from(name), headers: { 'content-type': 'application/octet-stream', 'x-file-name': `${name}.txt`, 'x-file-mime': 'text/plain' } });
  const first = await upload('one'); assert.equal(first.status, 201);
  const firstKey = db.prepare('SELECT storage_key FROM submission_files WHERE id=?').get(first.body.file.id).storage_key;
  assert.equal(existsSync(filePath(firstKey)), true);
  const second = await upload('two'); assert.equal(second.status, 201);
  const secondKey = db.prepare('SELECT storage_key FROM submission_files WHERE id=?').get(second.body.file.id).storage_key;
  assert.equal(existsSync(filePath(firstKey)), false);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM submission_files WHERE application_id=?').get(applicationId).n, 1);
  assert.equal(db.prepare('SELECT file_reference FROM submissions WHERE application_id=?').get(applicationId).file_reference, second.body.file.id);
  assert.equal((await request(`/api/student/applications/${applicationId}/submission`, { method: 'PUT', cookie: student.cookie, body: { githubUrl: 'https://github.com/a/b' } })).status, 200);
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { supportingInformation: 'late' } })).status, 409);

  assert.equal((await request(`/api/company/applications/${applicationId}/evaluation`, { method: 'PUT', cookie: company.cookie, body: { rating: 4, isShortlisted: false } })).status, 200);
  assert.equal((await upload('three')).status, 400);
  assert.equal((await request(`/api/student/applications/${applicationId}/submission`, { method: 'PUT', cookie: student.cookie, body: { githubUrl: 'https://github.com/a/c' } })).status, 400);
  assert.equal((await request(draftPath, { method: 'PUT', cookie: student.cookie, body: { supportingInformation: 'after eval' } })).status, 400);
  rmSync(filePath(secondKey), { force: true });
});
