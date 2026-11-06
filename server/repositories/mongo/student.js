// MongoDB implementation of the STUDENT repository (DB_DRIVER=mongo). Same interface as sqlite/student.js.
// UNVERIFIED against a live cluster (none available when written) - reviewed by reasoning only.
// Documents keep the SQL column names; `_id` holds the SQL `id` string. Collections: student_users, student_otp_challenges,
// student_sessions, students, student_skills, student_projects.
//
// SHARED HELPER for other route groups (applications, talent, saved-students):
//   buildStudentProfile({ db }, studentId, { privateFields = false, includeResume = false } = {}) -> Promise<profile | undefined>
// (first arg is the connection object from connectMongo(), i.e. anything with `.db`), and bound on the repo as
// `student.buildStudentProfile(studentId, opts)` - identical to sqlite/student.js. Prefer the repo method. Same profile shape.
import { NOCASE } from './ensureIndexes.js';

const DUPLICATE = 11000;

async function listSkills(db, studentId) {
  const rows = await db.collection('student_skills').find({ student_id: studentId }, { projection: { skill: 1 } }).collation(NOCASE).sort({ skill: 1 }).toArray();
  return rows.map(row => row.skill);
}
async function listProjects(db, studentId) {
  const rows = await db.collection('student_projects').find({ student_id: studentId }).sort({ created_at: -1 }).toArray();
  return rows.map(r => ({ id: r._id, title: r.title, description: r.description, projectUrl: r.project_url, createdAt: r.created_at, updatedAt: r.updated_at }));
}
export async function buildStudentProfile({ db }, studentId, { privateFields = false, includeResume = false } = {}) {
  const s = await db.collection('students').findOne({ _id: studentId });
  if (!s) return undefined;
  const profile = { id: s._id, fullName: s.full_name };
  if (privateFields || includeResume) profile.resumeReference = s.resume_reference ?? null;
  Object.assign(profile, {
    profileImage: s.profile_image ?? null, college: s.college ?? null, degree: s.degree ?? null, graduationYear: s.graduation_year ?? null,
    about: s.about ?? null, githubUrl: s.github_url ?? null, linkedinUrl: s.linkedin_url ?? null, portfolioUrl: s.portfolio_url ?? null,
    location: s.location ?? null, createdAt: s.created_at, updatedAt: s.updated_at,
  });
  if (privateFields) profile.profileVisible = Boolean(s.profile_visible);
  profile.skills = await listSkills(db, studentId);
  profile.projects = await listProjects(db, studentId);
  return profile;
}

