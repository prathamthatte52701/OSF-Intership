import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const testDirectory = mkdtempSync(join(tmpdir(), 'osf-platform-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(testDirectory, 'platform.sqlite');
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

test('additive platform migration and student/company flows preserve ownership and answer-key privacy', async t => {
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    if (testUploadPath) rmSync(testUploadPath, { force: true });
    db.close();
    rmSync(testDirectory, { recursive: true, force: true });
  });

  assert.deepEqual(db.prepare('SELECT version FROM schema_migrations ORDER BY version').all().map(row => row.version), [1, 2, 3, 4]);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  const company = companySession('company-one', 'owner@one.example');
  const otherCompany = companySession('company-two', 'owner@two.example');

  const registration = await request('/api/student/auth/register', { method: 'POST', body: { email: 'student@example.com', password: 'StrongPass!2026' } });
  assert.equal(registration.status, 201);
  assert.equal(registration.body.emailVerified, false);
  const otp = sentMail.at(-1).text.match(/code is (\d{6})/)[1];
  const duplicate = await request('/api/student/auth/register', { method: 'POST', body: { email: 'STUDENT@example.com', password: 'StrongPass!2026' } });
  assert.equal(duplicate.status, 409);
  assert.equal((await request('/api/student/auth/login', { method: 'POST', body: { email: 'student@example.com', password: 'StrongPass!2026' } })).status, 401);
  assert.equal((await request('/api/student/auth/verify-email', { method: 'POST', body: { email: 'student@example.com', otp: '000000' } })).status, 400);
  assert.equal((await request('/api/student/auth/verify-email', { method: 'POST', body: { email: 'student@example.com', otp } })).status, 200);
  const login = await request('/api/student/auth/login', { method: 'POST', body: { email: 'student@example.com', password: 'StrongPass!2026' } });
  assert.equal(login.status, 200);
  const studentCookie = login.headers.get('set-cookie').split(';')[0];
  assert.equal((await request('/api/student/profile', { cookie: studentCookie })).body.profile, null);

  const profileResponse = await request('/api/student/profile', { method: 'PUT', cookie: studentCookie, body: {
    fullName: 'Aarav Student', college: 'Example Institute', degree: 'B.Tech', graduationYear: 2027,
    skills: ['JavaScript', 'SQLite', 'JavaScript'], githubUrl: 'https://github.com/aarav', resumeReference: 'https://example.com/aarav-resume.pdf',
  } });
  assert.equal(profileResponse.status, 200);
  const studentId = profileResponse.body.profile.id;
  assert.deepEqual(profileResponse.body.profile.skills, ['JavaScript', 'SQLite']);
  assert.equal((await request(`/api/students/${studentId}`)).status, 401);
  const ownProfile = await request(`/api/students/${studentId}`, { cookie: studentCookie });
  assert.equal(ownProfile.status, 200);
  assert.equal(ownProfile.body.profile.resumeReference, 'https://example.com/aarav-resume.pdf');
  assert.equal('email' in ownProfile.body.profile, false);
  const secondAccountId = newId(); const secondStudentId = newId(); const secondCreated = new Date().toISOString();
  db.prepare(`INSERT INTO student_users(id,email,password_hash,email_verified,account_status,password_created_at,updated_at,created_at)
    VALUES (?,'another-student@example.com','test-hash',1,'ACTIVE',?,?,?)`).run(secondAccountId, secondCreated, secondCreated, secondCreated);
  db.prepare(`INSERT INTO students(id,account_id,full_name,created_at,updated_at) VALUES (?,?,?, ?,?)`)
    .run(secondStudentId, secondAccountId, 'Another Student', secondCreated, secondCreated);
  const secondStudentToken = newSecret();
  db.prepare('INSERT INTO student_sessions(token_hash,student_user_id,expires_at,created_at) VALUES (?,?,?,?)')
    .run(sha256(secondStudentToken), secondAccountId, Date.now() + 60000, secondCreated);
  const secondStudentCookie = `osf_student_session=${encodeURIComponent(secondStudentToken)}`;
  assert.equal((await request(`/api/students/${secondStudentId}`, { cookie: studentCookie })).status, 403);
  const project = await request('/api/student/projects', { method: 'POST', cookie: studentCookie, body: { title: 'Open Source Tool', projectUrl: 'https://example.com/project' } });
  assert.equal(project.status, 201);
  assert.equal((await request(`/api/students/${studentId}`, { cookie: studentCookie })).body.profile.projects.length, 1);

  const now = Date.now();
  const challengeResponse = await request('/api/company/challenges', { method: 'POST', cookie: company.cookie, body: {
    roleTitle: 'Frontend Challenge', taskDescription: 'Build a small responsive page.', requiredSkills: ['JavaScript', 'CSS'],
    applicationOpensAt: new Date(now - 3600000).toISOString(), applicationClosesAt: new Date(now + 86400000).toISOString(),
    individualTaskDurationDays: 2,
  } });
  assert.equal(challengeResponse.status, 201);
  const challengeId = challengeResponse.body.challenge.id;
  assert.equal((await request(`/api/company/challenges/${challengeId}/publish`, { method: 'POST', cookie: company.cookie })).status, 200);
  db.prepare('UPDATE companies SET company_name=? WHERE id=?').run('Actual Company Name', 'company-one');
  const publicChallenges = await request('/api/challenges');
  assert.equal(publicChallenges.body.challenges.length, 1);
  assert.equal(publicChallenges.body.challenges[0].companyName, 'Actual Company Name');
  assert.equal(publicChallenges.body.challenges[0].companyId, 'company-one');
  assert.equal(publicChallenges.body.challenges[0].roleTitle, 'Frontend Challenge');
  assert.equal(publicChallenges.body.challenges[0].taskDescription, 'Build a small responsive page.');
  const publicChallenge = await request(`/api/challenges/${challengeId}`);
  assert.equal(publicChallenge.body.challenge.companyName, 'Actual Company Name');
  assert.equal(publicChallenge.body.challenge.requiredSkills.includes('JavaScript'), true);
  db.prepare("UPDATE challenges SET status='DRAFT' WHERE id=?").run(challengeId);
  assert.equal((await request('/api/challenges')).body.challenges.length, 0);
  assert.equal((await request(`/api/challenges/${challengeId}`)).status, 404);
  db.prepare("UPDATE challenges SET status='PUBLISHED' WHERE id=?").run(challengeId);
  const applicationResponse = await request(`/api/student/challenges/${challengeId}/applications`, { method: 'POST', cookie: studentCookie, body: {} });
  assert.equal(applicationResponse.status, 201);
  const application = applicationResponse.body.application;
  assert.equal(Date.parse(application.individualDeadline) - Date.parse(application.appliedAt), 2 * 86400000);
  assert.equal((await request(`/api/student/challenges/${challengeId}/applications`, { method: 'POST', cookie: studentCookie, body: {} })).status, 409);
  assert.equal((await request(`/api/student/applications/${application.id}/submission`, { method: 'PUT', cookie: studentCookie, body: { githubUrl: 'https://github.com/aarav/project' } })).status, 409);
  assert.equal((await request(`/api/student/applications/${application.id}/file`, { method: 'PUT', cookie: studentCookie, raw: Buffer.from('test file'), headers: { 'content-type': 'text/plain', 'x-file-name': 'notes.txt' } })).status, 409);
  const history = (await request('/api/student/applications', { cookie: studentCookie })).body.applications;
  assert.equal(history.length, 1);
  assert.equal(history[0].companyName, 'Actual Company Name');
  assert.equal(history[0].taskSnippet, 'Build a small responsive page.');
  assert.deepEqual([...history[0].requiredSkills].sort(), ['CSS', 'JavaScript']);
  assert.equal(history[0].individualTaskDurationDays, 2);
  assert.equal(history[0].isPaid, false);
  assert.ok(history[0].applicationOpensAt);
  assert.deepEqual((await request('/api/student/applications', { cookie: secondStudentCookie })).body.applications, []);
  assert.equal((await request(`/api/student/applications/${application.id}/start`, { method: 'POST', cookie: studentCookie, body: {} })).body.application.status, 'IN_PROGRESS');
  assert.equal((await request(`/api/student/applications/${application.id}/start`, { method: 'POST', cookie: studentCookie, body: {} })).body.application.individualDeadline, application.individualDeadline);
  assert.equal((await request(`/api/company/challenges/${challengeId}/applications`, { cookie: otherCompany.cookie })).status, 404);
  assert.equal((await request(`/api/company/applications/${application.id}`, { cookie: otherCompany.cookie })).status, 404);
  assert.equal((await request(`/api/company/challenges/${challengeId}`, { method: 'PUT', cookie: company.cookie, body: { individualTaskDurationDays: 5 } })).status, 409);
  assert.equal(db.prepare('SELECT individual_deadline FROM applications WHERE id=?').get(application.id).individual_deadline, application.individualDeadline);
  assert.equal((await request(`/api/company/challenges/${challengeId}/close`, { method: 'POST', cookie: company.cookie })).status, 200);
  assert.equal((await request('/api/challenges')).body.challenges.length, 0);
  assert.equal((await request(`/api/challenges/${challengeId}`)).status, 404);

  const upload = await request(`/api/student/applications/${application.id}/file`, {
    method: 'PUT', cookie: studentCookie, raw: Buffer.from('test file'),
    headers: { 'content-type': 'application/octet-stream', 'x-file-name': '../../notes.txt', 'x-file-mime': 'text/plain' },
  });
  assert.equal(upload.status, 201);
  assert.equal(upload.body.file.name, 'notes.txt');
  const storedFile = db.prepare('SELECT storage_key FROM submission_files WHERE id=?').get(upload.body.file.id);
  testUploadPath = new URL(`../uploads/${storedFile.storage_key}`, import.meta.url);
  testUploadPath = (await import('node:url')).fileURLToPath(testUploadPath);
  const draftSubmission = await request(`/api/student/applications/${application.id}/submission`, { cookie: studentCookie });
  assert.equal(draftSubmission.status, 200);
  assert.equal(draftSubmission.body.submission.submittedAt, null);
  assert.equal(draftSubmission.body.submission.file.name, 'notes.txt');
  const draftFileDownload = await request(`/api/student/applications/${application.id}/file`, { cookie: studentCookie });
  assert.equal(draftFileDownload.status, 200);
  assert.equal(draftFileDownload.headers.get('content-disposition').includes('notes.txt'), true);
  assert.equal(Buffer.from(draftFileDownload.raw).toString(), 'test file');
  assert.equal((await request(`/api/student/applications/${application.id}/file`, { cookie: secondStudentCookie })).status, 404);
  assert.equal((await request(`/api/company/applications/${application.id}/file`, { cookie: company.cookie })).status, 404);
  const badUpload = await request(`/api/student/applications/${application.id}/file`, {
    method: 'PUT', cookie: studentCookie, raw: Buffer.from('bad'),
    headers: { 'content-type': 'application/octet-stream', 'x-file-name': 'notes.txt', 'x-file-mime': 'application/pdf' },
  });
  assert.equal(badUpload.status, 400);
  const spoofedPdf = await request(`/api/student/applications/${application.id}/file`, {
    method: 'PUT', cookie: studentCookie, raw: Buffer.from('not a pdf'),
    headers: { 'content-type': 'application/pdf', 'x-file-name': 'document.pdf' },
  });
  assert.equal(spoofedPdf.status, 400);
  const submission = await request(`/api/student/applications/${application.id}/submission`, { method: 'PUT', cookie: studentCookie, body: {
    githubUrl: 'https://github.com/aarav/submission', deployedUrl: 'https://aarav.example.com', fileReference: upload.body.file.id, supportingInformation: 'README includes setup steps.',
  } });
  assert.equal(submission.status, 200);
  assert.equal((await request(`/api/company/applications/${application.id}/file`, { cookie: company.cookie })).status, 200);
  assert.equal((await request(`/api/student/applications/${application.id}/submission`, { cookie: studentCookie })).body.submission.file.name, 'notes.txt');
  assert.equal((await request(`/api/student/applications/${application.id}/submission`, { method: 'PUT', cookie: studentCookie, body: { githubUrl: 'https://github.com/aarav/updated', fileReference: upload.body.file.id } })).status, 200);
  assert.equal((await request(`/api/company/applications/${application.id}/evaluation`, { method: 'PUT', cookie: company.cookie, body: { rating: 5, feedback: 'Clear work.', isShortlisted: true } })).status, 200);
  assert.equal((await request('/api/student/applications', { cookie: studentCookie })).body.applications[0].evaluation.isShortlisted, 1);
  assert.equal((await request(`/api/company/applications/${application.id}/file`, { cookie: otherCompany.cookie })).status, 404);

  const assessmentResponse = await request('/api/company/assessments', { method: 'POST', cookie: company.cookie, body: { title: 'JavaScript Basics', relatedSkill: 'JavaScript', durationMinutes: 30 } });
  assert.equal(assessmentResponse.status, 201);
  const assessmentId = assessmentResponse.body.assessment.id;
  const questionResponse = await request(`/api/company/assessments/${assessmentId}/questions`, { method: 'POST', cookie: company.cookie, body: {
    questionText: 'Which keyword declares a constant?', optionA: 'let', optionB: 'const', optionC: 'var', optionD: 'static', correctAnswer: 'B',
  } });
  assert.equal(questionResponse.status, 201);
  const questionId = questionResponse.body.question.id;
  assert.equal((await request(`/api/company/assessments/${assessmentId}/publish`, { method: 'POST', cookie: company.cookie })).status, 200);
  const publicAssessment = await request(`/api/student/assessments/${assessmentId}`, { cookie: studentCookie });
  assert.equal(publicAssessment.status, 200);
  assert.equal(JSON.stringify(publicAssessment.body).includes('correctAnswer'), false);
  const attemptResponse = await request(`/api/student/assessments/${assessmentId}/attempts`, { method: 'POST', cookie: studentCookie, body: {} });
  assert.equal(attemptResponse.status, 201);
  const attemptId = attemptResponse.body.attempt.id;
  assert.equal((await request(`/api/student/assessments/${assessmentId}`, { cookie: secondStudentCookie })).status, 200);
  const draftAnswers = await request(`/api/student/assessment-attempts/${attemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [{ questionId, selectedOption: 'A' }], finalize: false } });
  assert.equal(draftAnswers.status, 200);
  assert.equal(draftAnswers.body.attempt.status, 'IN_PROGRESS');
  assert.equal(draftAnswers.body.attempt.submittedAt, null);
  assert.equal(draftAnswers.body.attempt.questions[0].selectedOption, 'A');
  assert.equal(JSON.stringify(draftAnswers.body).includes('correctAnswer'), false);
  assert.equal((await request(`/api/student/assessment-attempts/${attemptId}`, { cookie: secondStudentCookie })).status, 404);
  assert.equal((await request(`/api/student/assessment-attempts/${attemptId}/answers`, { method: 'PUT', cookie: secondStudentCookie, body: { answers: [{ questionId, selectedOption: 'B' }], finalize: false } })).status, 404);
  assert.equal((await request(`/api/student/assessment-attempts/${attemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [{ questionId: 'not-this-question', selectedOption: 'B' }], finalize: false } })).status, 400);
  assert.equal((await request(`/api/student/assessment-attempts/${attemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [{ questionId, selectedOption: 'E' }], finalize: false } })).status, 400);
  const restoredAnswers = await request(`/api/student/assessment-attempts/${attemptId}`, { cookie: studentCookie });
  assert.equal(restoredAnswers.body.attempt.questions[0].selectedOption, 'A');
  const attemptSubmit = await request(`/api/student/assessment-attempts/${attemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [{ questionId, selectedOption: 'B' }], finalize: true } });
  assert.equal(attemptSubmit.status, 200);
  assert.equal(attemptSubmit.body.attempt.status, 'SUBMITTED');
  assert.equal(JSON.stringify(attemptSubmit.body).includes('correctAnswer'), false);
  assert.equal((await request(`/api/student/assessment-attempts/${attemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [{ questionId, selectedOption: 'A' }], finalize: false } })).status, 409);
  const companyAttempt = await request(`/api/company/assessment-attempts/${attemptId}`, { cookie: company.cookie });
  assert.equal(companyAttempt.status, 200);
  assert.equal(companyAttempt.body.attempt.questions[0].correctAnswer, 'B');
  assert.equal((await request(`/api/company/assessment-attempts/${attemptId}`, { cookie: otherCompany.cookie })).status, 404);
  assert.equal((await request(`/api/company/assessment-attempts/${attemptId}/evaluation`, { method: 'PUT', cookie: company.cookie, body: { manualScore: 80, companyFeedback: 'Manual review.' } })).status, 200);
  // T11: published assessments are locked against edits (timer/questions must not change under live attempts).
  assert.equal((await request(`/api/company/assessments/${assessmentId}`, { method: 'PUT', cookie: company.cookie, body: { title: 'Changed', durationMinutes: 5 } })).status, 400);
  assert.equal((await request('/api/company/assessments', { cookie: company.cookie })).body.assessments.find(a => a.id === assessmentId).durationMinutes, 30);
  assert.equal((await request(`/api/company/assessments/${assessmentId}/close`, { method: 'POST', cookie: company.cookie })).status, 200);
  assert.equal((await request('/api/student/assessments', { cookie: studentCookie })).body.assessments.some(item => item.id === assessmentId), false);
  const closedAssessment = await request(`/api/student/assessments/${assessmentId}`, { cookie: studentCookie });
  assert.equal(closedAssessment.status, 200);
  assert.equal(JSON.stringify(closedAssessment.body).includes('correctAnswer'), false);
  assert.equal((await request(`/api/student/assessments/${assessmentId}`, { cookie: secondStudentCookie })).status, 404);
  assert.equal((await request(`/api/student/assessments/${assessmentId}/attempts`, { method: 'POST', cookie: studentCookie, body: {} })).status, 404);
  const reviewedAttempt = await request(`/api/student/assessment-attempts/${attemptId}`, { cookie: studentCookie });
  assert.equal(reviewedAttempt.body.attempt.reviewStatus, 'REVIEWED');
  assert.equal(reviewedAttempt.body.attempt.manualScore, 80);
  assert.equal(reviewedAttempt.body.attempt.companyFeedback, 'Manual review.');

  const expiringAssessment = await request('/api/company/assessments', { method: 'POST', cookie: company.cookie, body: { title: 'Short Timer', relatedSkill: 'JavaScript', durationMinutes: 1 } });
  const expiringId = expiringAssessment.body.assessment.id;
  assert.equal((await request(`/api/company/assessments/${expiringId}/questions`, { method: 'POST', cookie: company.cookie, body: { questionText: 'Choose the answer.', optionA: 'A', optionB: 'B', optionC: 'C', optionD: 'D', correctAnswer: 'A' } })).status, 201);
  assert.equal((await request(`/api/company/assessments/${expiringId}/publish`, { method: 'POST', cookie: company.cookie })).status, 200);
  const expiringAttempt = await request(`/api/student/assessments/${expiringId}/attempts`, { method: 'POST', cookie: studentCookie, body: {} });
  const expiringAttemptId = expiringAttempt.body.attempt.id;
  db.prepare('UPDATE skill_assessment_attempts SET started_at=? WHERE id=?').run(new Date(Date.now() - 61000).toISOString(), expiringAttemptId);
  const expiredAttempt = await request(`/api/student/assessment-attempts/${expiringAttemptId}`, { cookie: studentCookie });
  assert.equal(expiredAttempt.body.attempt.status, 'EXPIRED');
  assert.equal(db.prepare('SELECT status FROM skill_assessment_attempts WHERE id=?').get(expiringAttemptId).status, 'EXPIRED');
  assert.equal((await request(`/api/student/assessment-attempts/${expiringAttemptId}`, { cookie: studentCookie })).body.attempt.status, 'EXPIRED');
  assert.equal((await request(`/api/student/assessment-attempts/${expiringAttemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [{ questionId: expiringAssessment.body.assessment.questions?.[0]?.id || db.prepare('SELECT id FROM skill_assessment_questions WHERE assessment_id=?').get(expiringId).id, selectedOption: 'A' }], finalize: false } })).status, 409);
  assert.equal((await request(`/api/student/assessment-attempts/${expiringAttemptId}/answers`, { method: 'PUT', cookie: studentCookie, body: { answers: [], finalize: true } })).status, 409);
  assert.equal((await request(`/api/student/assessments/${expiringId}/attempts`, { method: 'POST', cookie: studentCookie, body: {} })).status, 409);

  const talent = await request('/api/company/talent?skills=JavaScript,CSS&college=Institute', { cookie: company.cookie });
  assert.equal(talent.status, 200);
  assert.equal(talent.body.students[0].matchCount, 1);
  assert.deepEqual(talent.body.students[0].matchedSkills, ['JavaScript']);
  assert.equal(talent.body.students[0].resumeReference, 'https://example.com/aarav-resume.pdf');
  assert.equal((await request(`/api/company/talent/${studentId}`)).status, 401);
  assert.equal((await request(`/api/company/talent/${studentId}`, { cookie: company.cookie })).status, 200);
  assert.equal((await request(`/api/company/talent/${studentId}`, { cookie: otherCompany.cookie })).status, 200);
  assert.equal((await request(`/api/company/saved-students/${studentId}`, { method: 'POST', cookie: company.cookie, body: { note: 'Good fit.' } })).status, 201);
  assert.equal((await request(`/api/company/saved-students/${secondStudentId}`, { method: 'POST', cookie: otherCompany.cookie, body: { note: 'Separate company note.' } })).status, 201);
  assert.equal((await request('/api/company/saved-students', { cookie: company.cookie })).body.students.length, 1);
  assert.equal((await request('/api/company/saved-students', { cookie: otherCompany.cookie })).body.students[0].id, secondStudentId);

  const expiredChallenge = await request('/api/company/challenges', { method: 'POST', cookie: company.cookie, body: {
    roleTitle: 'Expired State Check', taskDescription: 'Test server-side application expiry.', requiredSkills: ['JavaScript'],
    applicationOpensAt: new Date(Date.now() - 3600000).toISOString(), applicationClosesAt: new Date(Date.now() + 86400000).toISOString(), individualTaskDurationDays: 1,
  } });
  const expiredChallengeId = expiredChallenge.body.challenge.id;
  assert.equal((await request(`/api/company/challenges/${expiredChallengeId}/publish`, { method: 'POST', cookie: company.cookie })).status, 200);
  const secondApplication = await request(`/api/student/challenges/${expiredChallengeId}/applications`, { method: 'POST', cookie: secondStudentCookie, body: {} });
  const secondApplicationId = secondApplication.body.application.id;
  assert.equal((await request(`/api/company/challenges/${expiredChallengeId}/close`, { method: 'POST', cookie: company.cookie })).status, 200);
  assert.equal((await request(`/api/student/applications/${secondApplicationId}/submission`, { method: 'PUT', cookie: secondStudentCookie, body: { githubUrl: 'https://github.com/another/project' } })).status, 409);
  assert.equal((await request(`/api/student/applications/${secondApplicationId}/start`, { method: 'POST', cookie: secondStudentCookie, body: {} })).status, 200);
  db.prepare("UPDATE applications SET individual_deadline=? WHERE id=?").run(new Date(Date.now() - 1000).toISOString(), secondApplicationId);
  assert.equal((await request(`/api/student/applications/${secondApplicationId}/submission`, { method: 'PUT', cookie: secondStudentCookie, body: { githubUrl: 'https://github.com/another/project' } })).status, 409);
  assert.equal(db.prepare('SELECT status FROM applications WHERE id=?').get(secondApplicationId).status, 'EXPIRED');
  assert.equal((await request(`/api/student/applications/${secondApplicationId}/start`, { method: 'POST', cookie: secondStudentCookie, body: {} })).status, 409);

  rmSync(testUploadPath, { force: true });
  const missingFile = await request(`/api/student/applications/${application.id}/file`, { cookie: studentCookie });
  assert.equal(missingFile.status, 404);
  assert.equal(missingFile.body.error, 'Submission file not found.');
  testUploadPath = undefined;
});
