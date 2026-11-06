import './env.js';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { failedLoginLimiter, generalLimiter, loginBlockedMessage, sendTooMany } from './rateLimits.js';
import { randomBytes } from 'node:crypto';
import { createRepositories } from './repositories/index.js';
import { createPlatformRouter, expireAssessmentAttempts } from './platform.js';
import { sendOtpEmail, sendPasswordChangedEmail, sendSetupEmail } from './mail.js';
import { hashOtp, hashPassword, newId, newOtp, newSecret, newUserId, otpMatches, sha256, validatePassword, verifyPassword, cookieValue } from './security.js';
import { InputError, validateCompanyProfile, validateRegistration } from './validation.js';

// DB_DRIVER=sqlite (default) | mongo. See server/README.md and repositories/index.js.
const { driver, auth, db, challenges, student } = await createRepositories();
const app = express();
const port = Number(process.env.PORT || 4000);
const otpLifeMs = 5 * 60 * 1000;
const resendCooldownMs = 60 * 1000;
const resendWindowMs = 60 * 60 * 1000;
const maxResends = 5;
const maxAttempts = 5;
const sessionLifeMs = 12 * 60 * 60 * 1000;
const setupLifeMs = 30 * 60 * 1000;
const cookieName = 'osf_session';

if (!process.env.OTP_HMAC_SECRET) {
  if (process.env.NODE_ENV === 'production') throw new Error('Set OTP_HMAC_SECRET to a random value of at least 32 characters.');
  process.env.OTP_HMAC_SECRET = randomBytes(32).toString('hex');
  console.warn('OTP_HMAC_SECRET is not set; using a temporary local-only secret.');
} else if (process.env.OTP_HMAC_SECRET.length < 32) {
  throw new Error('Set OTP_HMAC_SECRET to a random value of at least 32 characters.');
}

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '32kb' }));
if (process.env.TRUST_PROXY) {
  const hops = Number(process.env.TRUST_PROXY);
  if (!Number.isInteger(hops) || hops < 0) throw new Error('TRUST_PROXY must be a non-negative integer (number of proxy hops).');
  app.set('trust proxy', hops);
}
app.use('/api/', generalLimiter);
const passwordSetupIpLimiter = rateLimit({
  windowMs: resendWindowMs, limit: maxResends, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'If the account is eligible, a setup link will be sent. Please wait before trying again.' }),
});
const passwordSetupIpCooldown = rateLimit({
  windowMs: resendCooldownMs, limit: 1, standardHeaders: 'draft-8', legacyHeaders: false,
  handler: (_req, res) => res.status(429).json({ error: 'If the account is eligible, a setup link will be sent. Please wait before trying again.' }),
});

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => Date.now();
const isoNow = () => new Date().toISOString();
const config = { appOrigin: (process.env.APP_ORIGIN || 'http://localhost:3000').replace(/\/$/, '') };
const cookieOptions = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifeMs / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

function readCookie(req, name) {
  return cookieValue(req, name);
}

async function sessionFor(req) {
  const token = readCookie(req, cookieName);
  if (!token) return null;
  return auth.findSession(sha256(token));
}

