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
function assertApplicationOwner(db, appId, studentId) {
  const app = db.prepare('SELECT * FROM applications WHERE id=? AND student_id=?').get(appId, studentId);
  if (!app) throw new InputError('Application not found.', 404);
  return app;
}
function ownedChallenge(db, challengeId, companyId) {
  const challenge = db.prepare('SELECT * FROM challenges WHERE id=? AND company_id=?').get(challengeId, companyId);
  if (!challenge) throw new InputError('Challenge not found.', 404);
  return challenge;
}
function ownedApplication(db, applicationId, companyId) {
  const row = db.prepare(`SELECT a.*,c.company_id FROM applications a JOIN challenges c ON c.id=a.challenge_id
    WHERE a.id=? AND c.company_id=?`).get(applicationId, companyId);
  if (!row) throw new InputError('Application not found.', 404);
  return row;
}
function syncExpiredApplication(db, application) {
  if (application.status !== 'SUBMITTED' && application.status !== 'EXPIRED' && Date.parse(application.individual_deadline) <= nowMs()) {
    db.prepare("UPDATE applications SET status='EXPIRED',updated_at=? WHERE id=? AND status<>'SUBMITTED'").run(nowIso(), application.id);
    application.status = 'EXPIRED';
  }
  return application;
}
function requireApplicationSubmissionState(db, applicationId, studentId) {
  const application = syncExpiredApplication(db, assertApplicationOwner(db, applicationId, studentId));
  if (application.status === 'EXPIRED' || Date.parse(application.individual_deadline) <= nowMs()) {
    if (application.status !== 'EXPIRED') syncExpiredApplication(db, application);
    throw new InputError('The individual task deadline has passed.', 409);
  }
  if (!['IN_PROGRESS', 'SUBMITTED'].includes(application.status)) {
    throw new InputError('Start your task before uploading or submitting work.', 409);
  }
  if (db.prepare('SELECT 1 FROM evaluations WHERE application_id=?').get(application.id)) {
    throw new InputError('This application has already been evaluated and can no longer be changed.', 400);
  }
  return application;
}
function fileMetadata(db, applicationId, fileId) {
  return db.prepare(`SELECT id,application_id,storage_key,original_name,mime_type,size_bytes,created_at
    FROM submission_files WHERE id=? AND application_id=?`).get(fileId, applicationId);
}
function publicFileMetadata(db, applicationId, fileId) {
  const file = fileMetadata(db, applicationId, fileId);
  return file ? { id: file.id, name: file.original_name, mimeType: file.mime_type, sizeBytes: file.size_bytes, uploadedAt: file.created_at } : null;
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

export function createPlatformRouter({ db, student, challenges, assessments, requireCompanyAuth }) {
  const router = express.Router();
  const studentAuth = requireStudent(student);
  const companyAuth = requireCompanyAuth;

  assessments.expireAttempts().catch(() => {});

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
  router.post('/student/challenges/:id/applications', studentAuth, (req, res) => {
    if (!req.student.student_id) throw new InputError('Complete your student profile before applying.', 409);
    const challenge = db.prepare("SELECT * FROM challenges WHERE id=? AND status='PUBLISHED'").get(req.params.id);
    if (!challenge) throw new InputError('Challenge is not available for applications.', 404);
    const appliedAt = nowMs();
    if (appliedAt < Date.parse(challenge.application_opens_at) || appliedAt > Date.parse(challenge.application_closes_at)) throw new InputError('Applications are outside this challenge’s application window.', 409);
    const appliedIso = new Date(appliedAt).toISOString();
    const deadline = new Date(appliedAt + challenge.individual_task_duration_days * 86400000).toISOString();
    const id = newId();
    try {
      db.prepare(`INSERT INTO applications(id,challenge_id,student_id,applied_at,individual_deadline,status,created_at,updated_at)
        VALUES (?,?,?,?,?,'APPLIED',?,?)`).run(id, challenge.id, req.student.student_id, appliedIso, deadline, appliedIso, appliedIso);
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') throw new InputError('You already applied to this challenge.', 409);
      throw error;
    }
    res.status(201).json({ application: { id, challengeId: challenge.id, appliedAt: appliedIso, individualDeadline: deadline, status: 'APPLIED' } });
  });
  router.post('/student/applications/:id/start', studentAuth, (req, res) => {
    const application = syncExpiredApplication(db, assertApplicationOwner(db, req.params.id, req.student.student_id));
    if (!assertApplicationDeadline(application)) {
      syncExpiredApplication(db, application);
      throw new InputError('The individual task deadline has passed.', 409);
    }
    if (application.status === 'SUBMITTED') throw new InputError('This application has already been submitted.', 409);
    if (application.status === 'EXPIRED') throw new InputError('The individual task deadline has passed.', 409);
    if (application.status === 'APPLIED') db.prepare("UPDATE applications SET status='IN_PROGRESS',updated_at=? WHERE id=?").run(nowIso(), application.id);
    res.json({ application: { id: application.id, status: 'IN_PROGRESS', individualDeadline: application.individual_deadline } });
  });
  router.get('/student/applications', studentAuth, (req, res) => {
    const applications = db.prepare(`SELECT a.id,a.challenge_id AS challengeId,a.applied_at AS appliedAt,a.individual_deadline AS individualDeadline,
      a.status,a.updated_at AS updatedAt,c.role_title AS roleTitle,c.status AS challengeStatus,c.application_closes_at AS applicationClosesAt,
      c.application_opens_at AS applicationOpensAt,substr(c.task_description,1,280) AS taskSnippet,c.is_paid AS isPaid,
      c.compensation_details AS compensationDetails,c.individual_task_duration_days AS individualTaskDurationDays,co.company_name AS companyName
      FROM applications a JOIN challenges c ON c.id=a.challenge_id LEFT JOIN companies co ON co.id=c.company_id WHERE a.student_id=? ORDER BY a.applied_at DESC`).all(req.student.student_id);
    const rows = applications.map(application => {
      const expired = application.status !== 'SUBMITTED' && Date.parse(application.individualDeadline) <= nowMs();
      if (expired && application.status !== 'EXPIRED') db.prepare("UPDATE applications SET status='EXPIRED',updated_at=? WHERE id=? AND status<>'SUBMITTED'").run(nowIso(), application.id);
      return { ...application, isPaid: Boolean(application.isPaid), requiredSkills: challengeSkills(db, application.challengeId), status: expired ? 'EXPIRED' : application.status, submission: db.prepare('SELECT submitted_at AS submittedAt FROM submissions WHERE application_id=?').get(application.id) || null,
        evaluation: db.prepare('SELECT rating,feedback,is_shortlisted AS isShortlisted,evaluated_at AS evaluatedAt FROM evaluations WHERE application_id=?').get(application.id) || null };
    });
    res.json({ applications: rows });
  });

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
  router.get('/company/challenges/:id/applications', companyAuth, (req, res) => {
    const challenge = ownedChallenge(db, req.params.id, req.session.company_id);
    const rows = db.prepare(`SELECT a.id,a.student_id AS studentId,a.applied_at AS appliedAt,a.individual_deadline AS individualDeadline,a.status,
      s.full_name AS fullName,s.college,s.degree,
      (SELECT submitted_at FROM submissions WHERE application_id=a.id) AS submittedAt,
      COALESCE((SELECT is_shortlisted FROM evaluations WHERE application_id=a.id),0) AS isShortlisted
      FROM applications a JOIN students s ON s.id=a.student_id WHERE a.challenge_id=? ORDER BY a.applied_at DESC`).all(challenge.id)
      .map(row => ({ ...row, isShortlisted: Boolean(row.isShortlisted), skills: listStudentSkills(db, row.studentId) }));
    const applications = rows.map(row => {
      if (row.status !== 'SUBMITTED' && Date.parse(row.individualDeadline) <= nowMs()) {
        db.prepare("UPDATE applications SET status='EXPIRED',updated_at=? WHERE id=? AND status<>'SUBMITTED'").run(nowIso(), row.id);
        return { ...row, status: 'EXPIRED' };
      }
      return row;
    });
    res.json({ applications });
  });
  router.get('/company/applications/:id', companyAuth, (req, res) => {
    const application = syncExpiredApplication(db, ownedApplication(db, req.params.id, req.session.company_id));
    const profile = studentProfile(db, application.student_id, { includeResume: true });
    const submission = db.prepare(`SELECT id,github_url AS githubUrl,deployed_url AS deployedUrl,file_reference AS fileReference,
      supporting_information AS supportingInformation,submitted_at AS submittedAt,updated_at AS updatedAt FROM submissions WHERE application_id=? AND submitted_at IS NOT NULL`).get(application.id) || null;
    if (submission?.fileReference) submission.file = fileMetadata(db, application.id, submission.fileReference) ? { id: submission.fileReference } : null;
    const evaluation = db.prepare('SELECT id,rating,feedback,is_shortlisted AS isShortlisted,evaluated_at AS evaluatedAt FROM evaluations WHERE application_id=?').get(application.id) || null;
    res.json({ application: { id: application.id, challengeId: application.challenge_id, appliedAt: application.applied_at, individualDeadline: application.individual_deadline, status: application.status, student: profile, submission, evaluation } });
  });
  // Full profile + contact email, only for students who applied to one of this company's challenges.
  router.get('/company/applications/:id/student', companyAuth, (req, res) => {
    const application = ownedApplication(db, req.params.id, req.session.company_id);
    const profile = studentProfile(db, application.student_id, { includeResume: true });
    if (!profile) throw new InputError('Application not found.', 404);
    profile.contactEmail = db.prepare('SELECT u.email FROM students s JOIN student_users u ON u.id=s.account_id WHERE s.id=?').get(application.student_id)?.email || null;
    res.json({ student: profile });
  });
  router.get('/company/applications/:id/file', companyAuth, (req, res) => {
    const application = ownedApplication(db, req.params.id, req.session.company_id);
    const file = db.prepare(`SELECT f.* FROM submission_files f JOIN submissions s ON s.file_reference=f.id WHERE f.application_id=? AND s.submitted_at IS NOT NULL`).get(application.id);
    sendSubmissionFile(res, file);
  });
  router.get('/student/applications/:id/file', studentAuth, (req, res) => {
    assertApplicationOwner(db, req.params.id, req.student.student_id);
    const file = db.prepare(`SELECT f.* FROM submission_files f JOIN submissions s ON s.file_reference=f.id WHERE f.application_id=?`).get(req.params.id);
    sendSubmissionFile(res, file);
  });
  router.put('/student/applications/:id/file', studentAuth, express.raw({
    type: ['application/octet-stream', ...[...publicFileTypes.values()].flatMap(types => [...types])], limit: '10mb',
  }), asyncRoute(async (req, res) => {
    const application = requireApplicationSubmissionState(db, req.params.id, req.student.student_id);
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
    let replaced = [];
    try {
      const saveFile = db.transaction(() => {
        const current = syncExpiredApplication(db, assertApplicationOwner(db, application.id, req.student.student_id));
        if (!['IN_PROGRESS', 'SUBMITTED'].includes(current.status) || Date.parse(current.individual_deadline) <= nowMs()) {
          syncExpiredApplication(db, current);
          return false;
        }
        db.prepare('INSERT INTO submission_files(id,application_id,storage_key,original_name,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(id, application.id, storageKey, originalName, mimeType, req.body.length, timestamp);
        db.prepare(`INSERT INTO submissions(id,application_id,file_reference,created_at,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(application_id) DO UPDATE SET file_reference=excluded.file_reference,updated_at=excluded.updated_at`)
          .run(newId(), application.id, id, timestamp, timestamp);
        // Replacing a file removes every older row for this application; disk files are unlinked after commit.
        replaced = db.prepare('SELECT id,storage_key FROM submission_files WHERE application_id=? AND id<>?').all(application.id, id);
        db.prepare('DELETE FROM submission_files WHERE application_id=? AND id<>?').run(application.id, id);
        return true;
      });
      if (!saveFile()) {
        await unlink(filePath).catch(() => {});
        throw new InputError('Start your task before uploading work, or check its individual deadline.', 409);
      }
    } catch (error) {
      await unlink(filePath).catch(() => {});
      throw error;
    }
    for (const old of replaced) await unlink(resolve(uploadDir, old.storage_key)).catch(() => {});
    res.status(201).json({ file: { id, name: originalName, mimeType, sizeBytes: req.body.length } });
  }));
  router.put('/student/applications/:id/draft', studentAuth, (req, res) => {
    const application = requireApplicationSubmissionState(db, req.params.id, req.student.student_id);
    const body = req.body || {};
    const githubUrl = optionalUrl(body.githubUrl, 'GitHub repository URL');
    const deployedUrl = optionalUrl(body.deployedUrl, 'Deployed website URL');
    const supportingInformation = optionalText(body.supportingInformation, 'Supporting information', 5000);
    const timestamp = nowIso();
    const saved = db.prepare(`INSERT INTO submissions(id,application_id,github_url,deployed_url,supporting_information,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET github_url=excluded.github_url,deployed_url=excluded.deployed_url,
      supporting_information=excluded.supporting_information,updated_at=excluded.updated_at WHERE submissions.submitted_at IS NULL`)
      .run(newId(), application.id, githubUrl, deployedUrl, supportingInformation, timestamp, timestamp);
    if (!saved.changes) throw new InputError('This task has already been submitted; drafts are no longer saved.', 409);
    res.json({ draft: { savedAt: timestamp } });
  });
  router.put('/student/applications/:id/submission', studentAuth, (req, res) => {
    const application = requireApplicationSubmissionState(db, req.params.id, req.student.student_id);
    const body = req.body || {};
    const githubUrl = optionalUrl(body.githubUrl, 'GitHub repository URL');
    const deployedUrl = optionalUrl(body.deployedUrl, 'Deployed website URL');
    const supportingInformation = optionalText(body.supportingInformation, 'Supporting information', 5000);
    const fileReference = optionalText(body.fileReference, 'File reference', 40);
    if (!githubUrl && !deployedUrl && !supportingInformation && !fileReference) throw new InputError('Add a repository, deployed website, uploaded file, or supporting information.');
    if (fileReference && !fileMetadata(db, application.id, fileReference)) throw new InputError('Uploaded file not found for this application.', 400);
    const timestamp = nowIso();
    const save = db.transaction(() => {
      const current = syncExpiredApplication(db, assertApplicationOwner(db, application.id, req.student.student_id));
      if (!['IN_PROGRESS', 'SUBMITTED'].includes(current.status) || Date.parse(current.individual_deadline) <= nowMs()) {
        syncExpiredApplication(db, current);
        return false;
      }
      db.prepare(`INSERT INTO submissions(id,application_id,github_url,deployed_url,file_reference,supporting_information,submitted_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET github_url=excluded.github_url,deployed_url=excluded.deployed_url,
        file_reference=COALESCE(excluded.file_reference,submissions.file_reference),supporting_information=excluded.supporting_information,
        submitted_at=excluded.submitted_at,updated_at=excluded.updated_at`)
        .run(newId(), application.id, githubUrl, deployedUrl, fileReference, supportingInformation, timestamp, timestamp, timestamp);
      db.prepare("UPDATE applications SET status='SUBMITTED',updated_at=? WHERE id=?").run(timestamp, application.id);
      return true;
    });
    if (!save()) throw new InputError('Start your task before submitting work, or check its individual deadline.', 409);
    res.json({ submission: db.prepare(`SELECT id,github_url AS githubUrl,deployed_url AS deployedUrl,file_reference AS fileReference,
      supporting_information AS supportingInformation,submitted_at AS submittedAt,updated_at AS updatedAt FROM submissions WHERE application_id=?`).get(application.id) });
  });
  router.get('/student/applications/:id/submission', studentAuth, (req, res) => {
    assertApplicationOwner(db, req.params.id, req.student.student_id);
    const submission = db.prepare(`SELECT id,github_url AS githubUrl,deployed_url AS deployedUrl,file_reference AS fileReference,
      supporting_information AS supportingInformation,submitted_at AS submittedAt,updated_at AS updatedAt FROM submissions WHERE application_id=?`).get(req.params.id) || null;
    if (submission?.fileReference) submission.file = publicFileMetadata(db, req.params.id, submission.fileReference);
    res.json({ submission });
  });
  router.get('/company/applications/:id/submission', companyAuth, (req, res) => {
    const app = ownedApplication(db, req.params.id, req.session.company_id);
    const submission = db.prepare(`SELECT id,github_url AS githubUrl,deployed_url AS deployedUrl,file_reference AS fileReference,
      supporting_information AS supportingInformation,submitted_at AS submittedAt,updated_at AS updatedAt FROM submissions WHERE application_id=? AND submitted_at IS NOT NULL`).get(app.id) || null;
    if (submission?.fileReference) submission.file = publicFileMetadata(db, app.id, submission.fileReference);
    res.json({ submission });
  });
  router.put('/company/applications/:id/evaluation', companyAuth, (req, res) => {
    const application = ownedApplication(db, req.params.id, req.session.company_id);
    if (application.status !== 'SUBMITTED' || !db.prepare('SELECT 1 FROM submissions WHERE application_id=? AND submitted_at IS NOT NULL').get(application.id)) throw new InputError('Only a submitted application can be evaluated.');
    const body = req.body || {};
    const rating = body.rating == null || body.rating === '' ? null : Number(body.rating);
    if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) throw new InputError('Rating must be a whole number from 1 to 5.');
    const feedback = optionalText(body.feedback, 'Feedback', 5000);
    const shortlisted = body.isShortlisted ?? false;
    if (![true, false, 0, 1].includes(shortlisted)) throw new InputError('Shortlist status must be true or false.');
    const timestamp = nowIso();
    db.prepare(`INSERT INTO evaluations(id,application_id,rating,feedback,is_shortlisted,evaluated_by,evaluated_at,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET rating=excluded.rating,feedback=excluded.feedback,
      is_shortlisted=excluded.is_shortlisted,evaluated_by=excluded.evaluated_by,evaluated_at=excluded.evaluated_at,updated_at=excluded.updated_at`)
      .run(newId(), application.id, rating, feedback, shortlisted === true || shortlisted === 1 ? 1 : 0, req.session.account_id, timestamp, timestamp, timestamp);
    res.json({ evaluation: db.prepare('SELECT id,rating,feedback,is_shortlisted AS isShortlisted,evaluated_at AS evaluatedAt FROM evaluations WHERE application_id=?').get(application.id) });
  });

  // Company-authored MCQ assessments keep answer keys on the server. Student-facing repo methods
  // never select correct_answer; only company views (companyAssessment/companyAttempt) carry it.
  const ownedAssessment = async (id, companyId) => {
    const assessment = await assessments.getOwned(id, companyId);
    if (!assessment) throw new InputError('Assessment not found.', 404);
    return assessment;
  };
  const ownedAttempt = async (id, companyId) => {
    const attempt = await assessments.getOwnedAttempt(id, companyId);
    if (!attempt) throw new InputError('Assessment attempt not found.', 404);
    return attempt;
  };
  router.post('/company/assessments', companyAuth, asyncRoute(async (req, res) => {
    const title = requiredText(req.body?.title, 'Assessment title', 150);
    const relatedSkill = requiredText(req.body?.relatedSkill, 'Related skill', 80);
    const duration = req.body?.durationMinutes == null || req.body.durationMinutes === '' ? null : Number(req.body.durationMinutes);
    if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) throw new InputError('Duration must be between 1 and 1440 minutes.');
    const description = optionalText(req.body?.description, 'Description', 3000);
    const instructions = optionalText(req.body?.instructions, 'Instructions', 3000);
    const assessment = await assessments.createAssessment({ id: newId(), companyId: req.session.company_id, title, description, relatedSkill, instructions, duration, timestamp: nowIso() });
    res.status(201).json({ assessment });
  }));
  router.get('/company/assessments', companyAuth, asyncRoute(async (req, res) => {
    res.json({ assessments: await assessments.listForCompany(req.session.company_id) });
  }));
  router.put('/company/assessments/:id', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Only draft assessments can be edited.', 400);
    const title = requiredText(req.body?.title ?? assessment.title, 'Assessment title', 150);
    const relatedSkill = requiredText(req.body?.relatedSkill ?? assessment.related_skill, 'Related skill', 80);
    const duration = req.body?.durationMinutes === undefined ? assessment.duration_minutes : req.body.durationMinutes === null || req.body.durationMinutes === '' ? null : Number(req.body.durationMinutes);
    if (duration != null && (!Number.isInteger(duration) || duration < 1 || duration > 1440)) throw new InputError('Duration must be between 1 and 1440 minutes.');
    const updated = await assessments.updateIfDraft(assessment.id, req.session.company_id, { title, relatedSkill, duration, timestamp: nowIso(),
      description: optionalText(req.body?.description ?? assessment.description, 'Description', 3000),
      instructions: optionalText(req.body?.instructions ?? assessment.instructions, 'Instructions', 3000) });
    if (!updated) throw new InputError('Only draft assessments can be edited.', 400); // published/closed between the check and the write
    res.json({ assessment: updated });
  }));
  router.post('/company/assessments/:id/questions', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Questions can be edited while the assessment is a draft.', 409);
    const questionText = requiredText(req.body?.questionText, 'Question', 3000);
    const options = ['A', 'B', 'C', 'D'].map(key => requiredText(req.body?.[`option${key}`], `Option ${key}`, 1000));
    const correctAnswer = typeof req.body?.correctAnswer === 'string' ? req.body.correctAnswer.toUpperCase() : '';
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) throw new InputError('Correct answer must be A, B, C, or D.');
    const order = req.body?.questionOrder == null ? await assessments.nextQuestionOrder(assessment.id) : Number(req.body.questionOrder);
    if (!Number.isInteger(order) || order < 1 || order > 500) throw new InputError('Question order must be between 1 and 500.');
    const timestamp = nowIso();
    const question = await assessments.addQuestion({ id: newId(), assessmentId: assessment.id, questionText, options, correctAnswer, order, timestamp });
    if (!question) throw new InputError('A question already uses that order number.', 409);
    res.status(201).json({ question });
  }));
  router.put('/company/assessments/:id/questions/:questionId', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Questions can be edited while the assessment is a draft.', 409);
    const existing = await assessments.getQuestion(assessment.id, req.params.questionId);
    if (!existing) throw new InputError('Question not found.', 404);
    const questionText = requiredText(req.body?.questionText ?? existing.question_text, 'Question', 3000);
    const options = ['A', 'B', 'C', 'D'].map(key => requiredText(req.body?.[`option${key}`] ?? existing[`option_${key.toLowerCase()}`], `Option ${key}`, 1000));
    const correctAnswer = String(req.body?.correctAnswer ?? existing.correct_answer).toUpperCase();
    if (!['A', 'B', 'C', 'D'].includes(correctAnswer)) throw new InputError('Correct answer must be A, B, C, or D.');
    const order = req.body?.questionOrder == null ? existing.question_order : Number(req.body.questionOrder);
    if (!Number.isInteger(order) || order < 1 || order > 500) throw new InputError('Question order must be between 1 and 500.');
    const question = await assessments.updateQuestion({ id: existing.id, assessmentId: assessment.id, questionText, options, correctAnswer, order, timestamp: nowIso() });
    if (!question) throw new InputError('A question already uses that order number.', 409);
    res.json({ question });
  }));
  router.delete('/company/assessments/:id/questions/:questionId', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    if (assessment.status !== 'DRAFT') throw new InputError('Questions can be edited while the assessment is a draft.', 409);
    if (!await assessments.deleteQuestion(assessment.id, req.params.questionId)) throw new InputError('Question not found.', 404);
    res.json({ deleted: true });
  }));
  router.post('/company/assessments/:id/publish', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    if (assessment.status === 'CLOSED') throw new InputError('A closed assessment cannot be published again.', 409);
    if (!await assessments.hasQuestions(assessment.id)) throw new InputError('Add at least one question before publishing.');
    res.json({ assessment: await assessments.setStatus(assessment.id, 'PUBLISHED', nowIso()) });
  }));
  router.post('/company/assessments/:id/close', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    await assessments.setStatus(assessment.id, 'CLOSED', nowIso());
    res.json({ closed: true });
  }));
  router.get('/student/assessments', studentAuth, asyncRoute(async (_req, res) => {
    res.json({ assessments: await assessments.listPublished() });
  }));
  router.get('/student/assessments/:id', studentAuth, asyncRoute(async (req, res) => {
    const assessment = await assessments.getForStudent(req.params.id, req.student.student_id);
    if (!assessment) throw new InputError('Assessment not found.', 404);
    res.json({ assessment });
  }));
  router.post('/student/assessments/:id/attempts', studentAuth, asyncRoute(async (req, res) => {
    if (!req.student.student_id) throw new InputError('Complete your student profile before starting an assessment.', 409);
    if (!await assessments.isPublished(req.params.id)) throw new InputError('Assessment is not available.', 404);
    const attempt = await assessments.startAttempt({ id: newId(), assessmentId: req.params.id, studentId: req.student.student_id, timestamp: nowIso() });
    if (!attempt) throw new InputError('You already have an attempt for this assessment.', 409);
    res.status(201).json({ attempt });
  }));
  router.get('/student/assessment-attempts', studentAuth, asyncRoute(async (req, res) => {
    await assessments.expireAttempts();
    if (!req.student.student_id) return res.json({ attempts: [] });
    res.json({ attempts: await assessments.listStudentAttempts(req.student.student_id) });
  }));
  router.get('/student/assessment-attempts/:id', studentAuth, asyncRoute(async (req, res) => {
    await assessments.expireAttempts();
    const attempt = await assessments.getStudentAttempt(req.params.id, req.student.student_id);
    if (!attempt) throw new InputError('Assessment attempt not found.', 404);
    res.json({ attempt });
  }));
  router.put('/student/assessment-attempts/:id/answers', studentAuth, asyncRoute(async (req, res) => {
    const attempt = await assessments.getAttemptRow(req.params.id, req.student.student_id);
    if (!attempt) throw new InputError('Assessment attempt not found.', 404);
    await assessments.expireAttempts();
    const refreshed = await assessments.getAttemptRow(attempt.id, req.student.student_id);
    if (!refreshed) throw new InputError('Assessment attempt not found.', 404);
    if (refreshed.status !== 'IN_PROGRESS') throw new InputError(refreshed.status === 'EXPIRED' ? 'The assessment time limit has passed.' : 'This assessment attempt has already been submitted.', 409);
    const answers = req.body?.answers;
    if (!Array.isArray(answers) || answers.length > 500) throw new InputError('Answers must be a list of up to 500 responses.');
    const questionIds = new Set(await assessments.questionIds(attempt.assessment_id));
    const normalized = answers.map(answer => {
      const questionId = text(answer?.questionId, 80);
      const selectedOption = typeof answer?.selectedOption === 'string' ? answer.selectedOption.toUpperCase() : '';
      if (!questionIds.has(questionId) || !['A', 'B', 'C', 'D'].includes(selectedOption)) throw new InputError('Each response must select A, B, C, or D for a question in this assessment.');
      return { questionId, selectedOption };
    });
    if (new Set(normalized.map(answer => answer.questionId)).size !== normalized.length) throw new InputError('Each question can be answered only once.');
    const finalize = req.body?.finalize !== false;
    const state = await assessments.saveAnswers({ attemptId: attempt.id, studentId: req.student.student_id, answers: normalized, finalize, timestamp: nowIso(), now: nowMs() });
    if (state === 'EXPIRED') throw new InputError('The assessment time limit has passed.', 409);
    if (state !== (finalize ? 'SUBMITTED' : 'IN_PROGRESS')) throw new InputError('This assessment attempt is no longer editable.', 409);
    res.json({ attempt: await assessments.getStudentAttempt(attempt.id, req.student.student_id) });
  }));
  router.get('/company/assessments/:id/attempts', companyAuth, asyncRoute(async (req, res) => {
    const assessment = await ownedAssessment(req.params.id, req.session.company_id);
    res.json({ attempts: await assessments.listAttemptsForAssessment(assessment.id) });
  }));
  router.get('/company/assessment-attempts/:id', companyAuth, asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.session.company_id);
    res.json({ attempt: await assessments.getCompanyAttempt(attempt.id) });
  }));
  router.put('/company/assessment-attempts/:id/evaluation', companyAuth, asyncRoute(async (req, res) => {
    const attempt = await ownedAttempt(req.params.id, req.session.company_id);
    if (!attempt.submitted_at) throw new InputError('Submit an assessment attempt before reviewing it.', 409);
    const score = req.body?.manualScore == null || req.body.manualScore === '' ? null : Number(req.body.manualScore);
    if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) throw new InputError('Manual score must be between 0 and 100.');
    const feedback = optionalText(req.body?.companyFeedback, 'Company feedback', 5000);
    await assessments.evaluateAttempt(attempt.id, { score, feedback, timestamp: nowIso() });
    res.json({ attempt: await assessments.getCompanyAttempt(attempt.id) });
  }));

  // Company talent discovery uses indexed stored skills and returns the transparent overlap.
  // Hidden profiles (profile_visible=0) are only visible to companies whose challenges the student applied to (enforced in the repo).
  router.get('/company/talent', companyAuth, asyncRoute(async (req, res) => {
    const requestedSkills = [...new Map((typeof req.query.skills === 'string' ? req.query.skills.split(',').map(value => text(value, 60)).filter(Boolean).slice(0, 20) : []).map(skill => [skill.toLowerCase(), skill])).values()];
    const college = typeof req.query.college === 'string' ? text(req.query.college, 200) : '';
    const limit = Math.min(Math.max(Math.trunc(Number(req.query.limit)) || 24, 1), 50);
    const offset = Math.max(Math.trunc(Number(req.query.offset)) || 0, 0);
    const { rows, total } = await assessments.searchTalent({ companyId: req.session.company_id, skills: requestedSkills, college, limit, offset });
    const found = await Promise.all(rows.map(async row => {
      const profile = await student.buildStudentProfile(row.id, { includeResume: true });
      if (!profile) return null;
      const matchedSkills = requestedSkills.filter(skill => profile.skills.some(known => known.toLowerCase() === skill.toLowerCase()));
      return { ...profile, matchedSkills, matchCount: row.matchCount };
    }));
    res.json({ students: found.filter(Boolean), total, limit, offset, matchBasis: requestedSkills.length ? 'Number of requested skills found on the profile; ties use most recently updated profile.' : 'Most recently updated student profiles.' });
  }));
  router.get('/company/talent/:id', companyAuth, asyncRoute(async (req, res) => {
    const profile = await assessments.isTalentVisible(req.params.id, req.session.company_id) && await student.buildStudentProfile(req.params.id, { includeResume: true });
    if (!profile) throw new InputError('Student profile not found.', 404);
    res.json({ profile });
  }));
  router.get('/company/saved-students', companyAuth, asyncRoute(async (req, res) => {
    const rows = await assessments.listSaved(req.session.company_id);
    const list = await Promise.all(rows.map(async row => {
      const profile = await student.buildStudentProfile(row.student_id, { includeResume: true });
      return profile && { ...profile, note: row.note, savedAt: row.created_at };
    }));
    res.json({ students: list.filter(Boolean) });
  }));
  router.post('/company/saved-students/:studentId', companyAuth, asyncRoute(async (req, res) => {
    if (!await assessments.studentExists(req.params.studentId)) throw new InputError('Student profile not found.', 404);
    const note = optionalText(req.body?.note, 'Note', 1000);
    await assessments.saveStudent(req.session.company_id, req.params.studentId, note, nowIso());
    res.status(201).json({ saved: true });
  }));
  router.delete('/company/saved-students/:studentId', companyAuth, asyncRoute(async (req, res) => {
    if (!await assessments.removeSaved(req.session.company_id, req.params.studentId)) throw new InputError('Saved student not found.', 404);
    res.json({ saved: false });
  }));

  return router;
}
