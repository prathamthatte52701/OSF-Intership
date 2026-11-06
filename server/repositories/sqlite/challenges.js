// SQLite implementation of the challenges repository. Same interface as mongo/challenges.js.
// Rows keep SQL column names (snake_case) plus `requiredSkills` (sorted, case-insensitive).
// `challenge` inputs are validated objects from validateChallenge (camelCase).
import { randomBytes } from 'node:crypto';

const skillId = () => randomBytes(16).toString('hex');
const COLS = 'role_title=@roleTitle,reference=@reference,task_description=@taskDescription,language=@language,extra_information=@extraInformation,is_paid=@isPaid,compensation_details=@compensationDetails,candidate_count=@candidateCount,application_opens_at=@applicationOpensAt,application_closes_at=@applicationClosesAt,individual_task_duration_days=@individualTaskDurationDays';

export function createChallengesRepo(db) {
  const skillsOf = id => db.prepare('SELECT skill FROM challenge_skills WHERE challenge_id=? ORDER BY skill COLLATE NOCASE').all(id).map(r => r.skill);
  const withSkills = row => row && { ...row, requiredSkills: skillsOf(row.id) };
  const byId = id => withSkills(db.prepare('SELECT * FROM challenges WHERE id=?').get(id));
  const fields = challenge => { const { requiredSkills, ...rest } = challenge; return rest; };
  const replaceSkills = (id, skills, ts) => {
    db.prepare('DELETE FROM challenge_skills WHERE challenge_id=?').run(id);
    const insert = db.prepare('INSERT INTO challenge_skills(id,challenge_id,skill,created_at) VALUES (?,?,?,?)');
    for (const skill of skills) insert.run(skillId(), id, skill, ts);
  };

  return {
    // Published challenges inside their application window, soonest-closing first. skills: optional case-insensitive any-match.
    async listPublicOpen({ skills = [], now, limit, offset }) {
      const clauses = ["c.status='PUBLISHED'", 'c.application_opens_at<=?', 'c.application_closes_at>=?'];
      const params = [now, now];
      if (skills.length) {
        clauses.push(`EXISTS (SELECT 1 FROM challenge_skills cs WHERE cs.challenge_id=c.id AND cs.skill IN (${skills.map(() => '?').join(',')} COLLATE NOCASE))`);
        params.push(...skills);
      }
      return db.prepare(`SELECT c.*,co.company_name AS company_name FROM challenges c
        JOIN companies co ON co.id=c.company_id WHERE ${clauses.join(' AND ')} ORDER BY c.application_closes_at ASC LIMIT ? OFFSET ?`)
        .all(...params, limit, offset).map(withSkills);
    },
    async getPublic(id) {
      return withSkills(db.prepare(`SELECT c.*,co.company_name AS company_name FROM challenges c
        JOIN companies co ON co.id=c.company_id WHERE c.id=? AND c.status='PUBLISHED'`).get(id));
    },
    async create(challenge, id, companyId, ts) {
      db.transaction(() => {
        db.prepare(`INSERT INTO challenges(id,company_id,role_title,reference,task_description,language,extra_information,is_paid,compensation_details,candidate_count,
          application_opens_at,application_closes_at,individual_task_duration_days,status,created_at,updated_at)
          VALUES (@id,@companyId,@roleTitle,@reference,@taskDescription,@language,@extraInformation,@isPaid,@compensationDetails,@candidateCount,
          @applicationOpensAt,@applicationClosesAt,@individualTaskDurationDays,'DRAFT',@ts,@ts)`).run({ ...fields(challenge), id, companyId, ts });
        replaceSkills(id, challenge.requiredSkills, ts);
      })();
      return byId(id);
    },
    async listForCompany(companyId) {
      return db.prepare('SELECT * FROM challenges WHERE company_id=? ORDER BY created_at DESC').all(companyId)
        .map(row => ({ ...withSkills(row), applicationCount: db.prepare('SELECT COUNT(*) AS count FROM applications WHERE challenge_id=?').get(row.id).count }));
    },
    // Ownership-scoped fetch: null when the challenge does not exist or belongs to another company.
    async getOwned(id, companyId) {
      return withSkills(db.prepare('SELECT * FROM challenges WHERE id=? AND company_id=?').get(id, companyId));
    },
    // Draft-only edit: returns the updated row, or null when not owned / no longer DRAFT.
    async updateIfDraft(id, companyId, challenge, ts) {
      let changed = 0;
      db.transaction(() => {
        changed = db.prepare(`UPDATE challenges SET ${COLS},updated_at=@ts WHERE id=@id AND company_id=@companyId AND status='DRAFT'`)
          .run({ ...fields(challenge), ts, id, companyId }).changes;
        if (changed) replaceSkills(id, challenge.requiredSkills, ts);
      })();
      return changed ? byId(id) : null;
    },
    async publish(id, companyId, ts) {
      db.prepare("UPDATE challenges SET status='PUBLISHED',updated_at=? WHERE id=? AND company_id=?").run(ts, id, companyId);
      return byId(id);
    },
    async close(id, companyId, ts) {
      return db.prepare("UPDATE challenges SET status='CLOSED',updated_at=? WHERE id=? AND company_id=?").run(ts, id, companyId).changes > 0;
    },
  };
}
