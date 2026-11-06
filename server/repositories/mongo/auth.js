// MongoDB implementation of the company-auth repository (DB_DRIVER=mongo). Same interface as sqlite/auth.js.
// UNVERIFIED against a live cluster (none available when written) - reviewed by reasoning only.
import { NOCASE } from './ensureIndexes.js';

const SETUP_ELIGIBLE = { email_verified: 1, password_setup_status: 'PENDING', must_change_password: 1, password_hash: null };

export function createAuthRepo({ db, client, supportsTransactions }) {
  const companies = db.collection('companies');
  const users = db.collection('users');
  const otps = db.collection('otp_challenges');
  const sessions = db.collection('sessions');

  // Runs `tx(session)` in a multi-document transaction on a replica set; otherwise runs `fallback()`,
  // which must be safe without transactions (conditional updates + compensation on failure).
  async function atomic(tx, fallback) {
    if (!supportsTransactions) return fallback();
    const session = client.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await tx(session); });
      return result;
    } finally { await session.endSession(); }
  }

  return {
    async emailExists(email) { return Boolean(await companies.findOne({ email }, { collation: NOCASE, projection: { _id: 1 } })); },

    // ATOMIC (company + OTP). Fallback: insert company, then OTP; delete the company if the OTP insert fails.
    async createRegistration(data, id, createdAt, otp) {
      const company = {
        _id: id, company_name: data.companyName, pan: data.pan ?? null, msme: data.msme ?? null, address1: data.address1, address2: data.address2 ?? null,
        country: data.country, country_code: data.countryCode, state: data.state ?? null, city: data.city, postal: data.postal ?? null,
        contact_name: data.contactName, email: data.email, phone_e164: data.phone ?? null, status: 'PENDING', created_at: createdAt, verified_at: null,
      };
      const challenge = { company_id: id, otp_hash: otp.hash, expires_at: otp.expiresAt, attempts: 0, resend_count: 0, resend_window_started_at: otp.sentAt, last_sent_at: otp.sentAt };
      await atomic(async session => {
        await companies.insertOne(company, { session });
        await otps.insertOne(challenge, { session });
      }, async () => {
        await companies.insertOne(company); // unique email index -> E11000 -> 409 in the error handler
        try { await otps.insertOne(challenge); } catch (error) { await companies.deleteOne({ _id: id }); throw error; }
      });
    },

    async getOtpRecord(companyId) {
      const company = await companies.findOne({ _id: companyId });
      const otp = company && await otps.findOne({ company_id: companyId });
      if (!company || !otp) return undefined;
      return { id: company._id, email: company.email, contact_name: company.contact_name, company_name: company.company_name, status: company.status,
        otp_hash: otp.otp_hash, expires_at: otp.expires_at, attempts: otp.attempts, resend_count: otp.resend_count,
        resend_window_started_at: otp.resend_window_started_at, last_sent_at: otp.last_sent_at };
    },
    async replaceOtp(companyId, { hash, expiresAt, count, windowStart, sentAt }) {
      await otps.updateOne({ company_id: companyId }, { $set: { otp_hash: hash, expires_at: expiresAt, attempts: 0, resend_count: count, resend_window_started_at: windowStart, last_sent_at: sentAt } });
    },
    async bumpOtpAttempts(companyId, max) {
      await otps.updateOne({ company_id: companyId, attempts: { $lt: max } }, { $inc: { attempts: 1 } });
    },

    // ATOMIC: claim PENDING->VERIFIED, delete OTP, insert user. Returns false when another request already verified.
    // Fallback: the conditional claim (status:'PENDING') is itself atomic, so only one request proceeds; if the user insert
    // fails afterwards, the claim is reverted so the registration can be retried.
    async completeVerification({ companyId, verifiedAt, userRowId, userId, setupTokenHash, verifiedTime, setupLifeMs }) {
      const user = {
        _id: userRowId, company_id: companyId, user_id: userId, password_hash: null, setup_token_hash: setupTokenHash, setup_expires_at: verifiedTime + setupLifeMs,
        password_changed_at: null, created_at: verifiedAt, email_verified: 1, must_change_password: 1, password_setup_status: 'PENDING',
        setup_resend_count: 0, setup_resend_window_started_at: verifiedTime, setup_last_sent_at: verifiedTime,
      };
      const claim = { _id: companyId, status: 'PENDING' };
      return atomic(async session => {
        const claimed = await companies.updateOne(claim, { $set: { status: 'VERIFIED', verified_at: verifiedAt } }, { session });
        if (!claimed.matchedCount) return false;
        await otps.deleteOne({ company_id: companyId }, { session });
        await users.insertOne(user, { session });
        return true;
      }, async () => {
        const claimed = await companies.findOneAndUpdate(claim, { $set: { status: 'VERIFIED', verified_at: verifiedAt } });
        if (!claimed) return false;
        try {
          await users.insertOne(user);
        } catch (error) {
          await companies.updateOne({ _id: companyId }, { $set: { status: 'PENDING', verified_at: null } });
          throw error;
        }
        await otps.deleteOne({ company_id: companyId }); // after the user exists; a leftover OTP is harmless (status is VERIFIED)
        return true;
      });
    },

    async hasPendingSetupUser(companyId) { return Boolean(await users.findOne({ company_id: companyId, password_hash: null }, { projection: { _id: 1 } })); },
    async findSetupEligibleCompanyIdByEmail(email) {
      const company = await companies.findOne({ email, status: 'VERIFIED' }, { collation: NOCASE, projection: { _id: 1 } });
      if (!company) return null;
      return (await users.findOne({ company_id: company._id, ...SETUP_ELIGIBLE }, { projection: { _id: 1 } })) ? company._id : null;
    },
    async getSetupCandidate(companyId) {
      const company = await companies.findOne({ _id: companyId, status: 'VERIFIED' });
      const user = company && await users.findOne({ company_id: companyId, ...SETUP_ELIGIBLE });
      if (!user) return undefined;
      return { email: company.email, contact_name: company.contact_name, company_name: company.company_name, id: user._id, user_id: user.user_id,
        setup_resend_count: user.setup_resend_count, setup_resend_window_started_at: user.setup_resend_window_started_at, setup_last_sent_at: user.setup_last_sent_at };
    },
    async updateSetupToken(userRowId, expectedLastSentAt, { tokenHash, expiresAt, count, windowStart, sentAt }) {
      const set = { setup_token_hash: tokenHash, setup_expires_at: expiresAt, setup_last_sent_at: sentAt };
      if (count != null) Object.assign(set, { setup_resend_count: count, setup_resend_window_started_at: windowStart });
      return (await users.updateOne({ _id: userRowId, setup_last_sent_at: expectedLastSentAt }, { $set: set })).matchedCount > 0;
    },

    async findUserBySetupToken(tokenHash, nowMs) {
      const user = await users.findOne({ setup_token_hash: tokenHash, setup_expires_at: { $gt: nowMs }, ...SETUP_ELIGIBLE });
      const company = user && await companies.findOne({ _id: user.company_id });
      return user && company ? { id: user._id, user_id: user.user_id, company_id: user.company_id, email: company.email, contact_name: company.contact_name } : undefined;
    },
    async completePasswordSetup(userRowId, tokenHash, nowMs, passwordHash, changedAt) {
      const r = await users.updateOne(
        { _id: userRowId, setup_token_hash: tokenHash, setup_expires_at: { $gt: nowMs }, ...SETUP_ELIGIBLE },
        { $set: { password_hash: passwordHash, setup_token_hash: null, setup_expires_at: null, password_changed_at: changedAt, password_setup_status: 'COMPLETED', must_change_password: 0 } });
      return r.matchedCount > 0;
    },

    async findUserByUserId(userId) {
      const u = await users.findOne({ user_id: userId }, { collation: NOCASE });
      return u ? { id: u._id, user_id: u.user_id, password_hash: u.password_hash } : undefined;
    },
    async getUserById(id) { const u = await users.findOne({ _id: id }); return u ? { id: u._id, password_hash: u.password_hash } : undefined; },
    async setPassword(userRowId, hash, changedAt) { await users.updateOne({ _id: userRowId }, { $set: { password_hash: hash, password_changed_at: changedAt } }); },

    async createSession({ tokenHash, userRowId, expiresAt, createdAt }) {
      await sessions.insertOne({ token_hash: tokenHash, user_id: userRowId, expires_at: expiresAt, expires_at_date: new Date(expiresAt), created_at: createdAt });
    },
    async findSession(tokenHash) {
      const s = await sessions.findOne({ token_hash: tokenHash });
      const user = s && await users.findOne({ _id: s.user_id });
      const company = user && await companies.findOne({ _id: user.company_id });
      return company ? { token_hash: s.token_hash, expires_at: s.expires_at, account_id: user._id, user_id: user.user_id, company_id: company._id, email: company.email } : undefined;
    },
    async deleteSession(tokenHash) { await sessions.deleteOne({ token_hash: tokenHash }); },

    async getProfile(companyId, accountId) {
      const user = await users.findOne({ _id: accountId, company_id: companyId });
      const c = user && await companies.findOne({ _id: companyId });
      if (!c) return undefined;
      return { companyName: c.company_name, pan: c.pan, msme: c.msme, address1: c.address1, address2: c.address2, country: c.country, countryCode: c.country_code,
        state: c.state, city: c.city, postal: c.postal, contactName: c.contact_name, email: c.email, phone: c.phone_e164, registeredAt: c.created_at, emailVerified: user.email_verified };
    },
    async getCompanyLocation(companyId) { const c = await companies.findOne({ _id: companyId }); return c ? { email: c.email, country: c.country, country_code: c.country_code } : undefined; },
    async getCompanyContact(companyId) { const c = await companies.findOne({ _id: companyId }); return c ? { email: c.email, contact_name: c.contact_name } : undefined; },
    async updateProfile(companyId, d) {
      await companies.updateOne({ _id: companyId }, { $set: {
        company_name: d.companyName, pan: d.pan || null, msme: d.msme || null, address1: d.address1, address2: d.address2 || null, country: 'India', country_code: 'IN',
        state: d.state, city: d.city, postal: d.postal, contact_name: d.contactName, phone_e164: d.phone || null } });
    },
  };
}