async function requireAuth(req, res, next) {
  const session = await sessionFor(req);
  if (!session || session.expires_at <= now()) {
    if (session) await auth.deleteSession(session.token_hash);
    res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  req.session = session;
  next();
}

function setupUrl(token) { return `${config.appOrigin}/set-password?token=${encodeURIComponent(token)}`; }

async function prepareSetupEmail(companyId, { enforceLimits = true } = {}) {
  const token = newSecret(32);
  const current = now();
  const record = await auth.getSetupCandidate(companyId);
  if (!record) return null;
  let update = { tokenHash: sha256(token), expiresAt: current + setupLifeMs, sentAt: current };
  if (enforceLimits) {
    if (current - record.setup_last_sent_at < resendCooldownMs) return { limited: true };
    const resetWindow = current - record.setup_resend_window_started_at >= resendWindowMs;
    const count = resetWindow ? 0 : record.setup_resend_count;
    if (count >= maxResends) return { limited: true };
    update = { ...update, count: count + 1, windowStart: resetWindow ? current : record.setup_resend_window_started_at };
  }
  // Optimistic write: a concurrent request that already issued a link makes this one a no-op "limited".
  if (!await auth.updateSetupToken(record.id, record.setup_last_sent_at, update)) return { limited: true };
  return { record, token };
}

async function sendSetupFor(companyId) {
  const prepared = await prepareSetupEmail(companyId);
  if (!prepared || prepared.limited) throw new InputError('Password setup email is not available yet. Wait before requesting another email.', 429);
  const { record, token } = prepared;
  await sendSetupEmail({ to: record.email, contactName: record.contact_name, companyName: record.company_name, userId: record.user_id, setupUrl: setupUrl(token) });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, emailConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) }));

app.post('/api/registrations', asyncRoute(async (req, res) => {
  const data = validateRegistration(req.body);
  if (await auth.emailExists(data.email)) throw new InputError('This email already has a registration. Try signing in or request a new verification email.', 409);
  const id = newId(); const otp = newOtp(); const sentAt = now();
  await auth.createRegistration(data, id, isoNow(), { hash: hashOtp(otp).toString('hex'), expiresAt: sentAt + otpLifeMs, sentAt });
  let emailDelivery = 'sent';
  try { await sendOtpEmail({ to: data.email, contactName: data.contactName, companyName: data.companyName, otp }); }
  catch { emailDelivery = 'failed'; }
  res.status(201).json({ registrationId: id, emailDelivery, message: emailDelivery === 'sent' ? 'Verification code sent.' : 'Registration saved, but the verification email could not be sent. You can retry shortly.' });
}));

app.post('/api/registrations/:id/resend-otp', asyncRoute(async (req, res) => {
  const id = req.params.id;
  const record = await auth.getOtpRecord(id);
  if (!record || record.status !== 'PENDING') throw new InputError('Registration is unavailable for verification.', 404);
  const current = now();
  if (current - record.last_sent_at < resendCooldownMs) throw new InputError('Wait before requesting another code.', 429);
  const resetWindow = current - record.resend_window_started_at >= resendWindowMs;
  const start = resetWindow ? current : record.resend_window_started_at;
  const count = resetWindow ? 1 : record.resend_count + 1;
  if (count > maxResends) throw new InputError('The resend limit has been reached. Try again later.', 429);
  const otp = newOtp();
  await auth.replaceOtp(id, { hash: hashOtp(otp).toString('hex'), expiresAt: current + otpLifeMs, count, windowStart: start, sentAt: current });
  try { await sendOtpEmail({ to: record.email, contactName: record.contact_name, companyName: record.company_name, otp }); }
  catch { return res.status(502).json({ error: 'A new code was prepared, but email delivery failed. Retry after the cooldown.' }); }
  res.json({ emailDelivery: 'sent', message: 'A new verification code was sent.' });
}));

app.post('/api/registrations/:id/verify-email', asyncRoute(async (req, res) => {
  const { otp } = req.body || {};
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new InputError('Enter the six-digit verification code.');
  const challenge = await auth.getOtpRecord(req.params.id);
  if (!challenge || challenge.status !== 'PENDING') throw new InputError('Registration is unavailable or already verified.', 409);
  if (challenge.expires_at <= now()) throw new InputError('This code expired. Request another code.', 410);
  if (challenge.attempts >= maxAttempts) throw new InputError('Too many incorrect attempts. Request a new code.', 429);
  if (!otpMatches(otp, challenge.otp_hash)) {
    await auth.bumpOtpAttempts(challenge.id, maxAttempts);
    throw new InputError('That verification code is incorrect.', 400);
  }
  const userId = newUserId(); const setupToken = newSecret(32); const verifiedAt = isoNow();
  const done = await auth.completeVerification({ companyId: challenge.id, verifiedAt, userRowId: newId(), userId, setupTokenHash: sha256(setupToken), verifiedTime: now(), setupLifeMs });
  if (!done) throw new InputError('Registration is unavailable or already verified.', 409);
  let emailDelivery = 'sent';
  try { await sendSetupEmail({ to: challenge.email, contactName: challenge.contact_name, companyName: challenge.company_name, userId, setupUrl: setupUrl(setupToken) }); }
  catch { emailDelivery = 'failed'; }
  res.json({ verified: true, userId, emailDelivery, message: emailDelivery === 'sent' ? 'Email verified. Check your email to set a password.' : 'Email verified. The password setup email could not be sent; retry delivery.' });
}));

