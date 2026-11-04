import './env.js';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { sendOtpEmail, sendPasswordChangedEmail, sendSetupEmail } from './mail.js';
import { hashOtp, hashPassword, newId, newOtp, newSecret, newUserId, otpMatches, sha256, validatePassword, verifyPassword } from './security.js';
import { InputError, validateRegistration } from './validation.js';

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
app.use('/api/', rateLimit({ windowMs: 15 * 60 * 1000, limit: 100, standardHeaders: 'draft-8', legacyHeaders: false }));

const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const now = () => Date.now();
const isoNow = () => new Date().toISOString();
const config = { appOrigin: (process.env.APP_ORIGIN || 'http://localhost:5173').replace(/\/$/, '') };
const cookieOptions = `HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionLifeMs / 1000}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

function readCookie(req, name) {
  const entry = (req.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith(`${name}=`));
  return entry ? decodeURIComponent(entry.slice(name.length + 1)) : '';
}

function sessionFor(req) {
  const token = readCookie(req, cookieName);
  if (!token) return null;
  return db.prepare(`SELECT s.token_hash, s.expires_at, u.id AS account_id, u.user_id, c.id AS company_id, c.email
    FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id
    WHERE s.token_hash=?`).get(sha256(token));
}

function requireAuth(req, res, next) {
  const session = sessionFor(req);
  if (!session || session.expires_at <= now()) {
    if (session) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(session.token_hash);
    res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
    return res.status(401).json({ error: 'Sign in to continue.' });
  }
  req.session = session;
  next();
}

function setupUrl(token) { return `${config.appOrigin}/set-password?token=${encodeURIComponent(token)}`; }

async function sendSetupFor(companyId) {
  const record = db.prepare(`SELECT c.email,c.contact_name,c.company_name,u.id,u.user_id
    FROM companies c JOIN users u ON u.company_id=c.id WHERE c.id=? AND u.password_hash IS NULL`).get(companyId);
  if (!record) throw new InputError('Password setup is unavailable for this registration.', 409);
  const token = newSecret(32);
  db.prepare('UPDATE users SET setup_token_hash=?,setup_expires_at=? WHERE id=?').run(sha256(token), now() + setupLifeMs, record.id);
  await sendSetupEmail({ to: record.email, contactName: record.contact_name, companyName: record.company_name, userId: record.user_id, setupUrl: setupUrl(token) });
}

app.get('/api/health', (_req, res) => res.json({ ok: true, emailConfigured: Boolean(process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) }));

app.post('/api/registrations', asyncRoute(async (req, res) => {
  const data = validateRegistration(req.body);
  if (db.prepare('SELECT 1 FROM companies WHERE email=? COLLATE NOCASE').get(data.email)) throw new InputError('This email already has a registration. Try signing in or request a new verification email.', 409);
  const id = newId(); const otp = newOtp(); const sentAt = now();
  const create = db.transaction(() => {
    db.prepare(`INSERT INTO companies (id,company_name,pan,msme,address1,address2,country,country_code,state,city,postal,contact_name,email,phone_e164,created_at)
      VALUES (@id,@companyName,@pan,@msme,@address1,@address2,@country,@countryCode,@state,@city,@postal,@contactName,@email,@phone, @createdAt)`).run({ ...data, id, createdAt: isoNow() });
    db.prepare(`INSERT INTO otp_challenges (company_id,otp_hash,expires_at,attempts,resend_count,resend_window_started_at,last_sent_at)
      VALUES (?,?,?,0,0,?,?)`).run(id, hashOtp(otp).toString('hex'), sentAt + otpLifeMs, sentAt, sentAt);
  });
  create();
  let emailDelivery = 'sent';
  try { await sendOtpEmail({ to: data.email, contactName: data.contactName, companyName: data.companyName, otp }); }
  catch { emailDelivery = 'failed'; }
  res.status(201).json({ registrationId: id, emailDelivery, message: emailDelivery === 'sent' ? 'Verification code sent.' : 'Registration saved, but the verification email could not be sent. You can retry shortly.' });
}));

app.post('/api/registrations/:id/resend-otp', asyncRoute(async (req, res) => {
  const id = req.params.id;
  const record = db.prepare(`SELECT c.email,c.contact_name,c.company_name,c.status,o.* FROM companies c
    JOIN otp_challenges o ON o.company_id=c.id WHERE c.id=?`).get(id);
  if (!record || record.status !== 'PENDING') throw new InputError('Registration is unavailable for verification.', 404);
  const current = now();
  if (current - record.last_sent_at < resendCooldownMs) throw new InputError('Wait before requesting another code.', 429);
  const resetWindow = current - record.resend_window_started_at >= resendWindowMs;
  const start = resetWindow ? current : record.resend_window_started_at;
  const count = resetWindow ? 1 : record.resend_count + 1;
  if (count > maxResends) throw new InputError('The resend limit has been reached. Try again later.', 429);
  const otp = newOtp();
  db.prepare(`UPDATE otp_challenges SET otp_hash=?,expires_at=?,attempts=0,resend_count=?,resend_window_started_at=?,last_sent_at=? WHERE company_id=?`)
    .run(hashOtp(otp).toString('hex'), current + otpLifeMs, count, start, current, id);
  try { await sendOtpEmail({ to: record.email, contactName: record.contact_name, companyName: record.company_name, otp }); }
  catch { return res.status(502).json({ error: 'A new code was prepared, but email delivery failed. Retry after the cooldown.' }); }
  res.json({ emailDelivery: 'sent', message: 'A new verification code was sent.' });
}));

app.post('/api/registrations/:id/verify-email', asyncRoute(async (req, res) => {
  const { otp } = req.body || {};
  if (typeof otp !== 'string' || !/^\d{6}$/.test(otp)) throw new InputError('Enter the six-digit verification code.');
  const challenge = db.prepare(`SELECT c.id,c.status,c.email,c.contact_name,c.company_name,o.otp_hash,o.expires_at,o.attempts
    FROM companies c JOIN otp_challenges o ON o.company_id=c.id WHERE c.id=?`).get(req.params.id);
  if (!challenge || challenge.status !== 'PENDING') throw new InputError('Registration is unavailable or already verified.', 409);
  if (challenge.expires_at <= now()) throw new InputError('This code expired. Request another code.', 410);
  if (challenge.attempts >= maxAttempts) throw new InputError('Too many incorrect attempts. Request a new code.', 429);
  if (!otpMatches(otp, challenge.otp_hash)) {
    db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE company_id=? AND attempts<?').run(challenge.id, maxAttempts);
    throw new InputError('That verification code is incorrect.', 400);
  }
  const userId = newUserId(); const setupToken = newSecret(32); const verifiedAt = isoNow();
  const finish = db.transaction(() => {
    db.prepare(`UPDATE companies SET status='VERIFIED',verified_at=? WHERE id=?`).run(verifiedAt, challenge.id);
    db.prepare('DELETE FROM otp_challenges WHERE company_id=?').run(challenge.id);
    db.prepare(`INSERT INTO users (id,company_id,user_id,setup_token_hash,setup_expires_at,created_at) VALUES (?,?,?,?,?,?)`)
      .run(newId(), challenge.id, userId, sha256(setupToken), now() + setupLifeMs, verifiedAt);
  });
  finish();
  let emailDelivery = 'sent';
  try { await sendSetupEmail({ to: challenge.email, contactName: challenge.contact_name, companyName: challenge.company_name, userId, setupUrl: setupUrl(setupToken) }); }
  catch { emailDelivery = 'failed'; }
  res.json({ verified: true, userId, emailDelivery, message: emailDelivery === 'sent' ? 'Email verified. Check your email to set a password.' : 'Email verified. The password setup email could not be sent; retry delivery.' });
}));

app.post('/api/registrations/:id/resend-setup', asyncRoute(async (req, res) => {
  const record = db.prepare('SELECT u.id FROM users u WHERE u.company_id=? AND u.password_hash IS NULL').get(req.params.id);
  if (!record) throw new InputError('Password setup is unavailable for this registration.', 409);
  try { await sendSetupFor(req.params.id); }
  catch (error) { if (error instanceof InputError) throw error; return res.status(502).json({ error: 'Password setup email could not be sent. Try again later.' }); }
  res.json({ emailDelivery: 'sent', message: 'A new password setup link was sent.' });
}));

app.post('/api/auth/setup-password', asyncRoute(async (req, res) => {
  const { token, password, confirmation } = req.body || {};
  if (typeof token !== 'string' || token.length < 30) throw new InputError('This password setup link is invalid or expired.', 410);
  if (!validatePassword(password)) throw new InputError('Use at least 12 characters with uppercase, lowercase, a number and a special character.');
  if (password !== confirmation) throw new InputError('The password confirmation does not match.');
  const user = db.prepare(`SELECT u.id,u.user_id,u.company_id,c.email,c.contact_name FROM users u JOIN companies c ON c.id=u.company_id
    WHERE u.setup_token_hash=? AND u.setup_expires_at>? AND u.password_hash IS NULL`).get(sha256(token), now());
  if (!user) throw new InputError('This password setup link is invalid or expired.', 410);
  const hash = await hashPassword(password);
  const used = db.prepare(`UPDATE users SET password_hash=?,setup_token_hash=NULL,setup_expires_at=NULL,password_changed_at=?
    WHERE id=? AND setup_token_hash=? AND setup_expires_at>? AND password_hash IS NULL`).run(hash, isoNow(), user.id, sha256(token), now());
  if (!used.changes) throw new InputError('This password setup link has already been used.', 410);
  res.json({ setup: true, userId: user.user_id });
}));

app.post('/api/auth/login', asyncRoute(async (req, res) => {
  const userId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  const user = db.prepare(`SELECT u.id,u.user_id,u.password_hash FROM users u WHERE u.user_id=? COLLATE NOCASE`).get(userId);
  const valid = Boolean(user?.password_hash && password && await verifyPassword(user.password_hash, password).catch(() => false));
  if (!valid) throw new InputError('The User ID or password is incorrect.', 401);
  const token = newSecret(32); const expiresAt = now() + sessionLifeMs;
  db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha256(token), user.id, expiresAt, isoNow());
  res.setHeader('Set-Cookie', `${cookieName}=${encodeURIComponent(token)}; ${cookieOptions}`);
  res.json({ authenticated: true, userId: user.user_id, expiresAt: new Date(expiresAt).toISOString() });
}));

app.get('/api/auth/session', requireAuth, (req, res) => res.json({ authenticated: true, userId: req.session.user_id }));

app.post('/api/auth/logout', (req, res) => {
  const token = readCookie(req, cookieName);
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha256(token));
  res.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
  res.json({ loggedOut: true });
});

app.get('/api/company/profile', requireAuth, (req, res) => {
  const company = db.prepare(`SELECT company_name AS companyName,pan,msme,address1,address2,country,country_code AS countryCode,state,city,postal,contact_name AS contactName,email,phone_e164 AS phone,created_at AS registeredAt,verified_at AS verifiedAt
    FROM companies WHERE id=?`).get(req.session.company_id);
  if (!company) return res.status(404).json({ error: 'Company profile not found.' });
  res.json({ company });
});

app.post('/api/auth/change-password', requireAuth, asyncRoute(async (req, res) => {
  const { currentPassword, newPassword, confirmation } = req.body || {};
  const user = db.prepare('SELECT id,password_hash FROM users WHERE id=?').get(req.session.account_id);
  if (!user?.password_hash || !await verifyPassword(user.password_hash, currentPassword || '').catch(() => false)) throw new InputError('Current password is incorrect.', 400);
  if (!validatePassword(newPassword)) throw new InputError('Use at least 12 characters with uppercase, lowercase, a number and a special character.');
  if (newPassword === currentPassword) throw new InputError('Your new password must be different from the current password.');
  if (newPassword !== confirmation) throw new InputError('The password confirmation does not match.');
  const hash = await hashPassword(newPassword); const changedAt = isoNow();
  db.prepare('UPDATE users SET password_hash=?,password_changed_at=? WHERE id=?').run(hash, changedAt, user.id);
  const company = db.prepare('SELECT email,contact_name FROM companies WHERE id=?').get(req.session.company_id);
  let notification = 'sent';
  try { await sendPasswordChangedEmail({ to: company.email, contactName: company.contact_name, changedAt }); } catch { notification = 'failed'; }
  res.json({ changed: true, notification });
}));

app.use((error, _req, res, _next) => {
  const status = Number(error.status) || (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500);
  if (status >= 500) console.error('OSF API request failed.');
  res.status(status).json({ error: status >= 500 ? 'The request could not be completed.' : error.message });
});

app.listen(port, () => console.log(`OSF API listening on port ${port}`));