export function createStudentRepo(conn) {
  const { db, client, supportsTransactions } = conn;
  const users = db.collection('student_users');
  const otps = db.collection('student_otp_challenges');
  const sessions = db.collection('student_sessions');
  const students = db.collection('students');
  const skillsCol = db.collection('student_skills');
  const projects = db.collection('student_projects');

  // Multi-document transaction on a replica set; otherwise `fallback()` (conditional updates + compensation).
  async function atomic(tx, fallback) {
    if (!supportsTransactions) return fallback();
    const session = client.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await tx(session); });
      return result;
    } finally { await session.endSession(); }
  }
  const byEmail = { collation: NOCASE };

  return {
    buildStudentProfile: (studentId, opts) => buildStudentProfile(conn, studentId, opts),
    listSkills: studentId => listSkills(db, studentId),

    // ATOMIC (user + OTP). Returns false when the email already has an account (unique NOCASE index).
    async createAccount({ id, email, passwordHash, timestamp, otp }) {
      const user = { _id: id, email, password_hash: passwordHash, email_verified: 0, account_status: 'ACTIVE', password_created_at: timestamp, updated_at: timestamp, created_at: timestamp };
      const challenge = { student_user_id: id, otp_hash: otp.hash, expires_at: otp.expiresAt, attempts: 0, resend_count: 0, resend_window_started_at: otp.sentAt, last_sent_at: otp.sentAt };
      try {
        await atomic(async session => {
          await users.insertOne(user, { session });
          await otps.insertOne(challenge, { session });
        }, async () => {
          await users.insertOne(user);
          try { await otps.insertOne(challenge); } catch (error) { await users.deleteOne({ _id: id }); throw error; }
        });
        return true;
      } catch (error) {
        if (error?.code === DUPLICATE) return false;
        throw error;
      }
    },
    async getVerifyRecord(email) {
      const user = await users.findOne({ email }, byEmail);
      const o = user && await otps.findOne({ student_user_id: user._id });
      return o ? { id: user._id, email_verified: user.email_verified, otp_hash: o.otp_hash, expires_at: o.expires_at, attempts: o.attempts } : undefined;
    },
    async bumpOtpAttempts(userId, max) { await otps.updateOne({ student_user_id: userId, attempts: { $lt: max } }, { $inc: { attempts: 1 } }); },
    // ATOMIC: mark verified (only if still unverified) + drop the OTP. Fallback: the conditional update is atomic by itself;
    // a leftover OTP after a failed delete is harmless (verify-email rejects already-verified accounts).
    async completeVerification(userId, timestamp) {
      await atomic(async session => {
        await users.updateOne({ _id: userId }, { $set: { email_verified: 1, updated_at: timestamp } }, { session });
        await otps.deleteOne({ student_user_id: userId }, { session });
      }, async () => {
        await users.updateOne({ _id: userId }, { $set: { email_verified: 1, updated_at: timestamp } });
        await otps.deleteOne({ student_user_id: userId });
      });
    },
    async getResendRecord(email) {
      const user = await users.findOne({ email, email_verified: 0, account_status: 'ACTIVE' }, byEmail);
      const o = user && await otps.findOne({ student_user_id: user._id });
      return o ? { id: user._id, email: user.email, resend_count: o.resend_count, resend_window_started_at: o.resend_window_started_at, last_sent_at: o.last_sent_at } : undefined;
    },
    async replaceOtp(userId, { hash, expiresAt, count, windowStart, sentAt }) {
      await otps.updateOne({ student_user_id: userId }, { $set: { otp_hash: hash, expires_at: expiresAt, attempts: 0, resend_count: count, resend_window_started_at: windowStart, last_sent_at: sentAt } });
    },

    async findLoginUser(email) {
      const u = await users.findOne({ email }, byEmail);
      return u ? { id: u._id, email: u.email, password_hash: u.password_hash, account_status: u.account_status, email_verified: u.email_verified } : undefined;
    },
    async createSession({ tokenHash, userId, expiresAt, createdAt }) {
      await sessions.insertOne({ token_hash: tokenHash, student_user_id: userId, expires_at: expiresAt, expires_at_date: new Date(expiresAt), created_at: createdAt });
    },
    async findSession(tokenHash) {
      const ss = await sessions.findOne({ token_hash: tokenHash });
      const user = ss && await users.findOne({ _id: ss.student_user_id });
      if (!user) return undefined;
      const s = await students.findOne({ account_id: user._id }, { projection: { _id: 1 } });
      return { token_hash: ss.token_hash, expires_at: ss.expires_at, account_id: user._id, email: user.email, student_id: s?._id ?? null };
    },
    async deleteSession(tokenHash) { await sessions.deleteOne({ token_hash: tokenHash }); },
    async isAccountActive(accountId) { return Boolean(await users.findOne({ _id: accountId, account_status: 'ACTIVE' }, { projection: { _id: 1 } })); },
    async deleteAllSessions(accountId) { await sessions.deleteMany({ student_user_id: accountId }); },

    async getPasswordHash(accountId) { return (await users.findOne({ _id: accountId }, { projection: { password_hash: 1 } }))?.password_hash; },
    // ATOMIC: new hash + drop other sessions. Fallback: hash first, then sessions (a crash between leaves old sessions alive
    // for up to their 12h life but the password is already changed - fails safe for the new credential).
    async changePassword(accountId, hash, timestamp, keepTokenHash) {
      const set = { $set: { password_hash: hash, password_created_at: timestamp, updated_at: timestamp } };
      const others = { student_user_id: accountId, token_hash: { $ne: keepTokenHash } };
      await atomic(async session => {
        await users.updateOne({ _id: accountId }, set, { session });
        await sessions.deleteMany(others, { session });
      }, async () => {
        await users.updateOne({ _id: accountId }, set);
        await sessions.deleteMany(others);
      });
    },

    async findResetUser(email) {
      const u = await users.findOne({ email, email_verified: 1, account_status: 'ACTIVE' }, byEmail);
      return u ? { id: u._id, email: u.email } : undefined;
    },
    async getOtpLastSent(userId) {
      const o = await otps.findOne({ student_user_id: userId }, { projection: { last_sent_at: 1 } });
      return o ? { last_sent_at: o.last_sent_at } : undefined;
    },
    // Upsert: on an existing challenge only the code/expiry/attempts/last_sent change (resend counters untouched), like the SQL ON CONFLICT.
    async upsertResetOtp(userId, { hash, expiresAt, now }) {
      await otps.updateOne({ student_user_id: userId },
        { $set: { otp_hash: hash, expires_at: expiresAt, attempts: 0, last_sent_at: now }, $setOnInsert: { resend_count: 0, resend_window_started_at: now } },
        { upsert: true });
    },
    async getResetRecord(email) {
      const user = await users.findOne({ email, email_verified: 1, account_status: 'ACTIVE' }, byEmail);
      const o = user && await otps.findOne({ student_user_id: user._id });
      return o ? { id: user._id, otp_hash: o.otp_hash, expires_at: o.expires_at, attempts: o.attempts } : undefined;
    },
    // ATOMIC: new hash + drop OTP + drop all sessions. Fallback order: hash, sessions, then OTP last (OTP is the single-use
    // credential - if an earlier step fails it stays valid so the user can retry; a repeat attempt is idempotent).
    async resetPassword(userId, hash, timestamp) {
      const set = { $set: { password_hash: hash, password_created_at: timestamp, updated_at: timestamp } };
      await atomic(async session => {
        await users.updateOne({ _id: userId }, set, { session });
        await otps.deleteOne({ student_user_id: userId }, { session });
        await sessions.deleteMany({ student_user_id: userId }, { session });
      }, async () => {
        await users.updateOne({ _id: userId }, set);
        await sessions.deleteMany({ student_user_id: userId });
        await otps.deleteOne({ student_user_id: userId });
      });
    },

    // ATOMIC create-or-update of the profile + skill replacement. Fallback: profile upsert first, then skills replaced
    // (delete + insert); a crash between leaves a profile with stale/missing skills which the next save repairs.
    async saveProfile({ studentId, accountId, newStudentId, newSkillId, values, skills, timestamp }) {
      const fields = {
        full_name: values.fullName, profile_image: values.profileImage, college: values.college, degree: values.degree, graduation_year: values.graduationYear,
        about: values.about, resume_reference: values.resumeReference, github_url: values.githubUrl, linkedin_url: values.linkedinUrl,
        portfolio_url: values.portfolioUrl, location: values.location, updated_at: timestamp,
      };
      const id = studentId || newStudentId;
      const skillDocs = skills.map(skill => ({ _id: newSkillId(), student_id: id, skill, created_at: timestamp }));
      const write = async session => {
        const opt = session ? { session } : {};
        if (!studentId) {
          await students.insertOne({ _id: id, account_id: accountId, ...fields, profile_visible: values.profileVisible ?? 1, created_at: timestamp }, opt);
        } else {
          await students.updateOne({ _id: id }, { $set: { ...fields, ...(values.profileVisible == null ? {} : { profile_visible: values.profileVisible }) } }, opt);
        }
        await skillsCol.deleteMany({ student_id: id }, opt);
        if (skillDocs.length) await skillsCol.insertMany(skillDocs, opt);
      };
      await atomic(write, () => write(null));
      return id;
    },

    async createProject({ id, studentId, title, description, projectUrl, timestamp }) {
      await projects.insertOne({ _id: id, student_id: studentId, title, description, project_url: projectUrl, created_at: timestamp, updated_at: timestamp });
      return { id, title, description, projectUrl, createdAt: timestamp, updatedAt: timestamp };
    },
    async projectOwned(id, studentId) { return Boolean(await projects.findOne({ _id: id, student_id: studentId }, { projection: { _id: 1 } })); },
    async updateProject({ id, studentId, title, description, projectUrl, timestamp }) {
      const r = await projects.findOneAndUpdate({ _id: id, student_id: studentId },
        { $set: { title, description, project_url: projectUrl, updated_at: timestamp } }, { returnDocument: 'after' });
      const p = r?.value !== undefined ? r.value : r; // driver v5 returns { value }, v6+ returns the document
      return p ? { id: p._id, title: p.title, description: p.description, projectUrl: p.project_url, createdAt: p.created_at, updatedAt: p.updated_at } : undefined;
    },
    async deleteProject(id, studentId) { return (await projects.deleteOne({ _id: id, student_id: studentId })).deletedCount > 0; },
  };
}