app.post('/api/registrations/:id/resend-setup', passwordSetupIpLimiter, passwordSetupIpCooldown, asyncRoute(async (req, res) => {
  if (!await auth.hasPendingSetupUser(req.params.id)) throw new InputError('Password setup is unavailable for this registration.', 409);
  try { await sendSetupFor(req.params.id); }
  catch (error) { if (error instanceof InputError) throw error; return res.status(502).json({ error: 'Password setup email could not be sent. Try again later.' }); }
  res.json({ emailDelivery: 'sent', message: 'A new password setup link was sent.' });
}));

const genericSetupResponse = { message: 'If the account is eligible, a setup link will be sent. If it does not arrive, you can try again after 60 seconds.' };
app.post('/api/auth/resend-password-setup', passwordSetupIpLimiter, passwordSetupIpCooldown, asyncRoute(async (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase().slice(0, 254) : '';
  // Lookups, quotas and delivery errors intentionally share the same public response.
  const companyId = email ? await auth.findSetupEligibleCompanyIdByEmail(email) : null;
  if (companyId) {
    const prepared = await prepareSetupEmail(companyId);
    if (prepared?.record && !prepared.limited) {
      try {
        await sendSetupEmail({ to: prepared.record.email, contactName: prepared.record.contact_name, companyName: prepared.record.company_name, userId: prepared.record.user_id, setupUrl: setupUrl(prepared.token) });
      } catch {
        console.warn('Password setup email delivery failed.');
      }
    }
  }
  res.json(genericSetupResponse);
}));

