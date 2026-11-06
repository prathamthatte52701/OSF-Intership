import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { sha256, cookieValue } from './security.js';

const windowMs = 15 * 60 * 1000;
const sessionCookies = ['osf_session', 'osf_student_session'];
// Health and the two session-check routes must never be throttled (the SPA calls them on every page load).
const exemptPaths = new Set(['/api/health', '/api/auth/session', '/api/student/auth/session']);

export function sendTooMany(res, retryAfterSeconds, message = 'Too many requests. Please try again later.') {
  const seconds = Math.max(1, Math.ceil(retryAfterSeconds));
  res.set('Retry-After', String(seconds));
  return res.status(429).json({ error: message });
}

// General limiter: signed-in callers get a per-session bucket (hashed cookie), anonymous callers a per-IP bucket.
function bucket(req) {
  const token = sessionCookies.map(name => cookieValue(req, name)).find(Boolean);
  return token ? { key: `s:${sha256(token)}`, limit: 600 } : { key: `ip:${ipKeyGenerator(req.ip || '')}`, limit: 100 };
}
export const generalLimiter = rateLimit({
  windowMs, standardHeaders: 'draft-8', legacyHeaders: false,
  limit: req => bucket(req).limit,
  keyGenerator: req => bucket(req).key,
  skip: req => exemptPaths.has(req.originalUrl.split('?')[0]),
  handler: (req, res) => sendTooMany(res, (req.rateLimit.resetTime - Date.now()) / 1000),
});

// Failed-login limiter, keyed by IP + attempted identifier. Counts failures only; success clears the key.
// ponytail: in-memory, single process; move to a shared store if the API is ever scaled out.
export function createFailedLoginLimiter({ limit = 10, windowLengthMs = windowMs } = {}) {
  const entries = new Map();
  const keyFor = (req, identifier) => `${ipKeyGenerator(req.ip || '')}|${String(identifier).trim().toLowerCase().slice(0, 254)}`;
  const live = key => {
    const entry = entries.get(key);
    if (entry && entry.resetAt <= Date.now()) { entries.delete(key); return null; }
    return entry || null;
  };
  return {
    /** Seconds the caller must wait, or 0 when the attempt may proceed. */
    blockedFor(req, identifier) {
      const entry = live(keyFor(req, identifier));
      return entry && entry.count >= limit ? Math.ceil((entry.resetAt - Date.now()) / 1000) : 0;
    },
    fail(req, identifier) {
      const key = keyFor(req, identifier);
      const entry = live(key) || { count: 0, resetAt: Date.now() + windowLengthMs };
      entry.count += 1;
      entries.set(key, entry);
      if (entries.size > 10_000) for (const [k, v] of entries) if (v.resetAt <= Date.now()) entries.delete(k);
    },
    reset(req, identifier) { entries.delete(keyFor(req, identifier)); },
  };
}
export const failedLoginLimiter = createFailedLoginLimiter();
export const loginBlockedMessage = 'Too many failed sign-in attempts. Please try again later.';
