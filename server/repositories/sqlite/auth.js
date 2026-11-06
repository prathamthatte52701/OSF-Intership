// SQLite implementation of the company-auth repository (default driver).
// Interface: every method is async and returns plain objects with the SQL column names
// (snake_case) so route code is identical for all drivers. See repositories/index.js.
const PROFILE_SQL = `SELECT c.company_name AS companyName,c.pan,c.msme,c.address1,c.address2,c.country,c.country_code AS countryCode,c.state,c.city,c.postal,c.contact_name AS contactName,c.email,c.phone_e164 AS phone,c.created_at AS registeredAt,u.email_verified AS emailVerified
    FROM companies c JOIN users u ON u.company_id=c.id WHERE c.id=? AND u.id=?`;
const SETUP_ELIGIBLE = `c.status='VERIFIED' AND u.email_verified=1 AND u.password_setup_status='PENDING' AND u.must_change_password=1 AND u.password_hash IS NULL`;

export function createAuthRepo(db) {
  return {
    async emailExists(email) { return Boolean(db.prepare('SELECT 1 FROM companies WHERE email=? COLLATE NOCASE').get(email)); },

    async createRegistration(data, id, createdAt, otp) {
      db.transaction(() => {
        db.prepare(`INSERT INTO companies (id,company_name,pan,msme,address1,address2,country,country_code,state,city,postal,contact_name,email,phone_e164,created_at)
          VALUES (@id,@companyName,@pan,@msme,@address1,@address2,@country,@countryCode,@state,@city,@postal,@contactName,@email,@phone, @createdAt)`).run({ ...data, id, createdAt });
        db.prepare(`INSERT INTO otp_challenges (company_id,otp_hash,expires_at,attempts,resend_count,resend_window_started_at,last_sent_at)
          VALUES (?,?,?,0,0,?,?)`).run(id, otp.hash, otp.expiresAt, otp.sentAt, otp.sentAt);
      })();
    },

    // Company + OTP challenge joined (resend-otp and verify-email read the same shape).
    async getOtpRecord(companyId) {
      return db.prepare(`SELECT c.id,c.email,c.contact_name,c.company_name,c.status,o.otp_hash,o.expires_at,o.attempts,o.resend_count,o.resend_window_started_at,o.last_sent_at
        FROM companies c JOIN otp_challenges o ON o.company_id=c.id WHERE c.id=?`).get(companyId);
    },
    async replaceOtp(companyId, { hash, expiresAt, count, windowStart, sentAt }) {
      db.prepare(`UPDATE otp_challenges SET otp_hash=?,expires_at=?,attempts=0,resend_count=?,resend_window_started_at=?,last_sent_at=? WHERE company_id=?`)
        .run(hash, expiresAt, count, windowStart, sentAt, companyId);
    },
    async bumpOtpAttempts(companyId, max) {
      db.prepare('UPDATE otp_challenges SET attempts=attempts+1 WHERE company_id=? AND attempts<?').run(companyId, max);
    },

    // ATOMIC: mark VERIFIED + drop the OTP + create the login user. Returns false if another request won.
    async completeVerification({ companyId, verifiedAt, userRowId, userId, setupTokenHash, verifiedTime, setupLifeMs }) {
      return db.transaction(() => {
        const claimed = db.prepare(`UPDATE companies SET status='VERIFIED',verified_at=? WHERE id=? AND status='PENDING'`).run(verifiedAt, companyId);
        if (!claimed.changes) return false;
        db.prepare('DELETE FROM otp_challenges WHERE company_id=?').run(companyId);
        db.prepare(`INSERT INTO users (id,company_id,user_id,setup_token_hash,setup_expires_at,created_at,email_verified,must_change_password,password_setup_status,setup_resend_count,setup_resend_window_started_at,setup_last_sent_at)
          VALUES (?,?,?,?,?,?,1,1,'PENDING',0,?,?)`)
          .run(userRowId, companyId, userId, setupTokenHash, verifiedTime + setupLifeMs, verifiedAt, verifiedTime, verifiedTime);
        return true;
      })();
    },

    async hasPendingSetupUser(companyId) { return Boolean(db.prepare('SELECT u.id FROM users u WHERE u.company_id=? AND u.password_hash IS NULL').get(companyId)); },
    async findSetupEligibleCompanyIdByEmail(email) {
      return db.prepare(`SELECT c.id FROM companies c JOIN users u ON u.company_id=c.id WHERE c.email=? COLLATE NOCASE AND ${SETUP_ELIGIBLE}`).get(email)?.id ?? null;
    },
    async getSetupCandidate(companyId) {
      return db.prepare(`SELECT c.email,c.contact_name,c.company_name,u.id,u.user_id,u.setup_resend_count,u.setup_resend_window_started_at,u.setup_last_sent_at
        FROM companies c JOIN users u ON u.company_id=c.id WHERE c.id=? AND ${SETUP_ELIGIBLE}`).get(companyId);
    },
    // Optimistic: succeeds only if setup_last_sent_at is unchanged since getSetupCandidate (replaces the old read+write transaction).
    async updateSetupToken(userRowId, expectedLastSentAt, { tokenHash, expiresAt, count, windowStart, sentAt }) {
      const r = count == null
        ? db.prepare('UPDATE users SET setup_token_hash=?,setup_expires_at=?,setup_last_sent_at=? WHERE id=? AND setup_last_sent_at=?').run(tokenHash, expiresAt, sentAt, userRowId, expectedLastSentAt)
        : db.prepare('UPDATE users SET setup_token_hash=?,setup_expires_at=?,setup_resend_count=?,setup_resend_window_started_at=?,setup_last_sent_at=? WHERE id=? AND setup_last_sent_at=?')
          .run(tokenHash, expiresAt, count, windowStart, sentAt, userRowId, expectedLastSentAt);
      return r.changes > 0;
    },

    async findUserBySetupToken(tokenHash, nowMs) {
      return db.prepare(`SELECT u.id,u.user_id,u.company_id,c.email,c.contact_name FROM users u JOIN companies c ON c.id=u.company_id
        WHERE u.setup_token_hash=? AND u.setup_expires_at>? AND u.password_hash IS NULL AND u.email_verified=1
          AND u.password_setup_status='PENDING' AND u.must_change_password=1`).get(tokenHash, nowMs);
    },
    async completePasswordSetup(userRowId, tokenHash, nowMs, passwordHash, changedAt) {
      return db.prepare(`UPDATE users SET password_hash=?,setup_token_hash=NULL,setup_expires_at=NULL,password_changed_at=?,password_setup_status='COMPLETED',must_change_password=0
        WHERE id=? AND setup_token_hash=? AND setup_expires_at>? AND password_hash IS NULL AND email_verified=1
          AND password_setup_status='PENDING' AND must_change_password=1`).run(passwordHash, changedAt, userRowId, tokenHash, nowMs).changes > 0;
    },

    async findUserByUserId(userId) { return db.prepare('SELECT u.id,u.user_id,u.password_hash FROM users u WHERE u.user_id=? COLLATE NOCASE').get(userId); },
    async getUserById(id) { return db.prepare('SELECT id,password_hash FROM users WHERE id=?').get(id); },
    async setPassword(userRowId, hash, changedAt) { db.prepare('UPDATE users SET password_hash=?,password_changed_at=? WHERE id=?').run(hash, changedAt, userRowId); },

    async createSession({ tokenHash, userRowId, expiresAt, createdAt }) {
      db.prepare('INSERT INTO sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(tokenHash, userRowId, expiresAt, createdAt);
    },
    async findSession(tokenHash) {
      return db.prepare(`SELECT s.token_hash, s.expires_at, u.id AS account_id, u.user_id, c.id AS company_id, c.email
        FROM sessions s JOIN users u ON u.id=s.user_id JOIN companies c ON c.id=u.company_id WHERE s.token_hash=?`).get(tokenHash);
    },
    async deleteSession(tokenHash) { db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash); },

    async getProfile(companyId, accountId) { return db.prepare(PROFILE_SQL).get(companyId, accountId); },
    async getCompanyLocation(companyId) { return db.prepare('SELECT email,country,country_code FROM companies WHERE id=?').get(companyId); },
    async getCompanyContact(companyId) { return db.prepare('SELECT email,contact_name FROM companies WHERE id=?').get(companyId); },
    async updateProfile(companyId, d) {
      db.prepare(`UPDATE companies SET company_name=?,pan=?,msme=?,address1=?,address2=?,country='India',country_code='IN',state=?,city=?,postal=?,contact_name=?,phone_e164=? WHERE id=?`)
        .run(d.companyName, d.pan || null, d.msme || null, d.address1, d.address2 || null, d.state, d.city, d.postal, d.contactName, d.phone || null, companyId);
    },
  };
}
