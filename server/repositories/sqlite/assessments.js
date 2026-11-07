// SQLite implementation of the ASSESSMENTS + TALENT/SAVED-STUDENTS repository. Same interface as mongo/assessments.js.
// All methods async. Student-facing methods never select correct_answer; only company-facing views carry `correctAnswer`.
import { newId } from '../../security.js';

const isUnique = error => error?.code === 'SQLITE_CONSTRAINT_UNIQUE';
const Q_COMPANY = 'id,question_text AS questionText,option_a AS optionA,option_b AS optionB,option_c AS optionC,option_d AS optionD,correct_answer AS correctAnswer,question_order AS questionOrder';
const Q_STUDENT = 'id,question_text AS questionText,option_a AS optionA,option_b AS optionB,option_c AS optionC,option_d AS optionD,question_order AS questionOrder';
const VISIBLE_TO_COMPANY = `(s.profile_visible=1 OR EXISTS (SELECT 1 FROM applications a JOIN challenges c ON c.id=a.challenge_id WHERE a.student_id=s.id AND c.company_id=?))`;

export function createAssessmentsRepo(db) {
  const companyAssessment = id => {
    const row = db.prepare('SELECT * FROM skill_assessments WHERE id=?').get(id);
    return { id: row.id, title: row.title, description: row.description, relatedSkill: row.related_skill, instructions: row.instructions,
      durationMinutes: row.duration_minutes, status: row.status, createdAt: row.created_at,
      attemptCount: db.prepare('SELECT COUNT(*) AS n FROM skill_assessment_attempts WHERE assessment_id=?').get(id).n,
      questions: db.prepare(`SELECT ${Q_COMPANY} FROM skill_assessment_questions WHERE assessment_id=? ORDER BY question_order`).all(id) };
  };
  const companyQuestion = id => db.prepare(`SELECT ${Q_COMPANY},assessment_id AS assessmentId FROM skill_assessment_questions WHERE id=?`).get(id);
  const studentAttempt = id => {
    const row = db.prepare(`SELECT a.id,a.assessment_id AS assessmentId,a.started_at AS startedAt,a.submitted_at AS submittedAt,a.status,a.review_status AS reviewStatus,
      a.manual_score AS manualScore,a.company_feedback AS companyFeedback,a.reviewed_at AS reviewedAt,s.title AS assessmentTitle,s.duration_minutes AS durationMinutes,s.status AS assessmentStatus
      FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id WHERE a.id=?`).get(id);
    row.expiresAt = row.durationMinutes ? new Date(Date.parse(row.startedAt) + row.durationMinutes * 60000).toISOString() : null;
    row.serverNow = new Date().toISOString();
    row.questions = db.prepare(`SELECT ${Q_STUDENT} FROM skill_assessment_questions WHERE assessment_id=? ORDER BY question_order`).all(row.assessmentId)
      .map(question => ({ ...question, selectedOption: db.prepare('SELECT selected_option FROM skill_assessment_answers WHERE attempt_id=? AND question_id=?').get(id, question.id)?.selected_option || null }));
    return row;
  };

  return {
    // ---- company assessments ----
    async createAssessment({ id, companyId, title, description, relatedSkill, instructions, duration, timestamp }) {
      db.prepare(`INSERT INTO skill_assessments(id,company_id,title,description,related_skill,instructions,duration_minutes,status,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,'DRAFT',?,?)`).run(id, companyId, title, description, relatedSkill, instructions, duration, timestamp, timestamp);
      return companyAssessment(id);
    },
    async listForCompany(companyId) {
      return db.prepare('SELECT id FROM skill_assessments WHERE company_id=? ORDER BY created_at DESC').all(companyId).map(row => companyAssessment(row.id));
    },
    async getOwned(id, companyId) {
      return db.prepare('SELECT * FROM skill_assessments WHERE id=? AND company_id=?').get(id, companyId) || null;
    },
    // Returns the updated view, or null if the assessment is no longer a draft.
    async updateIfDraft(id, companyId, { title, description, relatedSkill, instructions, duration, timestamp }) {
      const r = db.prepare(`UPDATE skill_assessments SET title=?,description=?,related_skill=?,instructions=?,duration_minutes=?,updated_at=?
        WHERE id=? AND company_id=? AND status='DRAFT'`).run(title, description, relatedSkill, instructions, duration, timestamp, id, companyId);
      return r.changes ? companyAssessment(id) : null;
    },
    async getQuestion(assessmentId, questionId) {
      return db.prepare('SELECT * FROM skill_assessment_questions WHERE id=? AND assessment_id=?').get(questionId, assessmentId) || null;
    },
    async nextQuestionOrder(assessmentId) {
      return db.prepare('SELECT COALESCE(MAX(question_order),0)+1 AS next FROM skill_assessment_questions WHERE assessment_id=?').get(assessmentId).next;
    },
    // Returns the question view, or null when the order number is taken.
    async addQuestion({ id, assessmentId, questionText, options, correctAnswer, order, timestamp }) {
      try {
        db.prepare(`INSERT INTO skill_assessment_questions(id,assessment_id,question_text,option_a,option_b,option_c,option_d,correct_answer,question_order,created_at,updated_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?)`).run(id, assessmentId, questionText, ...options, correctAnswer, order, timestamp, timestamp);
      } catch (error) { if (isUnique(error)) return null; throw error; }
      return companyQuestion(id);
    },
    async updateQuestion({ id, assessmentId, questionText, options, correctAnswer, order, timestamp }) {
      try {
        db.prepare(`UPDATE skill_assessment_questions SET question_text=?,option_a=?,option_b=?,option_c=?,option_d=?,correct_answer=?,question_order=?,updated_at=?
          WHERE id=? AND assessment_id=?`).run(questionText, ...options, correctAnswer, order, timestamp, id, assessmentId);
      } catch (error) { if (isUnique(error)) return null; throw error; }
      return companyQuestion(id);
    },
    async deleteQuestion(assessmentId, questionId) {
      return db.prepare('DELETE FROM skill_assessment_questions WHERE id=? AND assessment_id=?').run(questionId, assessmentId).changes > 0;
    },
    async hasQuestions(assessmentId) {
      return Boolean(db.prepare('SELECT 1 FROM skill_assessment_questions WHERE assessment_id=? LIMIT 1').get(assessmentId));
    },
    async setStatus(id, status, timestamp) {
      db.prepare('UPDATE skill_assessments SET status=?,updated_at=? WHERE id=?').run(status, timestamp, id);
      return companyAssessment(id);
    },

    // ---- student-facing (no questions in list/detail, no answer keys anywhere) ----
    async listPublished() {
      return db.prepare("SELECT id,title,description,related_skill AS relatedSkill,instructions,duration_minutes AS durationMinutes FROM skill_assessments WHERE status='PUBLISHED' ORDER BY created_at DESC LIMIT 100").all();
    },
    async getForStudent(id, studentId) {
      return db.prepare(`SELECT id,title,description,related_skill AS relatedSkill,instructions,duration_minutes AS durationMinutes,status
        FROM skill_assessments WHERE id=? AND (status='PUBLISHED' OR EXISTS (
          SELECT 1 FROM skill_assessment_attempts a WHERE a.assessment_id=skill_assessments.id AND a.student_id=?))`).get(id, studentId) || null;
    },
    async isPublished(id) {
      return Boolean(db.prepare("SELECT 1 FROM skill_assessments WHERE id=? AND status='PUBLISHED'").get(id));
    },
    // Atomic via UNIQUE(assessment_id, student_id). Returns the student attempt view, or null if one already exists.
    async startAttempt({ id, assessmentId, studentId, timestamp }) {
      try {
        db.prepare(`INSERT INTO skill_assessment_attempts(id,assessment_id,student_id,started_at,status,review_status,created_at,updated_at)
          VALUES (?,?,?,?,'IN_PROGRESS','PENDING',?,?)`).run(id, assessmentId, studentId, timestamp, timestamp, timestamp);
      } catch (error) { if (isUnique(error)) return null; throw error; }
      return studentAttempt(id);
    },
    async listStudentAttempts(studentId) {
      return db.prepare('SELECT id FROM skill_assessment_attempts WHERE student_id=? ORDER BY started_at DESC').all(studentId).map(row => studentAttempt(row.id));
    },
    async getStudentAttempt(id, studentId) {
      return db.prepare('SELECT id FROM skill_assessment_attempts WHERE id=? AND student_id=?').get(id, studentId) ? studentAttempt(id) : null;
    },
    async getAttemptRow(id, studentId) { // { id, assessment_id, status }
      return db.prepare('SELECT id,assessment_id,status FROM skill_assessment_attempts WHERE id=? AND student_id=?').get(id, studentId) || null;
    },
    async questionIds(assessmentId) {
      return db.prepare('SELECT id FROM skill_assessment_questions WHERE assessment_id=?').all(assessmentId).map(row => row.id);
    },
    // Replaces all answers atomically. Returns the resulting state: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | other status | 'MISSING'.
    async saveAnswers({ attemptId, studentId, answers, finalize, timestamp, now }) {
      const tx = db.transaction(() => {
        const current = db.prepare(`SELECT a.status,a.started_at,s.duration_minutes AS durationMinutes FROM skill_assessment_attempts a
          JOIN skill_assessments s ON s.id=a.assessment_id WHERE a.id=? AND a.student_id=?`).get(attemptId, studentId);
        if (!current || current.status !== 'IN_PROGRESS') return current?.status || 'MISSING';
        if (current.durationMinutes && Date.parse(current.started_at) + current.durationMinutes * 60000 <= now) {
          db.prepare("UPDATE skill_assessment_attempts SET status='EXPIRED',updated_at=? WHERE id=? AND status='IN_PROGRESS'").run(timestamp, attemptId);
          return 'EXPIRED';
        }
        db.prepare('DELETE FROM skill_assessment_answers WHERE attempt_id=?').run(attemptId);
        const add = db.prepare('INSERT INTO skill_assessment_answers(id,attempt_id,question_id,selected_option,created_at,updated_at) VALUES (?,?,?,?,?,?)');
        for (const answer of answers) add.run(newId(), attemptId, answer.questionId, answer.selectedOption, timestamp, timestamp);
        if (!finalize) {
          db.prepare("UPDATE skill_assessment_attempts SET updated_at=? WHERE id=? AND status='IN_PROGRESS'").run(timestamp, attemptId);
          return 'IN_PROGRESS';
        }
        db.prepare("UPDATE skill_assessment_attempts SET submitted_at=?,status='SUBMITTED',updated_at=? WHERE id=? AND status='IN_PROGRESS'").run(timestamp, timestamp, attemptId);
        return 'SUBMITTED';
      });
      return tx();
    },
    // Marks stale IN_PROGRESS attempts EXPIRED. Returns the number expired.
    async expireAttempts(currentTime = Date.now()) {
      const attempts = db.prepare(`SELECT a.id,a.started_at,s.duration_minutes AS durationMinutes
        FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id WHERE a.status='IN_PROGRESS' AND s.duration_minutes IS NOT NULL`).all();
      const expire = db.prepare("UPDATE skill_assessment_attempts SET status='EXPIRED',updated_at=? WHERE id=? AND status='IN_PROGRESS'");
      const timestamp = new Date(currentTime).toISOString();
      const mark = db.transaction(() => {
        let count = 0;
        for (const attempt of attempts) if (Date.parse(attempt.started_at) + attempt.durationMinutes * 60000 <= currentTime) count += expire.run(timestamp, attempt.id).changes;
        return count;
      });
      try { return mark(); } catch (error) {
        if (error.code === 'SQLITE_BUSY' || error.code === 'SQLITE_LOCKED') return 0;
        throw error;
      }
    },

    // ---- company-side attempt review (answer keys visible) ----
    async listAttemptsForAssessment(assessmentId) {
      return db.prepare(`SELECT a.id,a.student_id AS studentId,a.started_at AS startedAt,a.submitted_at AS submittedAt,a.status,a.review_status AS reviewStatus,
        a.manual_score AS manualScore,a.company_feedback AS companyFeedback,a.reviewed_at AS reviewedAt,s.full_name AS fullName,s.college
        FROM skill_assessment_attempts a JOIN students s ON s.id=a.student_id WHERE a.assessment_id=? ORDER BY a.started_at DESC`).all(assessmentId);
    },
    async getOwnedAttempt(id, companyId) {
      return db.prepare(`SELECT a.* FROM skill_assessment_attempts a JOIN skill_assessments s ON s.id=a.assessment_id
        WHERE a.id=? AND s.company_id=?`).get(id, companyId) || null;
    },
    async getCompanyAttempt(id) {
      const row = db.prepare(`SELECT a.id,a.assessment_id AS assessmentId,a.student_id AS studentId,a.started_at AS startedAt,a.submitted_at AS submittedAt,a.status,a.review_status AS reviewStatus,
        a.manual_score AS manualScore,a.company_feedback AS companyFeedback,a.reviewed_at AS reviewedAt,s.full_name AS fullName,s.college
        FROM skill_assessment_attempts a JOIN students s ON s.id=a.student_id WHERE a.id=?`).get(id);
      row.questions = db.prepare(`SELECT q.id,q.question_text AS questionText,q.option_a AS optionA,q.option_b AS optionB,q.option_c AS optionC,q.option_d AS optionD,
        q.correct_answer AS correctAnswer,q.question_order AS questionOrder,aa.selected_option AS selectedOption FROM skill_assessment_questions q
        LEFT JOIN skill_assessment_answers aa ON aa.question_id=q.id AND aa.attempt_id=? WHERE q.assessment_id=? ORDER BY q.question_order`).all(id, row.assessmentId);
      return row;
    },
    async evaluateAttempt(id, { score, feedback, timestamp }) {
      db.prepare("UPDATE skill_assessment_attempts SET manual_score=?,company_feedback=?,review_status='REVIEWED',status='REVIEWED',reviewed_at=?,updated_at=? WHERE id=?")
        .run(score, feedback, timestamp, timestamp, id);
    },

    // ---- talent discovery ----
    // Returns { rows: [{id, matchCount}] (ranked, paginated), total }. Hidden profiles are visible only to companies whose challenge the student applied to.
    async searchTalent({ companyId, skills, college, limit, offset }) {
      const clauses = [VISIBLE_TO_COMPANY]; const params = [companyId];
      if (college) { clauses.push('s.college LIKE ? ESCAPE \'\\\' COLLATE NOCASE'); params.push(`%${college.replace(/[\\%_]/g, '\\$&')}%`); }
      const marks = skills.map(() => '?').join(',');
      if (skills.length) {
        clauses.push(`EXISTS (SELECT 1 FROM student_skills ss WHERE ss.student_id=s.id AND ss.skill COLLATE NOCASE IN (${marks}))`);
        params.push(...skills);
      }
      const where = clauses.join(' AND ');
      const total = db.prepare(`SELECT COUNT(*) AS n FROM students s WHERE ${where}`).get(...params).n;
      const matchExpr = skills.length ? `(SELECT COUNT(DISTINCT lower(ss.skill)) FROM student_skills ss WHERE ss.student_id=s.id AND ss.skill COLLATE NOCASE IN (${marks}))` : '0';
      const rows = db.prepare(`SELECT s.id, ${matchExpr} AS matchCount FROM students s WHERE ${where} ORDER BY matchCount DESC, s.updated_at DESC, s.id LIMIT ? OFFSET ?`)
        .all(...skills, ...params, limit, offset);
      return { rows, total };
    },
    async isTalentVisible(studentId, companyId) {
      return Boolean(db.prepare(`SELECT 1 FROM students s WHERE s.id=? AND ${VISIBLE_TO_COMPANY}`).get(studentId, companyId));
    },

    // ---- saved students ----
    async listSaved(companyId) {
      return db.prepare('SELECT student_id,note,created_at FROM saved_students WHERE company_id=? ORDER BY created_at DESC').all(companyId);
    },
    async studentExists(studentId) { return Boolean(db.prepare('SELECT 1 FROM students WHERE id=?').get(studentId)); },
    async saveStudent(companyId, studentId, note, timestamp) {
      db.prepare(`INSERT INTO saved_students(company_id,student_id,note,created_at) VALUES (?,?,?,?)
        ON CONFLICT(company_id,student_id) DO UPDATE SET note=excluded.note`).run(companyId, studentId, note, timestamp);
    },
    async removeSaved(companyId, studentId) {
      return db.prepare('DELETE FROM saved_students WHERE company_id=? AND student_id=?').run(companyId, studentId).changes > 0;
    },
  };
}
