// MongoDB implementation of the challenges repository.
// Skills are embedded as `required_skills` (sorted case-insensitively, like SQL ORDER BY ... COLLATE NOCASE).
import { NOCASE } from './ensureIndexes.js';

const sortSkills = skills => [...skills].sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; });
const toRow = (doc, extra = {}) => {
  if (!doc) return null;
  const { _id, required_skills, ...rest } = doc;
  return { ...rest, id: _id, requiredSkills: required_skills || [], ...extra };
};
const fieldsOf = c => ({
  role_title: c.roleTitle, reference: c.reference, task_description: c.taskDescription, language: c.language, extra_information: c.extraInformation,
  is_paid: c.isPaid, compensation_details: c.compensationDetails, candidate_count: c.candidateCount,
  application_opens_at: c.applicationOpensAt, application_closes_at: c.applicationClosesAt, individual_task_duration_days: c.individualTaskDurationDays,
  required_skills: sortSkills(c.requiredSkills),
});

export function createChallengesRepo({ db }) {
  const challenges = db.collection('challenges');
  const companies = db.collection('companies');
  const applications = db.collection('applications');

  async function withCompanyNames(docs) {
    const ids = [...new Set(docs.map(d => d.company_id))];
    const names = new Map((await companies.find({ _id: { $in: ids } }, { projection: { company_name: 1 } }).toArray()).map(c => [c._id, c.company_name]));
    return docs.filter(d => names.has(d.company_id)).map(d => toRow(d, { company_name: names.get(d.company_id) })); // inner-join semantics
  }

  return {
    async listPublicOpen({ skills = [], now, limit, offset }) {
      const filter = { status: 'PUBLISHED', application_opens_at: { $lte: now }, application_closes_at: { $gte: now } };
      if (skills.length) filter.required_skills = { $in: skills };
      const docs = await challenges.find(filter, { collation: NOCASE }).sort({ application_closes_at: 1, _id: 1 }).skip(offset).limit(limit).toArray();
      return withCompanyNames(docs);
    },
    async getPublic(id) {
      const doc = await challenges.findOne({ _id: id, status: 'PUBLISHED' });
      return doc ? (await withCompanyNames([doc]))[0] || null : null;
    },
    async create(challenge, id, companyId, ts) {
      const doc = { _id: id, company_id: companyId, ...fieldsOf(challenge), status: 'DRAFT', created_at: ts, updated_at: ts };
      await challenges.insertOne(doc);
      return toRow(doc);
    },
    async listForCompany(companyId) {
      const docs = await challenges.find({ company_id: companyId }).sort({ created_at: -1 }).toArray();
      const counts = new Map((await applications.aggregate([
        { $match: { challenge_id: { $in: docs.map(d => d._id) } } }, { $group: { _id: '$challenge_id', count: { $sum: 1 } } },
      ]).toArray()).map(r => [r._id, r.count]));
      return docs.map(d => toRow(d, { applicationCount: counts.get(d._id) || 0 }));
    },
    async getOwned(id, companyId) { return toRow(await challenges.findOne({ _id: id, company_id: companyId })); },
    // Single conditional update: atomic with respect to a concurrent publish/close.
    async updateIfDraft(id, companyId, challenge, ts) {
      return toRow(await challenges.findOneAndUpdate({ _id: id, company_id: companyId, status: 'DRAFT' }, { $set: { ...fieldsOf(challenge), updated_at: ts } }, { returnDocument: 'after' }));
    },
    async publish(id, companyId, ts) {
      return toRow(await challenges.findOneAndUpdate({ _id: id, company_id: companyId }, { $set: { status: 'PUBLISHED', updated_at: ts } }, { returnDocument: 'after' }));
    },
    async close(id, companyId, ts) {
      return (await challenges.updateOne({ _id: id, company_id: companyId }, { $set: { status: 'CLOSED', updated_at: ts } })).matchedCount > 0;
    },
  };
}
