// SQLite implementation of the applications repository (applications, submissions, submission_files, evaluations).
// Same interface as mongo/applications.js. Application rows keep SQL column names (snake_case); list/submission/evaluation
// results use the camelCase shapes the routes return. File BYTES live on disk (platform.js); this layer only holds metadata.
const SUB_COLS = `id,github_url AS githubUrl,deployed_url AS deployedUrl,file_reference AS fileReference,
  supporting_information AS supportingInformation,submitted_at AS submittedAt,updated_at AS updatedAt`;
const EVAL_COLS = 'rating,feedback,is_shortlisted AS isShortlisted,evaluated_at AS evaluatedAt';

export function createApplicationsRepo(db) {
  const skillsOf = id => db.prepare('SELECT skill FROM student_skills WHERE student_id=? ORDER BY skill COLLATE NOCASE').all(id).map(r => r.skill);
  const markExpired = (id, ts) => db.prepare("UPDATE applications SET status='EXPIRED',updated_at=? WHERE id=? AND status<>'SUBMITTED'").run(ts, id);
  // In-transaction guard: the application must still be editable (IN_PROGRESS/SUBMITTED and before its deadline).
  const editable = (appId, studentId, now, ts) => {
    const cur = db.prepare('SELECT * FROM applications WHERE id=? AND student_id=?').get(appId, studentId);
    if (!cur) return false;
    if (['IN_PROGRESS', 'SUBMITTED'].includes(cur.status) && Date.parse(cur.individual_deadline) > now) return true;
    if (Date.parse(cur.individual_deadline) <= now && cur.status !== 'EXPIRED') markExpired(appId, ts);
    return false;
  };

  return {
    // Atomic via UNIQUE(challenge_id, student_id). Returns { status: 'OK'|'NOT_AVAILABLE'|'WINDOW_CLOSED'|'DUPLICATE', application? }.
    async apply({ id, challengeId, studentId, now }) {
      const challenge = db.prepare("SELECT * FROM challenges WHERE id=? AND status='PUBLISHED'").get(challengeId);
      if (!challenge) return { status: 'NOT_AVAILABLE' };
      if (now < Date.parse(challenge.application_opens_at) || now > Date.parse(challenge.application_closes_at)) return { status: 'WINDOW_CLOSED' };
      const appliedAt = new Date(now).toISOString();
      const deadline = new Date(now + challenge.individual_task_duration_days * 86400000).toISOString();
      try {
        db.prepare(`INSERT INTO applications(id,challenge_id,student_id,applied_at,individual_deadline,status,created_at,updated_at)
          VALUES (?,?,?,?,?,'APPLIED',?,?)`).run(id, challenge.id, studentId, appliedAt, deadline, appliedAt, appliedAt);
      } catch (error) {
        if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') return { status: 'DUPLICATE' };
        throw error;
      }
      return { status: 'OK', application: { id, challengeId: challenge.id, appliedAt, individualDeadline: deadline, status: 'APPLIED' } };
    },
    async getForStudent(id, studentId) { return db.prepare('SELECT * FROM applications WHERE id=? AND student_id=?').get(id, studentId); },
    // Ownership through the challenge's company; undefined for another company's application.
    async getForCompany(id, companyId) {
      return db.prepare('SELECT a.* FROM applications a JOIN challenges c ON c.id=a.challenge_id WHERE a.id=? AND c.company_id=?').get(id, companyId);
    },
    async markExpired(id, ts) { markExpired(id, ts); },
    async markInProgress(id, ts) { db.prepare("UPDATE applications SET status='IN_PROGRESS',updated_at=? WHERE id=?").run(ts, id); },
    async hasEvaluation(applicationId) { return Boolean(db.prepare('SELECT 1 FROM evaluations WHERE application_id=?').get(applicationId)); },
    async hasSubmitted(applicationId) { return Boolean(db.prepare('SELECT 1 FROM submissions WHERE application_id=? AND submitted_at IS NOT NULL').get(applicationId)); },
    async studentContactEmail(studentId) {
      return db.prepare('SELECT u.email FROM students s JOIN student_users u ON u.id=s.account_id WHERE s.id=?').get(studentId)?.email || null;
    },

    async listForStudent(studentId, now, ts) {
      const rows = db.prepare(`SELECT a.id,a.challenge_id AS challengeId,a.applied_at AS appliedAt,a.individual_deadline AS individualDeadline,
        a.status,a.updated_at AS updatedAt,c.role_title AS roleTitle,c.status AS challengeStatus,c.application_closes_at AS applicationClosesAt,
        c.application_opens_at AS applicationOpensAt,substr(c.task_description,1,280) AS taskSnippet,c.is_paid AS isPaid,
        c.compensation_details AS compensationDetails,c.individual_task_duration_days AS individualTaskDurationDays,co.company_name AS companyName
        FROM applications a JOIN challenges c ON c.id=a.challenge_id LEFT JOIN companies co ON co.id=c.company_id WHERE a.student_id=? ORDER BY a.applied_at DESC`).all(studentId);
      return rows.map(application => {
        const expired = application.status !== 'SUBMITTED' && Date.parse(application.individualDeadline) <= now;
        if (expired && application.status !== 'EXPIRED') markExpired(application.id, ts);
        return {
          ...application, isPaid: Boolean(application.isPaid),
          requiredSkills: db.prepare('SELECT skill FROM challenge_skills WHERE challenge_id=? ORDER BY skill COLLATE NOCASE').all(application.challengeId).map(r => r.skill),
          status: expired ? 'EXPIRED' : application.status,
          submission: db.prepare('SELECT submitted_at AS submittedAt FROM submissions WHERE application_id=?').get(application.id) || null,
          evaluation: db.prepare(`SELECT ${EVAL_COLS} FROM evaluations WHERE application_id=?`).get(application.id) || null,
        };
      });
    },
    async listForChallenge(challengeId, now, ts) {
      return db.prepare(`SELECT a.id,a.student_id AS studentId,a.applied_at AS appliedAt,a.individual_deadline AS individualDeadline,a.status,
        s.full_name AS fullName,s.college,s.degree,
        (SELECT submitted_at FROM submissions WHERE application_id=a.id) AS submittedAt,
        COALESCE((SELECT is_shortlisted FROM evaluations WHERE application_id=a.id),0) AS isShortlisted
        FROM applications a JOIN students s ON s.id=a.student_id WHERE a.challenge_id=? ORDER BY a.applied_at DESC`).all(challengeId)
        .map(row => {
          const out = { ...row, isShortlisted: Boolean(row.isShortlisted), skills: skillsOf(row.studentId) };
          if (out.status !== 'SUBMITTED' && Date.parse(out.individualDeadline) <= now) { markExpired(out.id, ts); out.status = 'EXPIRED'; }
          return out;
        });
    },

    async getSubmission(applicationId, { submittedOnly = false } = {}) {
      return db.prepare(`SELECT ${SUB_COLS} FROM submissions WHERE application_id=?${submittedOnly ? ' AND submitted_at IS NOT NULL' : ''}`).get(applicationId) || null;
    },
    async getEvaluation(applicationId) { return db.prepare(`SELECT id,${EVAL_COLS} FROM evaluations WHERE application_id=?`).get(applicationId) || null; },

    // File metadata (row incl. storage_key) by id, or the file currently referenced by the application's submission.
    async getFile(applicationId, fileId) {
      return db.prepare('SELECT id,application_id,storage_key,original_name,mime_type,size_bytes,created_at FROM submission_files WHERE id=? AND application_id=?').get(fileId, applicationId);
    },
    async getSubmissionFile(applicationId, { submittedOnly = false } = {}) {
      return db.prepare(`SELECT f.* FROM submission_files f JOIN submissions s ON s.file_reference=f.id WHERE f.application_id=?${submittedOnly ? ' AND s.submitted_at IS NOT NULL' : ''}`).get(applicationId);
    },

    // Returns false when the draft was already submitted.
    async saveDraft({ id, applicationId, githubUrl, deployedUrl, supportingInformation, ts }) {
      return db.prepare(`INSERT INTO submissions(id,application_id,github_url,deployed_url,supporting_information,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET github_url=excluded.github_url,deployed_url=excluded.deployed_url,
        supporting_information=excluded.supporting_information,updated_at=excluded.updated_at WHERE submissions.submitted_at IS NULL`)
        .run(id, applicationId, githubUrl, deployedUrl, supportingInformation, ts, ts).changes > 0;
    },
    // Atomic: re-checks editability, upserts the submission (sets submitted_at) and flips the application to SUBMITTED. false = not editable.
    async saveSubmission({ id, applicationId, studentId, githubUrl, deployedUrl, fileReference, supportingInformation, now, ts }) {
      return db.transaction(() => {
        if (!editable(applicationId, studentId, now, ts)) return false;
        db.prepare(`INSERT INTO submissions(id,application_id,github_url,deployed_url,file_reference,supporting_information,submitted_at,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET github_url=excluded.github_url,deployed_url=excluded.deployed_url,
          file_reference=COALESCE(excluded.file_reference,submissions.file_reference),supporting_information=excluded.supporting_information,
          submitted_at=excluded.submitted_at,updated_at=excluded.updated_at`)
          .run(id, applicationId, githubUrl, deployedUrl, fileReference, supportingInformation, ts, ts, ts);
        db.prepare("UPDATE applications SET status='SUBMITTED',updated_at=? WHERE id=?").run(ts, applicationId);
        return true;
      })();
    },
    // Atomic: insert file row, point the submission at it, delete every older file row. Returns { ok:false } or
    // { ok:true, replaced:[{id,storage_key}] } (the caller unlinks the replaced files from disk).
    async saveFile({ fileId, submissionId, applicationId, studentId, storageKey, originalName, mimeType, sizeBytes, now, ts }) {
      return db.transaction(() => {
        if (!editable(applicationId, studentId, now, ts)) return { ok: false };
        db.prepare('INSERT INTO submission_files(id,application_id,storage_key,original_name,mime_type,size_bytes,created_at) VALUES (?,?,?,?,?,?,?)')
          .run(fileId, applicationId, storageKey, originalName, mimeType, sizeBytes, ts);
        db.prepare(`INSERT INTO submissions(id,application_id,file_reference,created_at,updated_at) VALUES (?,?,?,?,?)
          ON CONFLICT(application_id) DO UPDATE SET file_reference=excluded.file_reference,updated_at=excluded.updated_at`)
          .run(submissionId, applicationId, fileId, ts, ts);
        const replaced = db.prepare('SELECT id,storage_key FROM submission_files WHERE application_id=? AND id<>?').all(applicationId, fileId);
        db.prepare('DELETE FROM submission_files WHERE application_id=? AND id<>?').run(applicationId, fileId);
        return { ok: true, replaced };
      })();
    },
    async saveEvaluation({ id, applicationId, rating, feedback, isShortlisted, evaluatedBy, ts }) {
      db.prepare(`INSERT INTO evaluations(id,application_id,rating,feedback,is_shortlisted,evaluated_by,evaluated_at,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(application_id) DO UPDATE SET rating=excluded.rating,feedback=excluded.feedback,
        is_shortlisted=excluded.is_shortlisted,evaluated_by=excluded.evaluated_by,evaluated_at=excluded.evaluated_at,updated_at=excluded.updated_at`)
        .run(id, applicationId, rating, feedback, isShortlisted ? 1 : 0, evaluatedBy, ts, ts, ts);
      return db.prepare(`SELECT id,${EVAL_COLS} FROM evaluations WHERE application_id=?`).get(applicationId);
    },
  };
}