app.post('/api/auth/setup-password', asyncRoute(async (req, res) => {
  const { token, password, confirmation } = req.body || {};
  if (typeof token !== 'string' || token.length < 30) throw new InputError('This password setup link is invalid or expired.', 410);
  if (!validatePassword(password)) throw new InputError('Use at least 12 characters with uppercase, lowercase, a number and a special character.');
  if (password !== confirmation) throw new InputError('The password confirmation does not match.');
  const user = await auth.findUserBySetupToken(sha256(token), now());
  if (!user) throw new InputError('This password setup link is invalid or expired.', 410);
  const hash = await hashPassword(password);
  if (!await auth.completePasswordSetup(user.id, sha256(token), now(), hash, isoNow())) throw new InputError('This password setup link has already been used.', 410);
  res.json({ setup: true, userId: user.user_id });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const wait = failedLoginLimiter.blockedFor(req, userId);
  if (wait) return sendTooMany(res, wait, loginBlockedMessage);
  const user = await auth.findUserByUserId(userId);
  const valid = Boolean(user?.password_hash && password && await verifyPassword(user.password_hash, password).catch(error => {
    console.warn(`Company login: password verification threw (${error?.code || error?.name || 'Error'}).`);
    return false;
  }));
  if (!valid) { failedLoginLimiter.fail(req, userId); throw new InputError('The User ID or password is incorrect.', 401); }
  failedLoginLimiter.reset(req, userId);
  const token = newSecret(32); const expiresAt = now() + sessionLifeMs;
  await auth.createSession({ tokenHash: sha256(token), userRowId: user.id, expiresAt, createdAt: isoNow() });
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; ${cookieOptions}`);
  res.json({ authenticated: true, userId: user.user_id, expiresAt: new Date(expiresAt).toISOString() });
}));

app.get('/api/auth/session', requireAuth, (req, res) => res.json({ authenticated: true, userId: req.session.user_id }));

app.post('/api/auth/logout', asyncRoute(async (req, res) => {
  const token = readCookie(req, cookieName);
  if (token) await auth.deleteSession(sha256(token));
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ loggedOut: true });
}));

app.get('/api/company/profile', requireAuth, asyncRoute(async (req, res) => {
  const company = await auth.getProfile(req.session.company_id, req.session.account_id);
  if (!company) return res.status(404).json({ error: 'Company profile not found.' });
  res.json({ company });
}));

app.post('/api/company/profile', requireAuth, asyncRoute(async (req, res) => {
  const existing = await auth.getCompanyLocation(req.session.company_id);
  if (!existing) throw new InputError('Company profile not found.', 404);
  if (existing.country_code !== 'IN' || existing.country !== 'India') {
    throw new InputError('This legacy profile is read-only until its India location details are reviewed.', 409);
  }
  const data = validateCompanyProfile(req.body, existing.email);
  await auth.updateProfile(req.session.company_id, data);
  const company = await auth.getProfile(req.session.company_id, req.session.account_id);
  res.json({ company, message: 'Company profile updated.' });
}));

app.post('/api/auth/change-password', requireAuth, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword, confirmation } = req.body || {};
  const user = await auth.getUserById(req.session.account_id);
  if (!user?.password_hash || !await verifyPassword(user.password_hash, currentPassword || '').catch(() => false)) throw new InputError('Current password is incorrect.', 400);
  if (!validatePassword(newPassword)) throw new InputError('Use at least 12 characters with uppercase, lowercase, a number and a special character.');
  if (newPassword === currentPassword) throw new InputError('Your new password must be different from the current password.');
  if (newPassword !== confirmation) throw new InputError('The password confirmation does not match.');
  const hash = await hashPassword(newPassword); const changedAt = isoNow();
  await auth.setPassword(user.id, hash, changedAt);
  const company = await auth.getCompanyContact(req.session.company_id);
  let notification = 'sent';
  try { await sendPasswordChangedEmail({ to: company.email, contactName: company.contact_name, changedAt }); } catch { notification = 'failed'; }
  res.json({ changed: true, notification });
}));

if (driver === 'sqlite') {
  app.use('/api', createPlatformRouter({ db, student, challenges, requireCompanyAuth: requireAuth }));
} else {
  // ponytail: auth/student/challenges are ported to Mongo so far; applications/assessments/talent still need repositories.
  app.use('/api', (_req, res) => res.status(501).json({ error: 'This endpoint is not available on the MongoDB driver yet.' }));
}

if (driver === 'sqlite' && process.env.NODE_ENV !== 'test') {
  const assessmentExpirySweep = setInterval(() => {
    try { expireAssessmentAttempts(db); } catch { /* The next sweep retries without changing attempt data. */ }
  }, 15_000);
  assessmentExpirySweep.unref();
}

app.use((error, _req, res, _next) => {
  // Only InputError carries a message written for clients; everything else is logged here and kept generic.
  if (error instanceof InputError) return res.status(error.status).json({ error: error.message });
  let status = 500; let message = 'Something went wrong. Please try again.';
  if (error?.type === 'entity.too.large') { status = 413; message = 'The request is too large.'; }
  else if (error?.type?.startsWith('entity.') || error instanceof SyntaxError) { status = 400; message = 'The request could not be read.'; }
  else if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE' || error?.code === 11000) { status = 409; message = 'This record already exists.'; }
  if (status >= 500) console.error(`OSF API request failed (${error?.code || error?.name || 'Error'}).`);
  res.status(status).json({ error: message });
});

export { app };
if (process.env.NODE_ENV !== 'test') app.listen(port, () => console.log(`OSF API listening on port ${port}`));
