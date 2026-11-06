// SQLite implementation of the STUDENT repository (default driver). Same interface as mongo/student.js.
// All methods are async and return plain objects with SQL column names (snake_case) except profile views (camelCase).
//
// SHARED HELPER for other route groups (applications, talent, saved-students):
//   buildStudentProfile(db, studentId, { privateFields = false, includeResume = false } = {}) -> Promise<profile | undefined>
// and the same thing bound on the repo: `student.buildStudentProfile(studentId, opts)` (identical in the mongo driver, where the
// module-level function takes the connection object `{ db }` instead of a better-sqlite3 handle). Prefer the repo method.
// Profile shape: { id, fullName, [resumeReference if privateFields||includeResume], profileImage, college, degree, graduationYear,
//   about, githubUrl, linkedinUrl, portfolioUrl, location, createdAt, updatedAt, [profileVisible:boolean if privateFields],
//   skills: string[] (case-insensitive sorted), projects: [{id,title,description,projectUrl,createdAt,updatedAt}] (newest first) }.
// Resolves `undefined` when the student does not exist. `student.listSkills(studentId)` returns just the sorted skill names.
const isUnique = error => error?.code === 'SQLITE_CONSTRAINT_UNIQUE';

async function listSkills(db, studentId) {
  return db.prepare('SELECT skill FROM student_skills WHERE student_id=? ORDER BY skill COLLATE NOCASE').all(studentId).map(row => row.skill);
}
async function listProjects(db, studentId) {
  return db.prepare(`SELECT id,title,description,project_url AS projectUrl,created_at AS createdAt,updated_at AS updatedAt
    FROM student_projects WHERE student_id=? ORDER BY created_at DESC`).all(studentId);
}
export async function buildStudentProfile(db, studentId, { privateFields = false, includeResume = false } = {}) {
  const fields = `${privateFields || includeResume ? ',s.resume_reference AS resumeReference' : ''},s.profile_image AS profileImage`;
  const profile = db.prepare(`SELECT s.id,s.full_name AS fullName${fields},s.college,s.degree,s.graduation_year AS graduationYear,
      s.about,s.github_url AS githubUrl,s.linkedin_url AS linkedinUrl,s.portfolio_url AS portfolioUrl,s.location,
      s.created_at AS createdAt,s.updated_at AS updatedAt${privateFields ? ',s.profile_visible AS profileVisible' : ''}
    FROM students s WHERE s.id=?`).get(studentId);
  if (profile && 'profileVisible' in profile) profile.profileVisible = Boolean(profile.profileVisible);
  if (profile) { profile.skills = await listSkills(db, studentId); profile.projects = await listProjects(db, studentId); }
  return profile;
}

