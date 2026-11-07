import express from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { basename, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { InputError } from './validation.js';
import { challengeOwnedByCompany } from './repositories/challengeOwnership.js';
import { hashOtp, hashPassword, newId, newOtp, newSecret, otpMatches, sha256, validatePassword, verifyPassword } from './security.js';
import { sendStudentOtpEmail, sendStudentPasswordResetEmail } from './mail.js';
import { failedLoginLimiter, loginBlockedMessage, sendTooMany } from './rateLimits.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validEmail = value => typeof value === 'string' && value.trim().length <= 254 && emailPattern.test(value.trim());
const text = (value, max = 500) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const nowIso = () => new Date().toISOString();
const nowMs = () => Date.now();
const studentCookie = 'osf_student_session';
const studentSessionLifeMs = 12 * 60 * 60 * 1000;
const studentOtpLifeMs = 5 * 60 * 1000;
const studentOtpIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'If the account is eligible, a verification code will be sent. Try again later.' }),
});
const studentForgotIpLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, limit: 5, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'Too many reset requests. Try again later.' }),
});
const serverDir = dirname(fileURLToPath(import.meta.url));
const uploadDir = resolve(serverDir, 'uploads');
const publicFileTypes = new Map([
  ['.pdf', new Set(['application/pdf'])],
  ['.txt', new Set(['text/plain'])],
  ['.zip', new Set(['application/zip', 'application/x-zip-compressed'])],
  ['.png', new Set(['image/png'])],
  ['.jpg', new Set(['image/jpeg'])],
  ['.jpeg', new Set(['image/jpeg'])],
]);

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
function parseCookie(req, name) {
  const part = (req.headers.cookie || '').split(';').map(item => item.trim()).find(item => item.startsWith(`${name}=`));
  if (!part) return '';
  try { return decodeURIComponent(part.slice(name.length + 1)); } catch { return ''; }
}
function requireStudent(student) {
  return asyncRoute(async (req, res, next) => {
    const token = parseCookie(req, studentCookie);
    const session = token ? await student.findSession(sha256(token)) : null;
    if (!session || session.expires_at <= nowMs()) {
      if (session) await student.deleteSession(session.token_hash);
      res.setHeader('Set-Cookie', `${studentCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
      return res.status(401).json({ error: 'Sign in to continue.' });
    }
    if (!await student.isAccountActive(session.account_id)) {
      return res.status(403).json({ error: 'This student account is not active.' });
    }
    req.student = session;
    next();
  });
}
function parseSkills(value, { required = false } = {}) {
  if (value == null && !required) return [];
  if (!Array.isArray(value) || value.length > 40) throw new InputError('Skills must be a list of up to 40 items.');
  const items = value.map(item => text(item, 60)).filter(Boolean);
  if (items.some(item => item.length < 1)) throw new InputError('Each skill must contain text.');
  const unique = [...new Map(items.map(item => [item.toLocaleLowerCase(), item])).values()];
  if (required && !unique.length) throw new InputError('Add at least one required skill.');
  return unique;
}
function optionalUrl(value, label) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.length > 2048) throw new InputError(`${label} must be a valid web URL.`);
  let parsed;
  try { parsed = new URL(value); } catch { throw new InputError(`${label} must be a valid web URL.`); }
  if (!['http:', 'https:'].includes(parsed.protocol) || !parsed.hostname || parsed.username || parsed.password) {
    throw new InputError(`${label} must be an HTTP or HTTPS URL.`);
  }
  return parsed.toString();
}
function requiredText(value, label, max) {
  const cleaned = text(value, max);
  if (!cleaned) throw new InputError(`${label} is required.`);
  if (typeof value !== 'string' || value.trim().length > max) throw new InputError(`${label} must be ${max} characters or fewer.`);
  return cleaned;
}
function optionalText(value, label, max) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || value.trim().length > max) throw new InputError(`${label} must be ${max} characters or fewer.`);
  return value.trim() || null;
}
function toIsoDate(value, label) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new InputError(`${label} must be a valid date and time.`);
  return new Date(value).toISOString();
}
function assertApplicationDeadline(application) {
  if (Date.parse(application.individual_deadline) <= nowMs()) {
    return false;
  }
  return true;
}
function listStudentSkills(db, studentId) {
  return db.prepare('SELECT skill FROM student_skills WHERE student_id=? ORDER BY skill COLLATE NOCASE').all(studentId).map(row => row.skill);
}
function listProjects(db, studentId) {
  return db.prepare(`SELECT id,title,description,project_url AS projectUrl,created_at AS createdAt,updated_at AS updatedAt
    FROM student_projects WHERE student_id=? ORDER BY created_at DESC`).all(studentId);
}
function studentProfile(db, studentId, { privateFields = false, includeResume = false } = {}) {
  const fields = `${privateFields || includeResume ? ',s.resume_reference AS resumeReference' : ''},s.profile_image AS profileImage`;
  const profile = db.prepare(`SELECT s.id,s.full_name AS fullName${fields},s.college,s.degree,s.graduation_year AS graduationYear,
      s.about,s.github_url AS githubUrl,s.linkedin_url AS linkedinUrl,s.portfolio_url AS portfolioUrl,s.location,
      s.created_at AS createdAt,s.updated_at AS updatedAt${privateFields ? ',s.profile_visible AS profileVisible' : ''}
    FROM students s WHERE s.id=?`).get(studentId);
  if (profile && 'profileVisible' in profile) profile.profileVisible = Boolean(profile.profileVisible);
  if (profile) { profile.skills = listStudentSkills(db, studentId); profile.projects = listProjects(db, studentId); }
  return profile;
}
async function assertApplicationOwner(applications, appId, studentId) {
  const app = await applications.getForStudent(appId, studentId);
  if (!app) throw new InputError('Application not found.', 404);
  return app;
}
function ownedChallenge(db, challengeId, companyId) {
  const challenge = db.prepare('SELECT * FROM challenges WHERE id=? AND company_id=?').get(challengeId, companyId);
  if (!challenge) throw new InputError('Challenge not found.', 404);
  return challenge;
}
async function ownedApplication(applications, applicationId, companyId) {
  const row = await applications.getForCompany(applicationId, companyId);
  if (!row) throw new InputError('Application not found.', 404);
  return row;
}
async function syncExpiredApplication(applications, application) {
  if (application.status !== 'SUBMITTED' && application.status !== 'EXPIRED' && Date.parse(application.individual_deadline) <= nowMs()) {
    await applications.markExpired(application.id, nowIso());
    application.status = 'EXPIRED';
  }
  return application;
}
async function requireApplicationSubmissionState(applications, applicationId, studentId) {
  const application = await syncExpiredApplication(applications, await assertApplicationOwner(applications, applicationId, studentId));
  if (application.status === 'EXPIRED' || Date.parse(application.individual_deadline) <= nowMs()) {
    if (application.status !== 'EXPIRED') await syncExpiredApplication(applications, application);
    throw new InputError('The individual task deadline has passed.', 409);
  }
  if (!['IN_PROGRESS', 'SUBMITTED'].includes(application.status)) {
    throw new InputError('Start your task before uploading or submitting work.', 409);
  }
  if (await applications.hasEvaluation(application.id)) {
    throw new InputError('This application has already been evaluated and can no longer be changed.', 400);
  }
  return application;
}
async function publicFileMetadata(applications, applicationId, fileId) {
  const file = await applications.getFile(applicationId, fileId);
  return file ? { id: file.id, name: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes, uploadedAt: file.created_at } : null;
}

export function expireAssessmentAttempts(db, currentTime = nowMs()) {
  const attempts = db.prepare(`SELECT a.id,a.started_at,s.duration_minutes AS durationMinutes
    FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id WHERE a.status='IN_PROGRESS' AND s.duration_minutes IS NOT NULL`).all();
  const expire = db.prepare("UPDATE skill_assessment_attempts SET status='EXPIRED',updated_at=? WHERE id=? AND status='IN_PROGRESS'");
  const timestamp = new Date(currentTime).toISOString();
  const markExpired = db.transaction(() => {
    let count = 0;
    for (const attempt of attempts) {
      if (Date.parse(attempt.started_at) + attempt.durationMinutes * 60000 <= currentTime) count += expire.run(timestamp, attempt.id).changes;
    }
    return count;
  });
  try { return markExpired(); } catch (error) {
    if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') return 0;
    throw error;
  }
}
function sendSubmissionFile(res, file) {
  if (!file || !/^[a-f0-9]{32}\.[a-z0-9]{1,8}$/.test(file.storage_key)) throw new InputError('Submission file not found.', 404);
  const path = resolve(uploadDir, file.storage_key);
  if (dirname(path) !== uploadDir) throw new InputError('Submission file not found.', 404);
  if (!existsSync(path)) throw new InputError('Submission file not found.', 404);
  res.type(file.mime_type).download(path, basename(file.original_name), { dotfiles: 'allow' }, error => {
    if (error && !res.headersSent) res.status(error.code === 'ENOENT' ? 404 : 500).json({ error: error.code === 'ENOENT' ? 'Submission file not found.' : 'The file could not be downloaded.' });
  });
}
function contentMatchesType(extension, buffer) {
  if (extension === '.pdf') return buffer.subarray(0, 5).toString('ascii') === '%PDF-';
  if (extension === '.png') return buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (extension === '.jpg' || extension === '.jpeg') return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (extension === '.zip') return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && [0x03, 0x05, 0x07].includes(buffer[2]) && [0x04, 0x06, 0x08].includes(buffer[3]);
  if (extension === '.txt') {
    let content;
    try { content = new TextDecoder('utf-8', { fatal: true }).decode(buffer); } catch { return false; }
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content);
  }
  return false;
}

function validateChallenge(input, current = null) {
  const roleTitle = requiredText(input.roleTitle ?? current?.role_title, 'Role or title', 150);
  const taskDescription = requiredText(input.taskDescription ?? current?.task_description, 'Task description', 12000);
  const skillInput = input.requiredSkills ?? current?.requiredSkills ?? [];
  const requiredSkills = parseSkills(skillInput);
  if (!requiredSkills.length) throw new InputError('Add at least one required skill.');
  const opensAt = toIsoDate(input.applicationOpensAt ?? current?.application_opens_at, 'Application opening date');
  const closesAt = toIsoDate(input.applicationClosesAt ?? current?.application_closes_at, 'Application closing date');
  if (Date.parse(closesAt) < Date.parse(opensAt)) throw new InputError('Application closing date must be after the opening date.');
  const duration = Number(input.individualTaskDurationDays ?? current?.individual_task_duration_days);
  if (!Number.isInteger(duration) || duration < 1 || duration > 365) throw new InputError('Individual task duration must be between 1 and 365 days.');
  const paidValue = input.isPaid ?? current?.is_paid ?? false;
  if (![true, false, 0, 1].includes(paidValue)) throw new InputError('Paid status must be true or false.');
  const candidate = input.candidateCount ?? current?.candidate_count ?? null;
  if (candidate != null && (!Number.isInteger(Number(candidate)) || Number(candidate) < 0)) throw new InputError('Candidate count must be a non-negative whole number.');
  return {
    roleTitle, taskDescription, requiredSkills,
    reference: optionalText(input.reference ?? current?.reference, 'Reference', 300),
    language: optionalText(input.language ?? current?.language, 'Language', 100),
    extraInformation: optionalText(input.extraInformation ?? current?.extra_information, 'Extra information', 5000),
    isPaid: paidValue === true || paidValue === 1 ? 1 : 0,
    compensationDetails: optionalText(input.compensationDetails ?? current?.compensation_details, 'Compensation details', 500),
    candidateCount: candidate == null || candidate === '' ? null : Number(candidate),
    applicationOpensAt: opensAt, applicationClosesAt: closesAt, individualTaskDurationDays: duration,
  };
}
function challengeSkills(db, challengeId) {
  return db.prepare('SELECT skill FROM challenge_skills WHERE challenge_id=? ORDER BY skill COLLATE NOCASE').all(challengeId).map(row => row.skill);
}
function challengeView(row) { // row comes from the challenges repository (already carries requiredSkills)
  return {
    id: row.id, companyId: row.company_id,
    ...(row.company_name == null ? {} : { companyName: row.company_name }),
    roleTitle: row.role_title, reference: row.reference,
    taskDescription: row.task_description, requiredSkills: row.requiredSkills, language: row.language,
    extraInformation: row.extra_information, isPaid: Boolean(row.is_paid), compensationDetails: row.compensation_details,
    candidateCount: row.candidate_count, applicationOpensAt: row.application_opens_at,
    applicationClosesAt: row.application_closes_at, individualTaskDurationDays: row.individual_task_duration_days,
    status: row.status, createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

export function createPlatformRouter({ db, student, challenges, applications, requireCompanyAuth }) {
  const router = express.Router();
  const studentAuth = requireStudent(student);
  const companyAuth = requireCompanyAuth;

  expireAssessmentAttempts(db);

  // Student accounts use their own table, session table, and cookie. Company users remain untouched.
  router.post('/student/auth/register', asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const password = req.body?.password;
    if (!validEmail(email)) throw new InputError('Enter a valid email address.');
    if (!validatePassword(password)) throw new InputError('Use at least 12 characters with uppercase, lowercase, a number and a special character.');
    const timestamp = nowIso(); const sentAt = nowMs(); const otp = newOtp();
    const id = newId();
    const passwordHash = await hashPassword(password);
    const created = await student.createAccount({ id, email, passwordHash, timestamp, otp: { hash: hashOtp(otp).toString('hex'), expiresAt: sentAt + studentOtpLifeMs, sentAt } });
    if (!created) throw new InputError('A student account already exists for this email.', 409);
    let emailDelivery = 'sent';
    try { await sendStudentOtpEmail({ to: email, otp }); } catch { emailDelivery = 'failed'; }
    res.status(201).json({ studentAccountId: id, email, emailVerified: false, emailDelivery });
  }));

  router.post('/student/auth/verify-email', asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const otp = req.body?.otp;
    if (!validEmail(email) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new InputError('Enter the account email and its six-digit verification code.');
    const record = await student.getVerifyRecord(email);
    if (!record || record.email_verified) throw new InputError('The verification code is unavailable or the email is already verified.', 409);
    if (record.expires_at <= nowMs()) throw new InputError('This code expired. Request another code.', 410);
    if (record.attempts >= 5) throw new InputError('Too many incorrect attempts. Request a new code.', 429);
    if (!otpMatches(otp, record.otp_hash)) {
      await student.bumpOtpAttempts(record.id, 5);
      throw new InputError('That verification code is incorrect.', 400);
    }
    await student.completeVerification(record.id, nowIso());
    res.json({ verified: true, email: record.email });
  }));

  router.post('/student/auth/resend-otp', studentOtpIpLimiter, asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const record = validEmail(email) ? await student.getResendRecord(email) : null;
    const response = { message: 'If the account is eligible, a verification code will be sent.' };
    if (record) {
      const current = nowMs(); const reset = current - record.resend_window_started_at >= 60 * 60 * 1000;
      const count = reset ? 1 : record.resend_count + 1;
      if (current - record.last_sent_at >= 60 * 1000 && count <= 5) {
        const otp = newOtp();
        await student.replaceOtp(record.id, { hash: hashOtp(otp).toString('hex'), expiresAt: current + studentOtpLifeMs, count, windowStart: reset ? current : record.resend_window_started_at, sentAt: current });
        try { await sendStudentOtpEmail({ to: record.email, otp }); } catch { console.warn('Student email verification delivery failed.'); }
      }
    }
    res.json(response);
  }));

  router.post('/student/auth/login', asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const wait = failedLoginLimiter.blockedFor(req, email);
    if (wait) return sendTooMany(res, wait, loginBlockedMessage);
    const user = await student.findLoginUser(email);
    const valid = Boolean(user && user.account_status === 'ACTIVE' && user.email_verified === 1 && password && await verifyPassword(user.password_hash, password).catch(error => {
      console.warn(`Student login: password verification threw (${error?.code || error?.name || 'Error'}).`);
      return false;
    }));
    if (!valid) { failedLoginLimiter.fail(req, email); throw new InputError('The email or password is incorrect.', 401); }
    failedLoginLimiter.reset(req, email);
    const token = newSecret(32); const expires = nowMs() + studentSessionLifeMs;
    await student.createSession({ tokenHash: sha256(token), userId: user.id, expiresAt: expires, createdAt: nowIso() });
    res.setHeader('Set-Cookie', `${studentCookie}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${studentSessionLifeMs / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ authenticated: true, email: user.email, expiresAt: new Date(expires).toISOString() });
  }));
  router.get('/student/auth/session', studentAuth, (req, res) => res.json({ authenticated: true, email: req.student.email, profileCreated: Boolean(req.student.student_id) }));
  router.post('/student/auth/logout', asyncRoute(async (req, res) => {
    const token = parseCookie(req, studentCookie);
    if (token) await student.deleteSession(sha256(token));
    res.setHeader('Set-Cookie', `${studentCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ loggedOut: true });
  }));

  const pwRule = 'Use at least 12 characters with uppercase, lowercase, a number and a special character.';
  router.post('/student/auth/change-password', studentAuth, asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !currentPassword) throw new InputError('Enter your current password.');
    if (!validatePassword(newPassword)) throw new InputError(pwRule);
    const wait = failedLoginLimiter.blockedFor(req, req.student.email);
    if (wait) return sendTooMany(res, wait, loginBlockedMessage);
    const currentHash = await student.getPasswordHash(req.student.account_id);
    if (!await verifyPassword(currentHash, currentPassword).catch(() => false)) {
      failedLoginLimiter.fail(req, req.student.email);
      throw new InputError('Your current password is incorrect.', 400);
    }
    failedLoginLimiter.reset(req, req.student.email);
    const hash = await hashPassword(newPassword); const timestamp = nowIso();
    await student.changePassword(req.student.account_id, hash, timestamp, req.student.token_hash);
    res.json({ changed: true });
  }));
  router.post('/student/auth/logout-all', studentAuth, asyncRoute(async (req, res) => {
    await student.deleteAllSessions(req.student.account_id);
    res.setHeader('Set-Cookie', `${studentCookie}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    res.json({ loggedOut: true });
  }));
  router.post('/student/auth/forgot-password', studentForgotIpLimiter, asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const user = validEmail(email) ? await student.findResetUser(email) : null;
    if (user) {
      const current = nowMs();
      const last = await student.getOtpLastSent(user.id);
      if (!last || current - last.last_sent_at >= 60 * 1000) {
        const otp = newOtp();
        await student.upsertResetOtp(user.id, { hash: hashOtp(otp).toString('hex'), expiresAt: current + studentOtpLifeMs, now: current });
        try { await sendStudentPasswordResetEmail({ to: user.email, otp }); } catch { console.warn('Student password reset delivery failed.'); }
      }
    }
    res.json({ message: 'If an active account exists for this email, a reset code has been sent.' });
  }));
  router.post('/student/auth/reset-password', asyncRoute(async (req, res) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
    const { otp, newPassword } = req.body || {};
    if (!validEmail(email) || typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new InputError('Enter your account email and the six-digit reset code.');
    if (!validatePassword(newPassword)) throw new InputError(pwRule);
    const record = await student.getResetRecord(email);
    if (!record) throw new InputError('That reset code is invalid or has expired. Request a new one.', 400);
    if (record.expires_at <= nowMs()) throw new InputError('That reset code is invalid or has expired. Request a new one.', 410);
    if (record.attempts >= 5) throw new InputError('Too many incorrect attempts. Request a new code.', 429);
    if (!otpMatches(otp, record.otp_hash)) {
      await student.bumpOtpAttempts(record.id, 5);
      throw new InputError('That reset code is incorrect.', 400);
    }
    const hash = await hashPassword(newPassword); const timestamp = nowIso();
    await student.resetPassword(record.id, hash, timestamp);
    res.json({ reset: true });
  }));

  router.get('/student/profile', studentAuth, asyncRoute(async (req, res) => {
    const profile = req.student.student_id ? await student.buildStudentProfile(req.student.student_id, { privateFields: true }) : null;
    res.json({ profile });
  }));
  router.put('/student/profile', studentAuth, asyncRoute(async (req, res) => {
    const body = req.body || {};
    const fullName = requiredText(body.fullName, 'Full name', 150);
    const graduationYear = body.graduationYear == null || body.graduationYear === '' ? null : Number(body.graduationYear);
    if (graduationYear != null && (!Number.isInteger(graduationYear) || graduationYear < 1950 || graduationYear > 2200)) throw new InputError('Graduation year must be between 1950 and 2200.');
    const skills = parseSkills(body.skills);
    if (body.profileVisible != null && typeof body.profileVisible !== 'boolean') throw new InputError('Profile visibility must be true or false.');
    const timestamp = nowIso();
    const values = {
      profileVisible: body.profileVisible == null ? null : body.profileVisible ? 1 : 0,
      fullName, profileImage: optionalUrl(body.profileImage, 'Profile image'), college: optionalText(body.college, 'College or university', 200),
      degree: optionalText(body.degree, 'Degree or course', 160), graduationYear,
      about: optionalText(body.about, 'About', 3000), resumeReference: optionalUrl(body.resumeReference, 'Resume URL'),
      githubUrl: optionalUrl(body.githubUrl, 'GitHub URL'), linkedinUrl: optionalUrl(body.linkedinUrl, 'LinkedIn URL'),
      portfolioUrl: optionalUrl(body.portfolioUrl, 'Portfolio URL'), location: optionalText(body.location, 'Location', 160),
    };
    const id = await student.saveProfile({ studentId: req.student.student_id, accountId: req.student.account_id, newStudentId: newId(), newSkillId: newId, values, skills, timestamp });
    res.json({ profile: await student.buildStudentProfile(id, { privateFields: true }) });
  }));
  router.post('/student/projects', studentAuth, asyncRoute(async (req, res) => {
    if (!req.student.student_id) throw new InputError('Create your student profile before adding projects.', 409);
    const title = requiredText(req.body?.title, 'Project title', 150);
    const description = optionalText(req.body?.description, 'Project description', 3000);
    const projectUrl = optionalUrl(req.body?.projectUrl, 'Project URL');
    const id = newId(); const timestamp = nowIso();
    res.status(201).json({ project: await student.createProject({ id, studentId: req.student.student_id, title, description, projectUrl, timestamp }) });
  }));
  router.put('/student/projects/:id', studentAuth, asyncRoute(async (req, res) => {
    if (!req.student.student_id) throw new InputError('Create your student profile before adding projects.', 409);
    if (!await student.projectOwned(req.params.id, req.student.student_id)) throw new InputError('Project not found.', 404);
    const title = requiredText(req.body?.title, 'Project title', 150);
    const project = await student.updateProject({ id: req.params.id, studentId: req.student.student_id, title,
      description: optionalText(req.body?.description, 'Project description', 3000), projectUrl: optionalUrl(req.body?.projectUrl, 'Project URL'), timestamp: nowIso() });
    res.json({ project });
  }));
  router.delete('/student/projects/:id', studentAuth, asyncRoute(async (req, res) => {
    if (!req.student.student_id) throw new InputError('Create your student profile before adding projects.', 409);
    if (!await student.deleteProject(req.params.id, req.student.student_id)) throw new InputError('Project not found.', 404);
    res.json({ deleted: true });
  }));
  router.get('/students/:id', studentAuth, asyncRoute(async (req, res) => {
    if (req.student.student_id !== req.params.id) throw new InputError('You may view only your own student profile.', 403);
    const profile = await student.buildStudentProfile(req.params.id, { privateFields: true });
    if (!profile) throw new InputError('Student profile not found.', 404);
    res.json({ profile });
  }));

  // Students can see published challenges and apply only during the public window.
  router.get('/challenges', asyncRoute(async (req, res) => {
    const skills = typeof req.query.skills === 'string' ? req.query.skills.split(',').map(value => text(value, 60)).filter(Boolean).slice(0, 20) : [];
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 100, 1), 100);
    const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
    const rows = await challenges.listPublicOpen({ skills, now: nowIso(), limit, offset });
    res.json({ challenges: rows.map(challengeView) });
  }));
  router.get('/challenges/:id', asyncRoute(async (req, res) => {
    const row = await challenges.getPublic(req.params.id);
    if (!row) throw new InputError('Challenge not found.', 404);
    res.json({ challenge: challengeView(row) });
  }));
  router.post('/student/challenges/:id/applications', studentAuth, asyncRoute(async (req, res) => {
    if (!req.student.student_id) throw new InputError('Complete your student profile before applying.', 409);
    const result = await applications.apply({ id: newId(), challengeId: req.params.id, studentId: req.student.student_id, now: nowMs() });
    if (result.status === 'NOT_AVAILABLE') throw new InputError('Challenge is not available for applications.', 404);
    if (result.status === 'WINDOW_CLOSED') throw new InputError('Applications are outside this challenge’s application window.', 409);
    if (result.status === 'DUPLICATE') throw new InputError('You already applied to this challenge.', 409);
    res.status(201).json({ application: result.application });
  }));
  router.post('/student/applications/:id/start', studentAuth, asyncRoute(async (req, res) => {
    const application = await syncExpiredApplication(applications, await assertApplicationOwner(applications, req.params.id, req.student.student_id));
    if (!assertApplicationDeadline(application)) {
      await syncExpiredApplication(applications, application);
      throw new InputError('The individual task deadline has passed.', 409);
    }
    if (application.status === 'SUBMITTED') throw new InputError('This application has already been submitted.', 409);
    if (application.status === 'EXPIRED') throw new InputError('The individual task deadline has passed.', 409);
    if (application.status === 'APPLIED') await applications.markInProgress(application.id, nowIso());
    res.json({ application: { id: application.id, status: 'IN_PROGRESS', individualDeadline: application.individual_deadline } });
  }));
  router.get('/student/applications', studentAuth, asyncRoute(async (req, res) => {
    res.json({ applications: await applications.listForStudent(req.student.student_id, nowMs(), nowIso()) });
  }));

  // Company-owned challenge management.
  router.post('/company/challenges', companyAuth, asyncRoute(async (req, res) => {
    const challenge = validateChallenge(req.body || {});
    const created = await challenges.create(challenge, newId(), req.session.company_id, nowIso());
    res.status(201).json({ challenge: challengeView(created) });
  }));
  router.get('/company/challenges', companyAuth, asyncRoute(async (req, res) => {
    const rows = await challenges.listForCompany(req.session.company_id);
    res.json({ challenges: rows.map(row => ({ ...challengeView(row), applicationCount: row.applicationCount })) });
  }));
  router.put('/company/challenges/:id', companyAuth, asyncRoute(async (req, res) => {
    const existing = await challengeOwnedByCompany(challenges, req.params.id, req.session.company_id);
    if (existing.status !== 'DRAFT') throw new InputError('Only draft challenges can be edited.', 409);
    const challenge = validateChallenge(req.body || {}, existing);
    const updated = await challenges.updateIfDraft(existing.id, req.session.company_id, challenge, nowIso());
    if (!updated) throw new InputError('Only draft challenges can be edited.', 409); // published/closed between the check and the write
    res.json({ challenge: challengeView(updated) });
  }));
  router.post('/company/challenges/:id/publish', companyAuth, asyncRoute(async (req, res) => {
    const challenge = await challengeOwnedByCompany(challenges, req.params.id, req.session.company_id);
    if (challenge.status === 'CLOSED') throw new InputError('A closed challenge cannot be published again.', 409);
    if (!challenge.requiredSkills.length) throw new InputError('Add at least one required skill before publishing.');
    if (Date.parse(challenge.application_closes_at) < nowMs()) throw new InputError('The application window has already closed.');
    res.json({ challenge: challengeView(await challenges.publish(challenge.id, req.session.company_id, nowIso())) });
  }));
  router.post('/company/challenges/:id/close', companyAuth, asyncRoute(async (req, res) => {
    const challenge = await challengeOwnedByCompany(challenges, req.params.id, req.session.company_id);
    await challenges.close(challenge.id, req.session.company_id, nowIso());
    res.json({ closed: true });
  }));

  // Company applicant, submission, and evaluation views always join through owned challenges.
  router.get('/company/challenges/:id/applications', companyAuth, asyncRoute(async (req, res) => {
    const challenge = await challengeOwnedByCompany(challenges, req.params.id, req.session.company_id);
    res.json({ applications: await applications.listForChallenge(challenge.id, nowMs(), nowIso()) });
  }));
  router.get('/company/applications/:id', companyAuth, asyncRoute(async (req, res) => {
    const application = await syncExpiredApplication(applications, await ownedApplication(applications, req.params.id, req.session.company_id));
    const profile = await student.buildStudentProfile(application.student_id, { includeResume: true });
    const submission = await applications.getSubmission(application.id, { submittedOnly: true });
    if (submission?.fileReference) submission.file = await applications.getFile(application.id, submission.fileReference) ? { id: submission.fileReference } : null;
    const evaluation = await applications.getEvaluation(application.id);
    res.json({ application: { id: application.id, challengeId: application.challenge_id, appliedAt: application.applied_at, individualDeadline: application.individual_deadline, status: application.status, student: profile, submission, evaluation } });
  }));
  // Full profile + contact email, only for students who applied to one of this company's challenges.
  router.get('/company/applications/:id/student', companyAuth, asyncRoute(async (req, res) => {
    const application = await ownedApplication(applications, req.params.id, req.session.company_id);
    const profile = await student.buildStudentProfile(application.student_id, { includeResume: true });
    if (!profile) throw new InputError('Application not found.', 404);
    profile.contactEmail = await applications.studentContactEmail(application.student_id);
    res.json({ student: profile });
  }));
  router.get('/company/applications/:id/file', companyAuth, asyncRoute(async (req, res) => {
    const application = await ownedApplication(applications, req.params.id, req.session.company_id);
    sendSubmissionFile(res, await applications.getSubmissionFile(application.id, { submittedOnly: true }));
  }));
  router.get('/student/applications/:id/file', studentAuth, asyncRoute(async (req, res) => {
    await assertApplicationOwner(applications, req.params.id, req.student.student_id);
    sendSubmissionFile(res, await applications.getSubmissionFile(req.params.id));
  }));
  router.put('/student/applications/:id/file', studentAuth, express.raw({
    type: ['application/octet-stream', ...[...publicFileTypes.values()].flatMap(types => [...types])], limit: '10mb',
  }), asyncRoute(async (req, res) => {
    const application = await requireApplicationSubmissionState(applications, req.params.id, req.student.student_id);
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) throw new InputError('Upload a non-empty file.');
    const fileNameHeader = req.get('x-file-name');
    if (!fileNameHeader || fileNameHeader.length > 180) throw new InputError('Provide a file name of 180 characters or fewer in X-File-Name.');
    const originalName = basename(fileNameHeader.replace(/\\/g, '/')).replace(/[\r\n\0]/g, '').slice(0, 180);
    const extension = extname(originalName).toLowerCase();
    const allowedMime = publicFileTypes.get(extension);
    const mimeType = String(req.get('x-file-mime') || req.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!allowedMime || !allowedMime.has(mimeType) || !contentMatchesType(extension, req.body)) throw new InputError('File extension, MIME type, or file contents are not supported or do not match. Supported files: PDF, TXT, ZIP, PNG, JPG.');
    const storageKey = `${randomBytes(16).toString('hex')}${extension}`;
    await mkdir(uploadDir, { recursive: true });
    const filePath = resolve(uploadDir, storageKey);
    await writeFile(filePath, req.body, { flag: 'wx', mode: 0o600 });
    const id = newId(); const timestamp = nowIso();
    let saved;
    try {
      saved = await applications.saveFile({ fileId: id, submissionId: newId(), applicationId: application.id, studentId: req.student.student_id,
        storageKey, originalName, mimeType, sizeBytes: req.body.length, now: nowMs(), ts: timestamp });
      if (!saved.ok) throw new InputError('Start your task before uploading work, or check its individual deadline.', 409);
    } catch (error) {
      await unlink(filePath).catch(() => {});
      throw error;
    }
    // Replacing a file removed every older metadata row; unlink their disk files now that the change is committed.
    for (const old of saved.replaced) await unlink(resolve(uploadDir, old.storage_key)).catch(() => {});
    res.status(201).json({ file: { id, name: originalName, mimeType, sizeBytes: req.body.length } });
  }));
  router.put('/student/applications/:id/draft', studentAuth, asyncRoute(async (req, res) => {
    const application = await requireApplicationSubmissionState(applications, req.params.id, req.student.student_id);
    const body = req.body || {};
    const githubUrl = optionalUrl(body.githubUrl, 'GitHub repository URL');
    const deployedUrl = optionalUrl(body.deployedUrl, 'Deployed website URL');
    const supportingInformation = optionalText(body.supportingInformation, 'Supporting information', 5000);
    const timestamp = nowIso();
    if (!await applications.saveDraft({ id: newId(), applicationId: application.id, githubUrl, deployedUrl, supportingInformation, ts: timestamp })) {
      throw new InputError('This task has already been submitted; drafts are no longer saved.', 409);
    }
    res.json({ draft: { savedAt: timestamp } });
  }));
  router.put('/student/applications/:id/submission', studentAuth, asyncRoute(async (req, res) => {
    const application = await requireApplicationSubmissionState(applications, req.params.id, req.student.student_id);
    const body = req.body || {};
    const githubUrl = optionalUrl(body.githubUrl, 'GitHub repository URL');
    const deployedUrl = optionalUrl(body.deployedUrl, 'Deployed website URL');
    const supportingInformation = optionalText(body.supportingInformation, 'Supporting information', 5000);
    const fileReference = optionalText(body.fileReference, 'File reference', 40);
    if (!githubUrl && !deployedUrl && !supportingInformation && !fileReference) throw new InputError('Add a repository, deployed website, uploaded file, or supporting information.');
    if (fileReference && !await applications.getFile(application.id, fileReference)) throw new InputError('Uploaded file not found for this application.', 400);
    const timestamp = nowIso();
    if (!await applications.saveSubmission({ id: newId(), applicationId: application.id, studentId: req.student.student_id, githubUrl, deployedUrl,
      fileReference, supportingInformation, now: nowMs(), ts: timestamp })) throw new InputError('Start your task before submitting work, or check its individual deadline.', 409);
    res.json({ submission: await applications.getSubmission(application.id) });
  }));
  router.get('/student/applications/:id/submission', studentAuth, asyncRoute(async (req, res) => {
    await assertApplicationOwner(applications, req.params.id, req.student.student_id);
    const submission = await applications.getSubmission(req.params.id);
    if (submission?.fileReference) submission.file = await publicFileMetadata(applications, req.params.id, submission.fileReference);
    res.json({ submission });
  }));
  router.get('/company/applications/:id/submission', companyAuth, asyncRoute(async (req, res) => {
    const app = await ownedApplication(applications, req.params.id, req.session.company_id);
    const submission = await applications.getSubmission(app.id, { submittedOnly: true });
    if (submission?.fileReference) submission.file = await publicFileMetadata(applications, app.id, submission.fileReference);
    res.json({ submission });
  }));
  router.put('/company/applications/:id/evaluation', companyAuth, asyncRoute(async (req, res) => {
    const application = await ownedApplication(applications, req.params.id, req.session.company_id);
    if (application.status !== 'SUBMITTED' || !await applications.hasSubmitted(application.id)) throw new InputError('Only a submitted application can be evaluated.');
    const body = req.body || {};
    const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new InputError('Rating must be a whole number from 1 to 5.');
    const feedback = optionalText(body.feedback, 'Feedback', 5000);
    const shortlisted = body.isShortlisted ?? false;
    if (![true, false, 0, 1].includes(shortlisted)) throw new InputError('Shortlist status must be true or false.');
    const evaluation = await applications.saveEvaluation({ id: newId(), applicationId: application.id, rating, feedback,
      isShortlisted: shortlisted === true || shortlisted === 1, evaluatedBy: req.session.account_id, ts: nowIso() });
    res.json({ evaluation });
  }));

  // Company-authored MCQ assessments keep answer keys on the server. Student serializers
  // below select only prompt/options and never include correct_answer.
  router.post('/company/assessments', companyAuth, (req, res) => {
    const title = requiredText(req.body?.title, 'Assessment title', 150);
    const relatedSkill = requiredText(req.body?.relatedSkill, 'Related skill', 80);
    const duration = req.body?.durationMinutes == null || req.body.durationMinutes === '' ? null : Number(req.body.durationMinutes);
    if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) throw new InputError('Duration must be between 1 and 1440 minutes.');
    const description = optionalText(req.body?.description, 'Description', 3000);
    const instructions = optionalText(req.body?.instructions, 'Instructions', 3000);
    const id = newId(); const timestamp = nowIso();
    db.prepare(`INSERT INTO skill_assessments(id,company_id,title,description,related_skill,instructions,duration_minutes,status,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,'DRAFT',?,?)`).run(id, req.session.company_id, title, description, relatedSkill, instructions, duration, timestamp, timestamp);
    res.status(201).json({ assessment: companyAssessment(db, id) });
  });
  router.get('/company/assessments', companyAuth, (req, res) => {
    const rows = db.prepare('SELECT id FROM skill_assessments WHERE company_id=? ORDER BY created_at DESC').all(req.session.company_id);
    res.json({ assessments: rows.map(row => companyAssessment(db, row.id)) });
  });
  router.put('/company/assessments/:id', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Only draft assessments can be edited.', 400);
    const title = requiredText(req.body?.title ?? assessment.title, 'Assessment title', 150);
    const relatedSkill = requiredText(req.body?.relatedSkill ?? assessment.related_skill, 'Related skill', 80);
    const duration = req.body?.durationMinutes === undefined ? assessment.duration_minutes : req.body.durationMinutes === null || req.body.durationMinutes === '' ? null : Number(req.body.durationMinutes);
    if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) throw new InputError('Duration must be between 1 and 1440 minutes.');
    db.prepare(`UPDATE skill_assessments SET title=?,description=?,related_skill=?,instructions=?,duration_minutes=?,updated_at=? WHERE id=? AND company_id=?`)
      .run(title, optionalText(req.body?.description ?? assessment.description, 'Description', 3000), relatedSkill,
        optionalText(req.body?.instructions ?? assessment.instructions, 'Instructions', 3000), duration, nowIso(), assessment.id, req.session.company_id);
    res.json({ assessment: companyAssessment(db, assessment.id) });
  });
  router.post('/company/assessments/:id/questions', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Questions can be edited while the assessment is a draft.', 409);
    const questionText = requiredText(req.body?.questionText, 'Question', 3000);
    const options = ['A', 'B', 'C', 'D'].map(key => requiredText(req.body?.[`option${key}`], `Option ${key}`, 1000));
    const correctAnswer = typeof req.body?.correctAnswer === 'string' ? req.body.correctAnswer.toUpperCase() : '';
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) throw new InputError('Correct answer must be A, B, C, or D.');
    const questionOrder = req.body?.questionOrder == null ? (db.prepare('SELECT COALESCE(MAX(question_order),0)+1 AS next FROM skill_assessment_questions WHERE assessment_id=?').get(assessment.id).next) : Number(req.body.questionOrder);
    if (!Number.isInteger(questionOrder) || questionOrder < 1 || questionOrder > 500) throw new InputError('Question order must be between 1 and 500.');
    const id = newId(); const timestamp = nowIso();
    try {
      db.prepare(`INSERT INTO skill_assessment_questions(id,assessment_id,question_text,option_a,option_b,option_c,option_d,correct_answer,question_order,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, assessment.id, questionText, ...options, correctAnswer, questionOrder, timestamp, timestamp);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new InputError('A question already uses that order number.', 409);
      throw error;
    }
    res.status(201).json({ question: companyQuestion(db, id) });
  });
  router.put('/company/assessments/:id/questions/:questionId', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Questions can be edited while the assessment is a draft.', 409);
    const existing = db.prepare('SELECT * FROM skill_assessment_questions WHERE id=? AND assessment_id=?').get(req.params.questionId, assessment.id);
    if (!existing) throw new InputError('Question not found.', 404);
    const questionText = requiredText(req.body?.questionText ?? existing.question_text, 'Question', 3000);
    const options = ['A', 'B', 'C', 'D'].map(key => requiredText(req.body?.[`option${key}`] ?? existing[`option_${key.toLowerCase()}`], `Option ${key}`, 1000));
    const correctAnswer = String(req.body?.correctAnswer ?? existing.correct_answer).toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) throw new InputError('Correct answer must be A, B, C, or D.');
    const order = req.body?.questionOrder == null ? existing.question_order : Number(req.body.questionOrder);
    if (!Number.isInteger(order) || order < 1 || order > 500) throw new InputError('Question order must be between 1 and 500.');
    try {
      db.prepare(`UPDATE skill_assessment_questions SET question_text=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_answer=?,question_order=?,updated_at=?
        WHERE id=? AND assessment_id=?`).run(questionText, ...options, correctAnswer, order, nowIso(), existing.id, assessment.id);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new InputError('A question already uses that order number.', 409);
      throw error;
    }
    res.json({ question: companyQuestion(db, existing.id) });
  });
  router.delete('/company/assessments/:id/questions/:questionId', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Questions can be edited while the assessment is a draft.', 409);
    const removed = db.prepare('DELETE FROM skill_assessment_questions WHERE id=? AND assessment_id=?').run(req.params.questionId, assessment.id);
    if (!removed.changes) throw new InputError('Question not found.', 404);
    res.json({ deleted: true });
  });
  router.post('/company/assessments/:id/publish', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    if (assessment.status === 'CLOSED') throw new InputError('A closed assessment cannot be published again.', 409);
    if (!db.prepare('SELECT 1 FROM skill_assessment_questions WHERE assessment_id=? LIMIT 1').get(assessment.id)) throw new InputError('Add at least one question before publishing.');
    db.prepare("UPDATE skill_assessments SET status='PUBLISHED',updated_at=? WHERE id=?").run(nowIso(), assessment.id);
    res.json({ assessment: companyAssessment(db, assessment.id) });
  });
  router.post('/company/assessments/:id/close', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    db.prepare("UPDATE skill_assessments SET status='CLOSED',updated_at=? WHERE id=?").run(nowIso(), assessment.id);
    res.json({ closed: true });
  });
  router.get('/student/assessments', studentAuth, (req, res) => {
    const assessments = db.prepare("SELECT id,title,description,related_skill AS relatedSkill,instructions,duration_minutes AS durationMinutes FROM skill_assessments WHERE status='PUBLISHED' ORDER BY created_at DESC LIMIT 100").all();
    res.json({ assessments });
  });
  router.get('/student/assessments/:id', studentAuth, (req, res) => {
    const assessment = db.prepare(`SELECT id,title,description,related_skill AS relatedSkill,instructions,duration_minutes AS durationMinutes,status
      FROM skill_assessments WHERE id=? AND (status='PUBLISHED' OR EXISTS (
        SELECT 1 FROM skill_assessment_attempts a WHERE a.assessment_id=skill_assessments.id AND a.student_id=?
      ))`).get(req.params.id, req.student.student_id);
    if (!assessment) throw new InputError('Assessment not found.', 404);
    res.json({ assessment });
  });
  router.post('/student/assessments/:id/attempts', studentAuth, (req, res) => {
    if (!req.student.student_id) throw new InputError('Complete your student profile before starting an assessment.', 409);
    const assessment = db.prepare("SELECT id FROM skill_assessments WHERE id=? AND status='PUBLISHED'").get(req.params.id);
    if (!assessment) throw new InputError('Assessment is not available.', 404);
    const id = newId(); const timestamp = nowIso();
    try {
      db.prepare(`INSERT INTO skill_assessment_attempts(id,assessment_id,student_id,started_at,status,review_status,created_at,updated_at)
        VALUES (?,?,?,?,'IN_PROGRESS','PENDING',?,?)`).run(id, assessment.id, req.student.student_id, timestamp, timestamp, timestamp);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new InputError('You already have an attempt for this assessment.', 409);
      throw error;
    }
    res.status(201).json({ attempt: studentAttempt(db, id) });
  });
  router.get('/student/assessment-attempts', studentAuth, (req, res) => {
    expireAssessmentAttempts(db);
    if (!req.student.student_id) return res.json({ attempts: [] });
    const rows = db.prepare('SELECT id FROM skill_assessment_attempts WHERE student_id=? ORDER BY started_at DESC').all(req.student.student_id);
    res.json({ attempts: rows.map(row => studentAttempt(db, row.id)) });
  });
  router.get('/student/assessment-attempts/:id', studentAuth, (req, res) => {
    expireAssessmentAttempts(db);
    const attempt = db.prepare('SELECT id FROM skill_assessment_attempts WHERE id=? AND student_id=?').get(req.params.id, req.student.student_id);
    if (!attempt) throw new InputError('Assessment attempt not found.', 404);
    res.json({ attempt: studentAttempt(db, attempt.id) });
  });
  router.put('/student/assessment-attempts/:id/answers', studentAuth, (req, res) => {
    const attempt = db.prepare(`SELECT a.*,s.duration_minutes FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id
      WHERE a.id=? AND a.student_id=?`).get(req.params.id, req.student.student_id);
    if (!attempt) throw new InputError('Assessment attempt not found.', 404);
    expireAssessmentAttempts(db);
    const refreshed = db.prepare('SELECT status FROM skill_assessment_attempts WHERE id=? AND student_id=?').get(attempt.id, req.student.student_id);
    if (!refreshed) throw new InputError('Assessment attempt not found.', 404);
    if (refreshed.status !== 'IN_PROGRESS') throw new InputError(refreshed.status === 'EXPIRED' ? 'The assessment time limit has passed.' : 'This assessment attempt has already been submitted.', 409);
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length > 500) throw new InputError('Answers must be a list of up to 500 responses.');
    const questionIds = new Set(db.prepare('SELECT id FROM skill_assessment_questions WHERE assessment_id=?').all(attempt.assessment_id).map(row => row.id));
    const normalized = answers.map(answer => {
      const questionId = text(answer?.questionId, 80);
      const selectedOption = typeof answer?.selectedOption === 'string' ? answer.selectedOption.toUpperCase() : '';
      if (!questionIds.has(questionId) || !['A', 'B', 'C', 'D'].includes(selectedOption)) throw new InputError('Each response must select A, B, C, or D for a question in this assessment.');
      return { questionId, selectedOption };
    });
    if (new Set(normalized.map(answer => answer.questionId)).size !== normalized.length) throw new InputError('Each question can be answered only once.');
    const timestamp = nowIso();
    const save = db.transaction(() => {
      const current = db.prepare(`SELECT a.status,a.started_at,s.duration_minutes AS durationMinutes FROM skill_assessment_attempts a
        JOIN skill_assessments s ON s.id=a.assessment_id WHERE a.id=? AND a.student_id=?`).get(attempt.id, req.student.student_id);
      if (!current || current.status !== 'IN_PROGRESS') return current?.status || 'MISSING';
      if (current.durationMinutes && Date.parse(current.started_at) + current.durationMinutes * 60000 <= nowMs()) {
        db.prepare("UPDATE skill_assessment_attempts SET status='EXPIRED',updated_at=? WHERE id=? AND status='IN_PROGRESS'").run(nowIso(), attempt.id);
        return 'EXPIRED';
      }
      db.prepare('DELETE FROM skill_assessment_answers WHERE attempt_id=?').run(attempt.id);
      const add = db.prepare('INSERT INTO skill_assessment_answers(id,attempt_id,question_id,selected_option,created_at,updated_at) VALUES (?,?,?,?,?,?)');
      for (const answer of normalized) add.run(newId(), attempt.id, answer.questionId, answer.selectedOption, timestamp, timestamp);
      if (req.body?.finalize === false) {
        db.prepare("UPDATE skill_assessment_attempts SET updated_at=? WHERE id=? AND status='IN_PROGRESS'").run(timestamp, attempt.id);
        return 'IN_PROGRESS';
      }
      db.prepare("UPDATE skill_assessment_attempts SET submitted_at=?,status='SUBMITTED',updated_at=? WHERE id=? AND status='IN_PROGRESS'").run(timestamp, timestamp, attempt.id);
      return 'SUBMITTED';
    });
    const state = save();
    if (state === 'EXPIRED') throw new InputError('The assessment time limit has passed.', 409);
    if (state !== (req.body?.finalize === false ? 'IN_PROGRESS' : 'SUBMITTED')) throw new InputError('This assessment attempt is no longer editable.', 409);
    res.json({ attempt: studentAttempt(db, attempt.id) });
  });
  router.get('/company/assessments/:id/attempts', companyAuth, (req, res) => {
    const assessment = ownedAssessment(db, req.params.id, req.session.company_id);
    const attempts = db.prepare(`SELECT a.id,a.student_id AS studentId,a.started_at AS startedAt,a.submitted_at AS submittedAt,a.status,a.review_status AS reviewStatus,
      a.manual_score AS manualScore,a.company_feedback AS companyFeedback,a.reviewed_at AS reviewedAt,s.full_name AS fullName,s.college
      FROM skill_assessment_attempts a JOIN students s ON s.id=a.student_id WHERE a.assessment_id=? ORDER BY a.started_at DESC`).all(assessment.id);
    res.json({ attempts });
  });
  router.get('/company/assessment-attempts/:id', companyAuth, (req, res) => {
    const attempt = ownedAttempt(db, req.params.id, req.session.company_id);
    res.json({ attempt: companyAttempt(db, attempt.id) });
  });
  router.put('/company/assessment-attempts/:id/evaluation', companyAuth, (req, res) => {
    const attempt = ownedAttempt(db, req.params.id, req.session.company_id);
    if (!attempt.submitted_at) throw new InputError('Submit an assessment attempt before reviewing it.', 409);
    const score = req.body?.manualScore == null || req.body.manualScore === '' ? null : Number(req.body.manualScore);
    if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new InputError('Manual score must be between 0 and 100.');
    const feedback = optionalText(req.body?.companyFeedback, 'Company feedback', 5000);
    const timestamp = nowIso();
    db.prepare("UPDATE skill_assessment_attempts SET manual_score=?,company_feedback=?,review_status='REVIEWED',status='REVIEWED',reviewed_at=?,updated_at=? WHERE id=?")
      .run(score, feedback, timestamp, timestamp, attempt.id);
    res.json({ attempt: companyAttempt(db, attempt.id) });
  });

  // Company talent discovery uses indexed stored skills and returns the transparent overlap.
  // Hidden profiles (profile_visible=0) are only visible to companies whose challenges the student applied to.
  const VISIBLE_TO_COMPANY = `(s.profile_visible=1 OR EXISTS (SELECT 1 FROM applications a JOIN challenges c ON c.id=a.challenge_id WHERE a.student_id=s.id AND c.company_id=?))`;
  router.get('/company/talent', companyAuth, (req, res) => {
    const requestedSkills = [...new Map((typeof req.query.skills === 'string' ? req.query.skills.split(',').map(value => text(value, 60)).filter(Boolean).slice(0, 20) : []).map(skill => [skill.toLowerCase(), skill])).values()];
    const college = typeof req.query.college === 'string' ? text(req.query.college, 200) : '';
    const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 24, 1), 50);
    const offset = Math.max(Math.trunc(Number(req.query.offset)) || 0, 0);
    const companyId = req.session.company_id;
    const clauses = [VISIBLE_TO_COMPANY];
    const params = [companyId];
    if (college) { clauses.push('s.college LIKE ? ESCAPE \'\\\' COLLATE NOCASE'); params.push(`%${college.replace(/[\\%_]/g, '\\$&')}%`); }
    const marks = requestedSkills.map(() => '?').join(',');
    if (requestedSkills.length) {
      clauses.push(`EXISTS (SELECT 1 FROM student_skills ss WHERE ss.student_id=s.id AND ss.skill COLLATE NOCASE IN (${marks}))`);
      params.push(...requestedSkills);
    }
    const where = clauses.join(' AND ');
    const total = db.prepare(`SELECT COUNT(*) AS n FROM students s WHERE ${where}`).get(...params).n;
    const matchExpr = requestedSkills.length ? `(SELECT COUNT(DISTINCT lower(ss.skill)) FROM student_skills ss WHERE ss.student_id=s.id AND ss.skill COLLATE NOCASE IN (${marks}))` : '0';
    // Sort by match count first, then paginate, so LIMIT/OFFSET apply to the ranked list.
    const rows = db.prepare(`SELECT s.id, ${matchExpr} AS matchCount FROM students s WHERE ${where} ORDER BY matchCount DESC, s.updated_at DESC, s.id LIMIT ? OFFSET ?`)
      .all(...(requestedSkills.length ? requestedSkills : []), ...params, limit, offset);
    const students = rows.map(row => {
      const profile = studentProfile(db, row.id, { includeResume: true });
      const matchedSkills = requestedSkills.filter(skill => profile.skills.some(known => known.toLowerCase() === skill.toLowerCase()));
      return { ...profile, matchedSkills, matchCount: row.matchCount };
    });
    res.json({ students, total, limit, offset, matchBasis: requestedSkills.length ? 'Number of requested skills found on the profile; ties use most recently updated profile.' : 'Most recently updated student profiles.' });
  });
  router.get('/company/talent/:id', companyAuth, (req, res) => {
    const visible = db.prepare(`SELECT 1 FROM students s WHERE s.id=? AND ${VISIBLE_TO_COMPANY}`).get(req.params.id, req.session.company_id);
    const profile = visible && studentProfile(db, req.params.id, { includeResume: true });
    if (!profile) throw new InputError('Student profile not found.', 404);
    res.json({ profile });
  });
  router.get('/company/saved-students', companyAuth, (req, res) => {
    const rows = db.prepare('SELECT student_id,note,created_at FROM saved_students WHERE company_id=? ORDER BY created_at DESC').all(req.session.company_id);
    res.json({ students: rows.map(row => ({ ...studentProfile(db, row.student_id, { includeResume: true }), note: row.note, savedAt: row.created_at })) });
  });
  router.post('/company/saved-students/:studentId', companyAuth, (req, res) => {
    if (!db.prepare('SELECT 1 FROM students WHERE id=?').get(req.params.studentId)) throw new InputError('Student profile not found.', 404);
    const note = optionalText(req.body?.note, 'Note', 1000); const timestamp = nowIso();
    db.prepare(`INSERT INTO saved_students(company_id,student_id,note,created_at) VALUES (?,?,?,?)
      ON CONFLICT(company_id,student_id) DO UPDATE SET note=excluded.note`).run(req.session.company_id, req.params.studentId, note, timestamp);
    res.status(201).json({ saved: true });
  });
  router.delete('/company/saved-students/:studentId', companyAuth, (req, res) => {
    const deleted = db.prepare('DELETE FROM saved_students WHERE company_id=? AND student_id=?').run(req.session.company_id, req.params.studentId);
    if (!deleted.changes) throw new InputError('Saved student not found.', 404);
    res.json({ saved: false });
  });

  return router;
}

function companyAssessment(db, id) {
  const row = db.prepare('SELECT * FROM skill_assessments WHERE id=?').get(id);
  return { id: row.id, title: row.title, description: row.description, relatedSkill: row.related_skill, instructions: row.instructions,
    durationMinutes: row.duration_minutes, status: row.status, createdAt: row.created_at,
    attemptCount: db.prepare('SELECT COUNT(*) AS n FROM skill_assessment_attempts WHERE assessment_id=?').get(id).n, questions: db.prepare('SELECT id,question_text AS questionText,option_a AS optionA,option_b AS optionB,option_c AS optionC,option_d AS optionD,correct_answer AS correctAnswer,question_order AS questionOrder FROM skill_assessment_questions WHERE assessment_id=? ORDER BY question_order').all(id) };
}
function companyQuestion(db, id) {
  return db.prepare('SELECT id,assessment_id AS assessmentId,question_text AS questionText,option_a AS optionA,option_b AS optionB,option_c AS optionC,option_d AS optionD,correct_answer AS correctAnswer,question_order AS questionOrder FROM skill_assessment_questions WHERE id=?').get(id);
}
function studentQuestions(db, assessmentId) {
  return db.prepare('SELECT id,question_text AS questionText,option_a AS optionA,option_b AS optionB,option_c AS optionC,option_d AS optionD,question_order AS questionOrder FROM skill_assessment_questions WHERE assessment_id=? ORDER BY question_order').all(assessmentId);
}
function studentAttempt(db, id) {
  const row = db.prepare(`SELECT a.id,a.assessment_id AS assessmentId,a.started_at AS startedAt,a.submitted_at AS submittedAt,a.status,a.review_status AS reviewStatus,
    a.manual_score AS manualScore,a.company_feedback AS companyFeedback,a.reviewed_at AS reviewedAt,s.title AS assessmentTitle,s.duration_minutes AS durationMinutes,s.status AS assessmentStatus
    FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id WHERE a.id=?`).get(id);
  row.expiresAt = row.durationMinutes ? new Date(Date.parse(row.startedAt) + row.durationMinutes * 60000).toISOString() : null;
  row.serverNow = nowIso();
  row.questions = studentQuestions(db, row.assessmentId).map(question => ({ ...question, selectedOption: db.prepare('SELECT selected_option FROM skill_assessment_answers WHERE attempt_id=? AND question_id=?').get(id, question.id)?.selected_option || null }));
  return row;
}
function companyAttempt(db, id) {
  const row = db.prepare(`SELECT a.id,a.assessment_id AS assessmentId,a.student_id AS studentId,a.started_at AS startedAt,a.submitted_at AS submittedAt,a.status,a.review_status AS reviewStatus,
    a.manual_score AS manualScore,a.company_feedback AS companyFeedback,a.reviewed_at AS reviewedAt,s.full_name AS fullName,s.college
    FROM skill_assessment_attempts a JOIN students s ON s.id=a.student_id WHERE a.id=?`).get(id);
  row.questions = db.prepare(`SELECT q.id,q.question_text AS questionText,q.option_a AS optionA,q.option_b AS optionB,q.option_c AS optionC,q.option_d AS optionD,
    q.correct_answer AS correctAnswer,q.question_order AS questionOrder,aa.selected_option AS selectedOption FROM skill_assessment_questions q
    LEFT JOIN skill_assessment_answers aa ON aa.question_id=q.id AND aa.attempt_id=? WHERE q.assessment_id=? ORDER BY q.question_order`).all(id, row.assessmentId);
  return row;
}
function ownedAssessment(db, id, companyId) {
  const assessment = db.prepare('SELECT * FROM skill_assessments WHERE id=? AND company_id=?').get(id, companyId);
  if (!assessment) throw new InputError('Assessment not found.', 404);
  return assessment;
}
function ownedAttempt(db, id, companyId) {
  const attempt = db.prepare(`SELECT a.* FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id
    WHERE a.id=? AND s.company_id=?`).get(id, companyId);
  if (!attempt) throw new InputError('Assessment attempt not found.', 404);
  return attempt;
}
