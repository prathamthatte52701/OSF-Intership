// MongoDB implementation of the ASSESSMENTS + TALENT/SAVED-STUDENTS repository (DB_DRIVER=mongo). Same interface as sqlite/assessments.js.
// UNVERIFIED against a live cluster (none available when written) - reviewed by reasoning only.
// Collections keep the SQL table names/column names (`_id` = SQL `id`): skill_assessments, skill_assessment_questions,
// skill_assessment_attempts, saved_students. DESIGN: a student's answers are EMBEDDED in the attempt document (`answers: [{question_id,
// selected_option}]`), so answer submission is a single conditional update (`status:'IN_PROGRESS'`) - atomic without transactions.
// Student-facing reads use inclusion projections that omit `correct_answer`; only company-facing views select it.
import { NOCASE } from './ensureIndexes.js';

const DUPLICATE = 11000;
const OPTS = ['A', 'B', 'C', 'D'];
const Q_STUDENT_PROJECTION = { question_text: 1, option_a: 1, option_b: 1, option_c: 1, option_d: 1, question_order: 1 }; // NO correct_answer
const qView = (q, { key = false, assessmentId = false } = {}) => ({
  id: q._id, questionText: q.question_text, optionA: q.option_a, optionB: q.option_b, optionC: q.option_c, optionD: q.option_d,
  ...(key ? { correctAnswer: q.correct_answer } : {}), questionOrder: q.question_order, ...(assessmentId ? { assessmentId: q.assessment_id } : {}),
});
const rawQuestion = q => q && ({ ...q, id: q._id });
const rawAssessment = a => a && ({ ...a, id: a._id });
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function createAssessmentsRepo({ db }) {
  const assessments = db.collection('skill_assessments');
  const questions = db.collection('skill_assessment_questions');
  const attempts = db.collection('skill_assessment_attempts');
  const students = db.collection('students');
  const studentSkills = db.collection('student_skills');
  const saved = db.collection('saved_students');
  const challenges = db.collection('challenges');
  const applications = db.collection('applications');

  async function companyAssessment(id) {
    const a = await assessments.findOne({ _id: id });
    const [attemptCount, qs] = await Promise.all([attempts.countDocuments({ assessment_id: id }), questions.find({ assessment_id: id }).sort({ question_order: 1 }).toArray()]);
    return { id: a._id, title: a.title, description: a.description ?? null, relatedSkill: a.related_skill, instructions: a.instructions ?? null,
      durationMinutes: a.duration_minutes ?? null, status: a.status, createdAt: a.created_at, attemptCount, questions: qs.map(q => qView(q, { key: true })) };
  }
  async function studentAttempt(att) {
    const a = await assessments.findOne({ _id: att.assessment_id });
    const qs = await questions.find({ assessment_id: att.assessment_id }, { projection: Q_STUDENT_PROJECTION }).sort({ question_order: 1 }).toArray();
    const picked = new Map((att.answers || []).map(x => [x.question_id, x.selected_option]));
    const durationMinutes = a?.duration_minutes ?? null;
    return {
      id: att._id, assessmentId: att.assessment_id, startedAt: att.started_at, submittedAt: att.submitted_at ?? null, status: att.status,
      reviewStatus: att.review_status, manualScore: att.manual_score ?? null, companyFeedback: att.company_feedback ?? null, reviewedAt: att.reviewed_at ?? null,
      assessmentTitle: a?.title, durationMinutes, assessmentStatus: a?.status,
      expiresAt: durationMinutes ? new Date(Date.parse(att.started_at) + durationMinutes * 60000).toISOString() : null, serverNow: new Date().toISOString(),
      questions: qs.map(q => ({ ...qView(q), selectedOption: picked.get(q._id) || null })),
    };
  }

  return {
    // ---- company assessments ----
    async createAssessment({ id, companyId, title, description, relatedSkill, instructions, duration, timestamp }) {
      await assessments.insertOne({ _id: id, company_id: companyId, title, description, related_skill: relatedSkill, instructions, duration_minutes: duration, status: 'DRAFT', created_at: timestamp, updated_at: timestamp });
      return companyAssessment(id);
    },
    async listForCompany(companyId) {
      const rows = await assessments.find({ company_id: companyId }, { projection: { _id: 1 } }).sort({ created_at: -1 }).toArray();
      return Promise.all(rows.map(row => companyAssessment(row._id)));
    },
    async getOwned(id, companyId) { return rawAssessment(await assessments.findOne({ _id: id, company_id: companyId })); },
    async updateIfDraft(id, companyId, { title, description, relatedSkill, instructions, duration, timestamp }) {
      const r = await assessments.updateOne({ _id: id, company_id: companyId, status: 'DRAFT' },
        { $set: { title, description, related_skill: relatedSkill, instructions, duration_minutes: duration, updated_at: timestamp } });
      return r.matchedCount ? companyAssessment(id) : null;
    },
    async getQuestion(assessmentId, questionId) { return rawQuestion(await questions.findOne({ _id: questionId, assessment_id: assessmentId })); },
    async nextQuestionOrder(assessmentId) {
      const top = await questions.find({ assessment_id: assessmentId }, { projection: { question_order: 1 } }).sort({ question_order: -1 }).limit(1).toArray();
      return (top[0]?.question_order || 0) + 1;
    },
    // Returns the question view, or null when the order number is taken (unique index assessment_id+question_order).
    async addQuestion({ id, assessmentId, questionText, options, correctAnswer, order, timestamp }) {
      try {
        await questions.insertOne({ _id: id, assessment_id: assessmentId, question_text: questionText, option_a: options[0], option_b: options[1], option_c: options[2], option_d: options[3],
          correct_answer: correctAnswer, question_order: order, created_at: timestamp, updated_at: timestamp });
      } catch (error) { if (error?.code === DUPLICATE) return null; throw error; }
      return qView(await questions.findOne({ _id: id }), { key: true, assessmentId: true });
    },
    async updateQuestion({ id, assessmentId, questionText, options, correctAnswer, order, timestamp }) {
      try {
        await questions.updateOne({ _id: id, assessment_id: assessmentId }, { $set: { question_text: questionText, option_a: options[0], option_b: options[1], option_c: options[2], option_d: options[3],
          correct_answer: correctAnswer, question_order: order, updated_at: timestamp } });
      } catch (error) { if (error?.code === DUPLICATE) return null; throw error; }
      return qView(await questions.findOne({ _id: id }), { key: true, assessmentId: true });
    },
    async deleteQuestion(assessmentId, questionId) { return (await questions.deleteOne({ _id: questionId, assessment_id: assessmentId })).deletedCount > 0; },
    async hasQuestions(assessmentId) { return Boolean(await questions.findOne({ assessment_id: assessmentId }, { projection: { _id: 1 } })); },
    async setStatus(id, status, timestamp) {
      await assessments.updateOne({ _id: id }, { $set: { status, updated_at: timestamp } });
      return companyAssessment(id);
    },

    // ---- student-facing (no questions in list/detail, no answer keys anywhere) ----
    async listPublished() {
      const rows = await assessments.find({ status: 'PUBLISHED' }).sort({ created_at: -1 }).limit(100).toArray();
      return rows.map(a => ({ id: a._id, title: a.title, description: a.description ?? null, relatedSkill: a.related_skill, instructions: a.instructions ?? null, durationMinutes: a.duration_minutes ?? null }));
    },
    async getForStudent(id, studentId) {
      const a = await assessments.findOne({ _id: id });
      if (!a) return null;
      if (a.status !== 'PUBLISHED' && !(studentId && await attempts.findOne({ assessment_id: id, student_id: studentId }, { projection: { _id: 1 } }))) return null;
      return { id: a._id, title: a.title, description: a.description ?? null, relatedSkill: a.related_skill, instructions: a.instructions ?? null, durationMinutes: a.duration_minutes ?? null, status: a.status };
    },
    async isPublished(id) { return Boolean(await assessments.findOne({ _id: id, status: 'PUBLISHED' }, { projection: { _id: 1 } })); },
    // Atomic via the unique index (assessment_id, student_id). Returns the attempt view, or null if one already exists.
    async startAttempt({ id, assessmentId, studentId, timestamp }) {
      const doc = { _id: id, assessment_id: assessmentId, student_id: studentId, started_at: timestamp, submitted_at: null, status: 'IN_PROGRESS', review_status: 'PENDING',
        manual_score: null, company_feedback: null, reviewed_at: null, answers: [], created_at: timestamp, updated_at: timestamp };
      try { await attempts.insertOne(doc); } catch (error) { if (error?.code === DUPLICATE) return null; throw error; }
      return studentAttempt(doc);
    },
    async listStudentAttempts(studentId) {
      const rows = await attempts.find({ student_id: studentId }).sort({ started_at: -1 }).toArray();
      return Promise.all(rows.map(studentAttempt));
    },
    async getStudentAttempt(id, studentId) {
      const att = studentId ? await attempts.findOne({ _id: id, student_id: studentId }) : null;
      return att ? studentAttempt(att) : null;
    },
    async getAttemptRow(id, studentId) {
      const att = studentId ? await attempts.findOne({ _id: id, student_id: studentId }, { projection: { assessment_id: 1, status: 1 } }) : null;
      return att ? { id: att._id, assessment_id: att.assessment_id, status: att.status } : null;
    },
    async questionIds(assessmentId) { return (await questions.find({ assessment_id: assessmentId }, { projection: { _id: 1 } }).toArray()).map(q => q._id); },
    // Single conditional update (status must still be IN_PROGRESS) = optimistic concurrency; on conflict re-read and report the winner's state.
    async saveAnswers({ attemptId, studentId, answers, finalize, timestamp, now }) {
      const att = await attempts.findOne({ _id: attemptId, student_id: studentId });
      if (!att) return 'MISSING';
      if (att.status !== 'IN_PROGRESS') return att.status;
      const a = await assessments.findOne({ _id: att.assessment_id }, { projection: { duration_minutes: 1 } });
      if (a?.duration_minutes && Date.parse(att.started_at) + a.duration_minutes * 60000 <= now) {
        await attempts.updateOne({ _id: attemptId, status: 'IN_PROGRESS' }, { $set: { status: 'EXPIRED', updated_at: timestamp } });
        return 'EXPIRED';
      }
      const $set = { answers: answers.map(x => ({ question_id: x.questionId, selected_option: x.selectedOption })), updated_at: timestamp };
      if (finalize) Object.assign($set, { submitted_at: timestamp, status: 'SUBMITTED' });
      const r = await attempts.updateOne({ _id: attemptId, student_id: studentId, status: 'IN_PROGRESS' }, { $set });
      if (!r.matchedCount) return (await attempts.findOne({ _id: attemptId, student_id: studentId }, { projection: { status: 1 } }))?.status || 'MISSING';
      return finalize ? 'SUBMITTED' : 'IN_PROGRESS';
    },
    async expireAttempts(currentTime = Date.now()) {
      const timed = await assessments.find({ duration_minutes: { $ne: null } }, { projection: { duration_minutes: 1 } }).toArray();
      const durations = new Map(timed.map(a => [a._id, a.duration_minutes]));
      if (!durations.size) return 0;
      const open = await attempts.find({ status: 'IN_PROGRESS', assessment_id: { $in: [...durations.keys()] } }, { projection: { assessment_id: 1, started_at: 1 } }).toArray();
      const timestamp = new Date(currentTime).toISOString();
      let count = 0;
      for (const att of open) {
        if (Date.parse(att.started_at) + durations.get(att.assessment_id) * 60000 <= currentTime) {
          count += (await attempts.updateOne({ _id: att._id, status: 'IN_PROGRESS' }, { $set: { status: 'EXPIRED', updated_at: timestamp } })).modifiedCount;
        }
      }
      return count;
    },

    // ---- company-side attempt review (answer keys visible) ----
    async listAttemptsForAssessment(assessmentId) {
      const rows = await attempts.find({ assessment_id: assessmentId }).sort({ started_at: -1 }).toArray();
      const owners = new Map((await students.find({ _id: { $in: rows.map(r => r.student_id) } }, { projection: { full_name: 1, college: 1 } }).toArray()).map(s => [s._id, s]));
      return rows.filter(r => owners.has(r.student_id)).map(r => ({
        id: r._id, studentId: r.student_id, startedAt: r.started_at, submittedAt: r.submitted_at ?? null, status: r.status, reviewStatus: r.review_status,
        manualScore: r.manual_score ?? null, companyFeedback: r.company_feedback ?? null, reviewedAt: r.reviewed_at ?? null,
        fullName: owners.get(r.student_id).full_name, college: owners.get(r.student_id).college ?? null,
      }));
    },
    async getOwnedAttempt(id, companyId) {
      const att = await attempts.findOne({ _id: id });
      if (!att || !await assessments.findOne({ _id: att.assessment_id, company_id: companyId }, { projection: { _id: 1 } })) return null;
      return { ...att, id: att._id };
    },
    async getCompanyAttempt(id) {
      const r = await attempts.findOne({ _id: id });
      const [s, qs] = await Promise.all([students.findOne({ _id: r.student_id }), questions.find({ assessment_id: r.assessment_id }).sort({ question_order: 1 }).toArray()]);
      const picked = new Map((r.answers || []).map(x => [x.question_id, x.selected_option]));
      return {
        id: r._id, assessmentId: r.assessment_id, studentId: r.student_id, startedAt: r.started_at, submittedAt: r.submitted_at ?? null, status: r.status, reviewStatus: r.review_status,
        manualScore: r.manual_score ?? null, companyFeedback: r.company_feedback ?? null, reviewedAt: r.reviewed_at ?? null, fullName: s?.full_name, college: s?.college ?? null,
        questions: qs.map(q => ({ ...qView(q, { key: true }), selectedOption: picked.get(q._id) ?? null })),
      };
    },
    async evaluateAttempt(id, { score, feedback, timestamp }) {
      await attempts.updateOne({ _id: id }, { $set: { manual_score: score, company_feedback: feedback, review_status: 'REVIEWED', status: 'REVIEWED', reviewed_at: timestamp, updated_at: timestamp } });
    },

    // ---- talent discovery ----
    // ponytail: ranking is done in-process over the matching student set (skills filter narrows it first); move to an aggregation $facet if the student base gets large.
    async searchTalent({ companyId, skills, college, limit, offset }) {
      const own = await challenges.find({ company_id: companyId }, { projection: { _id: 1 } }).toArray();
      const appliedIds = own.length ? await applications.distinct('student_id', { challenge_id: { $in: own.map(c => c._id) } }) : [];
      const filter = { $and: [{ $or: [{ profile_visible: { $nin: [0, false] } }, { _id: { $in: appliedIds } }] }] };
      if (college) filter.$and.push({ college: { $regex: escapeRegex(college), $options: 'i' } });
      const counts = new Map();
      if (skills.length) {
        const hits = await studentSkills.find({ skill: { $in: skills } }, { projection: { student_id: 1, skill: 1 }, collation: NOCASE }).toArray();
        const seen = new Map();
        for (const h of hits) { if (!seen.has(h.student_id)) seen.set(h.student_id, new Set()); seen.get(h.student_id).add(h.skill.toLowerCase()); }
        for (const [sid, set] of seen) counts.set(sid, set.size);
        filter.$and.push({ _id: { $in: [...counts.keys()] } });
      }
      const found = await students.find(filter, { projection: { updated_at: 1 } }).toArray();
      found.sort((a, b) => ((counts.get(b._id) || 0) - (counts.get(a._id) || 0)) || (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0) || (a._id < b._id ? -1 : 1));
      return { total: found.length, rows: found.slice(offset, offset + limit).map(s => ({ id: s._id, matchCount: counts.get(s._id) || 0 })) };
    },
    async isTalentVisible(studentId, companyId) {
      const s = await students.findOne({ _id: studentId }, { projection: { profile_visible: 1 } });
      if (!s) return false;
      if (![0, false].includes(s.profile_visible)) return true;
      const own = await challenges.find({ company_id: companyId }, { projection: { _id: 1 } }).toArray();
      return Boolean(own.length && await applications.findOne({ student_id: studentId, challenge_id: { $in: own.map(c => c._id) } }, { projection: { _id: 1 } }));
    },

    // ---- saved students ----
    async listSaved(companyId) {
      return (await saved.find({ company_id: companyId }).sort({ created_at: -1 }).toArray()).map(r => ({ student_id: r.student_id, note: r.note ?? null, created_at: r.created_at }));
    },
    async studentExists(studentId) { return Boolean(await students.findOne({ _id: studentId }, { projection: { _id: 1 } })); },
    async saveStudent(companyId, studentId, note, timestamp) {
      const upsert = () => saved.updateOne({ company_id: companyId, student_id: studentId }, { $set: { note }, $setOnInsert: { created_at: timestamp } }, { upsert: true });
      try { await upsert(); } catch (error) { if (error?.code === DUPLICATE) await upsert(); else throw error; } // concurrent first-save race: retry once as an update
    },
    async removeSaved(companyId, studentId) { return (await saved.deleteOne({ company_id: companyId, student_id: studentId })).deletedCount > 0; },
  };
}