export function createStudentRepo(db) {
  return {
    buildStudentProfile: (studentId, opts) => buildStudentProfile(db, studentId, opts),
    listSkills: studentId => listSkills(db, studentId),

    // ATOMIC (user + OTP). Returns false when the email already has an account.
    async createAccount({ id, email, passwordHash, timestamp, otp }) {
      try {
        db.transaction(() => {
          db.prepare(`INSERT INTO student_users(id,email,password_hash,email_verified,account_status,password_created_at,updated_at,created_at)
            VALUES (?,?,?,0,'ACTIVE',?,?,?)`).run(id, email, passwordHash, timestamp, timestamp, timestamp);
          db.prepare(`INSERT INTO student_otp_challenges(student_user_id,otp_hash,expires_at,attempts,resend_count,resend_window_started_at,last_sent_at)
            VALUES (?,?,?,0,0,?,?)`).run(id, otp.hash, otp.expiresAt, otp.sentAt, otp.sentAt);
        })();
        return true;
      } catch (error) {
        if (isUnique(error)) return false;
        throw error;
      }
    },
    async getVerifyRecord(email) {
      return db.prepare(`SELECT su.id,su.email_verified,o.otp_hash,o.expires_at,o.attempts FROM student_users su
        JOIN student_otp_challenges o ON o.student_user_id=su.id WHERE su.email=? COLLATE NOCASE`).get(email);
    },
    async bumpOtpAttempts(userId, max) {
      db.prepare('UPDATE student_otp_challenges SET attempts=attempts+1 WHERE student_user_id=? AND attempts<?').run(userId, max);
    },
    // ATOMIC: mark verified + drop the OTP challenge.
    async completeVerification(userId, timestamp) {
      db.transaction(() => {
        db.prepare('UPDATE student_users SET email_verified=1,updated_at=? WHERE id=?').run(timestamp, userId);
        db.prepare('DELETE FROM student_otp_challenges WHERE student_user_id=?').run(userId);
      })();
    },
    async getResendRecord(email) {
      return db.prepare(`SELECT su.id,su.email,o.resend_count,o.resend_window_started_at,o.last_sent_at
        FROM student_users su JOIN student_otp_challenges o ON o.student_user_id=su.id
        WHERE su.email=? COLLATE NOCASE AND su.email_verified=0 AND su.account_status='ACTIVE'`).get(email);
    },
    async replaceOtp(userId, { hash, expiresAt, count, windowStart, sentAt }) {
      db.prepare('UPDATE student_otp_challenges SET otp_hash=?,expires_at=?,attempts=0,resend_count=?,resend_window_started_at=?,last_sent_at=? WHERE student_user_id=?')
        .run(hash, expiresAt, count, windowStart, sentAt, userId);
    },

    async findLoginUser(email) {
      return db.prepare('SELECT id,email,password_hash,account_status,email_verified FROM student_users WHERE email=? COLLATE NOCASE').get(email);
    },
    async createSession({ tokenHash, userId, expiresAt, createdAt }) {
      db.prepare('INSERT INTO student_sessions(token_hash,student_user_id,expires_at,created_at) VALUES (?,?,?,?)').run(tokenHash, userId, expiresAt, createdAt);
    },
    async findSession(tokenHash) {
      return db.prepare(`SELECT ss.token_hash,ss.expires_at,su.id AS account_id,su.email,s.id AS student_id
        FROM student_sessions ss JOIN student_users su ON su.id=ss.student_user_id
        LEFT JOIN students s ON s.account_id=su.id WHERE ss.token_hash=?`).get(tokenHash);
    },
    async deleteSession(tokenHash) { db.prepare('DELETE FROM student_sessions WHERE token_hash=?').run(tokenHash); },
    async isAccountActive(accountId) { return db.prepare("SELECT 1 FROM student_users WHERE id=? AND account_status='ACTIVE'").get(accountId) != null; },
    async deleteAllSessions(accountId) { db.prepare('DELETE FROM student_sessions WHERE student_user_id=?').run(accountId); },

    async getPasswordHash(accountId) { return db.prepare('SELECT password_hash FROM student_users WHERE id=?').get(accountId)?.password_hash; },
    // ATOMIC: new hash + drop every other session (keeps the caller's).
    async changePassword(accountId, hash, timestamp, keepTokenHash) {
      db.transaction(() => {
        db.prepare('UPDATE student_users SET password_hash=?,password_created_at=?,updated_at=? WHERE id=?').run(hash, timestamp, timestamp, accountId);
        db.prepare('DELETE FROM student_sessions WHERE student_user_id=? AND token_hash<>?').run(accountId, keepTokenHash);
      })();
    },

    async findResetUser(email) {
      return db.prepare("SELECT id,email FROM student_users WHERE email=? COLLATE NOCASE AND email_verified=1 AND account_status='ACTIVE'").get(email);
    },
    async getOtpLastSent(userId) { return db.prepare('SELECT last_sent_at FROM student_otp_challenges WHERE student_user_id=?').get(userId); },
    async upsertResetOtp(userId, { hash, expiresAt, now }) {
      db.prepare(`INSERT INTO student_otp_challenges(student_user_id,otp_hash,expires_at,attempts,resend_count,resend_window_started_at,last_sent_at)
        VALUES (?,?,?,0,0,?,?) ON CONFLICT(student_user_id) DO UPDATE SET otp_hash=excluded.otp_hash,expires_at=excluded.expires_at,attempts=0,last_sent_at=excluded.last_sent_at`)
        .run(userId, hash, expiresAt, now, now);
    },
    async getResetRecord(email) {
      return db.prepare(`SELECT su.id,o.otp_hash,o.expires_at,o.attempts FROM student_users su
        JOIN student_otp_challenges o ON o.student_user_id=su.id
        WHERE su.email=? COLLATE NOCASE AND su.email_verified=1 AND su.account_status='ACTIVE'`).get(email);
    },
    // ATOMIC: new hash + drop OTP + drop all sessions.
    async resetPassword(userId, hash, timestamp) {
      db.transaction(() => {
        db.prepare('UPDATE student_users SET password_hash=?,password_created_at=?,updated_at=? WHERE id=?').run(hash, timestamp, timestamp, userId);
        db.prepare('DELETE FROM student_otp_challenges WHERE student_user_id=?').run(userId);
        db.prepare('DELETE FROM student_sessions WHERE student_user_id=?').run(userId);
      })();
    },

    // ATOMIC create-or-update of the profile row + skill replacement. `values` are the validated profile fields
    // (profileVisible null = keep current / default true). Returns the student id.
    async saveProfile({ studentId, accountId, newStudentId, newSkillId, values, skills, timestamp }) {
      return db.transaction(() => {
        let id = studentId;
        if (!id) {
          id = newStudentId;
          db.prepare(`INSERT INTO students(id,account_id,full_name,profile_image,college,degree,graduation_year,about,resume_reference,github_url,linkedin_url,portfolio_url,location,profile_visible,created_at,updated_at)
            VALUES (@id,@accountId,@fullName,@profileImage,@college,@degree,@graduationYear,@about,@resumeReference,@githubUrl,@linkedinUrl,@portfolioUrl,@location,COALESCE(@profileVisible,1),@timestamp,@timestamp)`)
            .run({ ...values, id, accountId, timestamp });
        } else {
          db.prepare(`UPDATE students SET full_name=@fullName,profile_image=@profileImage,college=@college,degree=@degree,graduation_year=@graduationYear,
            about=@about,resume_reference=@resumeReference,github_url=@githubUrl,linkedin_url=@linkedinUrl,portfolio_url=@portfolioUrl,location=@location,profile_visible=COALESCE(@profileVisible,profile_visible),updated_at=@timestamp WHERE id=@id`)
            .run({ ...values, id, timestamp });
        }
        db.prepare('DELETE FROM student_skills WHERE student_id=?').run(id);
        const addSkill = db.prepare('INSERT INTO student_skills(id,student_id,skill,created_at) VALUES (?,?,?,?)');
        for (const skill of skills) addSkill.run(newSkillId(), id, skill, timestamp);
        return id;
      })();
    },

    async createProject({ id, studentId, title, description, projectUrl, timestamp }) {
      db.prepare('INSERT INTO student_projects(id,student_id,title,description,project_url,created_at,updated_at) VALUES (?,?,?,?,?,?,?)')
        .run(id, studentId, title, description, projectUrl, timestamp, timestamp);
      return (await listProjects(db, studentId)).find(project => project.id === id);
    },
    async projectOwned(id, studentId) { return db.prepare('SELECT id FROM student_projects WHERE id=? AND student_id=?').get(id, studentId) != null; },
    async updateProject({ id, studentId, title, description, projectUrl, timestamp }) {
      db.prepare('UPDATE student_projects SET title=?,description=?,project_url=?,updated_at=? WHERE id=? AND student_id=?').run(title, description, projectUrl, timestamp, id, studentId);
      return (await listProjects(db, studentId)).find(item => item.id === id);
    },
    async deleteProject(id, studentId) { return db.prepare('DELETE FROM student_projects WHERE id=? AND student_id=?').run(id, studentId).changes > 0; },
  };
}
