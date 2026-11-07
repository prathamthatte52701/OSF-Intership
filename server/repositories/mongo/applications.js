// MongoDB implementation of the applications repository.
// Collections: applications, submissions, submission_files, evaluations (documents keep SQL column names; `_id` = SQL `id`).
// Uniqueness: applications (challenge_id, student_id), submissions (application_id), evaluations (application_id) are unique indexes.
import { NOCASE } from './ensureIndexes.js';

const DUPLICATE = 11000;
const withId = doc => { if (!doc) return undefined; const { _id, ...rest } = doc; return { ...rest, id: _id }; };
const subView = d => d && ({ id: d._id, githubUrl: d.github_url ?? null, deployedUrl: d.deployed_url ?? null, fileReference: d.file_reference ?? null,
  supportingInformation: d.supporting_information ?? null, submittedAt: d.submitted_at ?? null, updatedAt: d.updated_at });
const evalView = d => d && ({ rating: d.rating ?? null, feedback: d.feedback ?? null, isShortlisted: d.is_shortlisted ? 1 : 0, evaluatedAt: d.evaluated_at });

export function createApplicationsRepo({ db, client, supportsTransactions }) {
  const apps = db.collection('applications');
  const challenges = db.collection('challenges');
  const companies = db.collection('companies');
  const studentsCol = db.collection('students');
  const submissions = db.collection('submissions');
  const files = db.collection('submission_files');
  const evaluations = db.collection('evaluations');

  const markExpired = (id, ts) => apps.updateOne({ _id: id, status: { $ne: 'SUBMITTED' } }, { $set: { status: 'EXPIRED', updated_at: ts } });
  // Runs `fn(opts)` in a transaction on a replica set (opts={session}); otherwise plain (opts={}) - each step is itself a conditional/idempotent write.
  async function atomic(fn) {
    if (!supportsTransactions) return fn({});
    const session = client.startSession();
    try {
      let result;
      await session.withTransaction(async () => { result = await fn({ session }); });
      return result;
    } finally { await session.endSession(); }
  }
  // Guard: application must still be IN_PROGRESS/SUBMITTED and before its deadline (single conditional write, atomic by itself).
  async function editable(applicationId, studentId, now, ts, opts) {
    const iso = new Date(now).toISOString();
    const hit = await apps.updateOne({ _id: applicationId, student_id: studentId, status: { $in: ['IN_PROGRESS', 'SUBMITTED'] }, individual_deadline: { $gt: iso } },
      { $set: { updated_at: ts } }, opts);
    if (hit.matchedCount) return true;
    await apps.updateOne({ _id: applicationId, status: { $nin: ['SUBMITTED', 'EXPIRED'] }, individual_deadline: { $lte: iso } }, { $set: { status: 'EXPIRED', updated_at: ts } }, opts);
    return false;
  }
  async function skillsByStudent(studentIds) {
    const rows = await db.collection('student_skills').find({ student_id: { $in: studentIds } }).collation(NOCASE).sort({ skill: 1 }).toArray();
    const map = new Map();
    for (const r of rows) (map.get(r.student_id) || map.set(r.student_id, []).get(r.student_id)).push(r.skill);
    return map;
  }

  return {
    // Atomic via the unique (challenge_id, student_id) index (duplicate-key => DUPLICATE); no transaction needed for a single insert.
    async apply({ id, challengeId, studentId, now }) {
      const challenge = await challenges.findOne({ _id: challengeId, status: 'PUBLISHED' });
      if (!challenge) return { status: 'NOT_AVAILABLE' };
      if (now < Date.parse(challenge.application_opens_at) || now > Date.parse(challenge.application_closes_at)) return { status: 'WINDOW_CLOSED' };
      const appliedAt = new Date(now).toISOString();
      const deadline = new Date(now + challenge.individual_task_duration_days * 86400000).toISOString();
      try {
        await apps.insertOne({ _id: id, challenge_id: challengeId, student_id: studentId, applied_at: appliedAt, individual_deadline: deadline, status: 'APPLIED', created_at: appliedAt, updated_at: appliedAt });
      } catch (error) {
        if (error?.code === DUPLICATE) return { status: 'DUPLICATE' };
        throw error;
      }
      return { status: 'OK', application: { id, challengeId, appliedAt, individualDeadline: deadline, status: 'APPLIED' } };
    },
    async getForStudent(id, studentId) { return withId(await apps.findOne({ _id: id, student_id: studentId })); },
    async getForCompany(id, companyId) {
      const app = await apps.findOne({ _id: id });
      if (!app) return undefined;
      const owns = await challenges.findOne({ _id: app.challenge_id, company_id: companyId }, { projection: { _id: 1 } });
      return owns ? withId(app) : undefined;
    },
    async markExpired(id, ts) { await markExpired(id, ts); },
    async markInProgress(id, ts) { await apps.updateOne({ _id: id }, { $set: { status: 'IN_PROGRESS', updated_at: ts } }); },
    async hasEvaluation(applicationId) { return Boolean(await evaluations.findOne({ application_id: applicationId }, { projection: { _id: 1 } })); },
    async hasSubmitted(applicationId) { return Boolean(await submissions.findOne({ application_id: applicationId, submitted_at: { $ne: null } }, { projection: { _id: 1 } })); },
    async studentContactEmail(studentId) {
      const s = await studentsCol.findOne({ _id: studentId }, { projection: { account_id: 1 } });
      const u = s && await db.collection('student_users').findOne({ _id: s.account_id }, { projection: { email: 1 } });
      return u?.email || null;
    },

    async listForStudent(studentId, now, ts) {
      const docs = await apps.find({ student_id: studentId }).sort({ applied_at: -1 }).toArray();
      const ids = docs.map(d => d._id);
      const chById = new Map((await challenges.find({ _id: { $in: [...new Set(docs.map(d => d.challenge_id))] } }).toArray()).map(c => [c._id, c]));
      const coById = new Map((await companies.find({ _id: { $in: [...new Set([...chById.values()].map(c => c.company_id))] } }, { projection: { company_name: 1 } }).toArray()).map(c => [c._id, c.company_name]));
      const subById = new Map((await submissions.find({ application_id: { $in: ids } }).toArray()).map(s => [s.application_id, s]));
      const evById = new Map((await evaluations.find({ application_id: { $in: ids } }).toArray()).map(e => [e.application_id, e]));
      const out = [];
      for (const a of docs) {
        const c = chById.get(a.challenge_id);
        if (!c) continue; // inner-join semantics
        const expired = a.status !== 'SUBMITTED' && Date.parse(a.individual_deadline) <= now;
        if (expired && a.status !== 'EXPIRED') await markExpired(a._id, ts);
        const sub = subById.get(a._id), ev = evById.get(a._id);
        out.push({
          id: a._id, challengeId: a.challenge_id, appliedAt: a.applied_at, individualDeadline: a.individual_deadline,
          status: expired ? 'EXPIRED' : a.status, updatedAt: a.updated_at, roleTitle: c.role_title, challengeStatus: c.status,
          applicationClosesAt: c.application_closes_at, applicationOpensAt: c.application_opens_at,
          taskSnippet: String(c.task_description ?? '').slice(0, 280), isPaid: Boolean(c.is_paid), compensationDetails: c.compensation_details ?? null,
          individualTaskDurationDays: c.individual_task_duration_days, companyName: coById.get(c.company_id) ?? null,
          requiredSkills: c.required_skills || [],
          submission: sub ? { submittedAt: sub.submitted_at ?? null } : null,
          evaluation: evalView(ev) || null,
        });
      }
      return out;
    },
    async listForChallenge(challengeId, now, ts) {
      const docs = await apps.find({ challenge_id: challengeId }).sort({ applied_at: -1 }).toArray();
      const studs = new Map((await studentsCol.find({ _id: { $in: docs.map(d => d.student_id) } }).toArray()).map(s => [s._id, s]));
      const ids = docs.map(d => d._id);
      const subById = new Map((await submissions.find({ application_id: { $in: ids } }).toArray()).map(s => [s.application_id, s]));
      const evById = new Map((await evaluations.find({ application_id: { $in: ids } }).toArray()).map(e => [e.application_id, e]));
      const skills = await skillsByStudent([...studs.keys()]);
      const out = [];
      for (const a of docs) {
        const s = studs.get(a.student_id);
        if (!s) continue;
        let status = a.status;
        if (status !== 'SUBMITTED' && Date.parse(a.individual_deadline) <= now) { await markExpired(a._id, ts); status = 'EXPIRED'; }
        out.push({
          id: a._id, studentId: a.student_id, appliedAt: a.applied_at, individualDeadline: a.individual_deadline, status,
          fullName: s.full_name, college: s.college ?? null, degree: s.degree ?? null,
          submittedAt: subById.get(a._id)?.submitted_at ?? null, isShortlisted: Boolean(evById.get(a._id)?.is_shortlisted), skills: skills.get(a.student_id) || [],
        });
      }
      return out;
    },

    async getSubmission(applicationId, { submittedOnly = false } = {}) {
      return subView(await submissions.findOne({ application_id: applicationId, ...(submittedOnly ? { submitted_at: { $ne: null } } : {}) })) || null;
    },
    async getEvaluation(applicationId) {
      const d = await evaluations.findOne({ application_id: applicationId });
      return d ? { id: d._id, ...evalView(d) } : null;
    },

    async getFile(applicationId, fileId) { return withId(await files.findOne({ _id: fileId, application_id: applicationId })); },
    async getSubmissionFile(applicationId, { submittedOnly = false } = {}) {
      const sub = await submissions.findOne({ application_id: applicationId, file_reference: { $ne: null }, ...(submittedOnly ? { submitted_at: { $ne: null } } : {}) });
      return sub ? withId(await files.findOne({ _id: sub.file_reference, application_id: applicationId })) : undefined;
    },

    async saveDraft({ id, applicationId, githubUrl, deployedUrl, supportingInformation, ts }) {
      const update = {
        $set: { github_url: githubUrl, deployed_url: deployedUrl, supporting_information: supportingInformation, updated_at: ts },
        $setOnInsert: { _id: id, file_reference: null, created_at: ts },
      };
      // Matches only a not-yet-submitted submission (or none: upsert). An already-submitted one makes the upsert collide on the unique index.
      try {
        await submissions.updateOne({ application_id: applicationId, submitted_at: null }, update, { upsert: true });
        return true;
      } catch (error) {
        if (error?.code === DUPLICATE) return false;
        throw error;
      }
    },
    async saveSubmission({ id, applicationId, studentId, githubUrl, deployedUrl, fileReference, supportingInformation, now, ts }) {
      return atomic(async opts => {
        if (!await editable(applicationId, studentId, now, ts, opts)) return false;
        const $set = { github_url: githubUrl, deployed_url: deployedUrl, supporting_information: supportingInformation, submitted_at: ts, updated_at: ts };
        const $setOnInsert = { _id: id, created_at: ts };
        if (fileReference) $set.file_reference = fileReference; else $setOnInsert.file_reference = null; // keep the existing file when none supplied
        await submissions.updateOne({ application_id: applicationId }, { $set, $setOnInsert }, { upsert: true, ...opts });
        await apps.updateOne({ _id: applicationId }, { $set: { status: 'SUBMITTED', updated_at: ts } }, opts);
        return true;
      });
    },
    async saveFile({ fileId, submissionId, applicationId, studentId, storageKey, originalName, mimeType, sizeBytes, now, ts }) {
      return atomic(async opts => {
        if (!await editable(applicationId, studentId, now, ts, opts)) return { ok: false };
        await files.insertOne({ _id: fileId, application_id: applicationId, storage_key: storageKey, original_name: originalName, mime_type: mimeType, size_bytes: sizeBytes, created_at: ts }, opts);
        await submissions.updateOne({ application_id: applicationId }, {
          $set: { file_reference: fileId, updated_at: ts },
          $setOnInsert: { _id: submissionId, github_url: null, deployed_url: null, supporting_information: null, submitted_at: null, created_at: ts },
        }, { upsert: true, ...opts });
        const old = await files.find({ application_id: applicationId, _id: { $ne: fileId } }, opts).toArray();
        if (old.length) await files.deleteMany({ application_id: applicationId, _id: { $ne: fileId } }, opts);
        return { ok: true, replaced: old.map(f => ({ id: f._id, storage_key: f.storage_key })) };
      });
    },
    async saveEvaluation({ id, applicationId, rating, feedback, isShortlisted, evaluatedBy, ts }) {
      await evaluations.updateOne({ application_id: applicationId }, {
        $set: { rating, feedback, is_shortlisted: isShortlisted ? 1 : 0, evaluated_by: evaluatedBy, evaluated_at: ts, updated_at: ts },
        $setOnInsert: { _id: id, created_at: ts },
      }, { upsert: true });
      const d = await evaluations.findOne({ application_id: applicationId });
      return { id: d._id, ...evalView(d) };
    },
  };
}
