// Replaces server/migrations/*.sql for the Mongo driver. Idempotent: safe to run on every startup.
// Documents keep the SQL column names; `_id` holds the SQL `id` string.
// Case-insensitive uniqueness (SQL `COLLATE NOCASE`) uses a strength-2 collation; queries must pass the same collation.
export const NOCASE = { locale: 'en', strength: 2 };

export async function ensureIndexes(db) {
  const idx = (name, specs) => db.collection(name).createIndexes(specs);
  await idx('companies', [{ key: { email: 1 }, unique: true, collation: NOCASE, name: 'companies_email_uq' }]);
  await idx('users', [
    { key: { company_id: 1 }, unique: true, name: 'users_company_uq' },
    { key: { user_id: 1 }, unique: true, collation: NOCASE, name: 'users_user_id_uq' },
    { key: { setup_token_hash: 1 }, sparse: true, name: 'users_setup_token_idx' },
  ]);
  await idx('otp_challenges', [{ key: { company_id: 1 }, unique: true, name: 'otp_company_uq' }]);
  // TTL: Mongo deletes the doc when `expires_at_date` passes (checked ~every 60s). Reads still compare `expires_at` (ms).
  await idx('sessions', [
    { key: { token_hash: 1 }, unique: true, name: 'sessions_token_uq' },
    { key: { expires_at_date: 1 }, expireAfterSeconds: 0, name: 'sessions_ttl' },
  ]);

  // Student side (sessions TTL mirrors company sessions). Defined now so the collections are ready when those routes are ported.
  await idx('student_users', [{ key: { email: 1 }, unique: true, collation: NOCASE, name: 'student_users_email_uq' }]);
  await idx('student_otp_challenges', [{ key: { student_user_id: 1 }, unique: true, name: 'student_otp_uq' }]);
  await idx('student_sessions', [
    { key: { token_hash: 1 }, unique: true, name: 'student_sessions_token_uq' },
    { key: { student_user_id: 1 }, name: 'student_sessions_user_idx' },
    { key: { expires_at_date: 1 }, expireAfterSeconds: 0, name: 'student_sessions_ttl' },
  ]);
  await idx('students', [
    { key: { account_id: 1 }, unique: true, name: 'students_account_uq' },
    { key: { college: 1 }, collation: NOCASE, name: 'students_college_idx' },
  ]);
  await idx('challenges', [
    { key: { company_id: 1, created_at: -1 }, name: 'challenges_company_idx' },
    { key: { status: 1, application_opens_at: 1, application_closes_at: 1 }, name: 'challenges_public_window_idx' },
  ]);
  await idx('applications', [
    { key: { challenge_id: 1, student_id: 1 }, unique: true, name: 'applications_challenge_student_uq' },
    { key: { student_id: 1, applied_at: -1 }, name: 'applications_student_idx' },
    { key: { status: 1, individual_deadline: 1 }, name: 'applications_deadline_idx' },
  ]);
  await idx('submissions', [{ key: { application_id: 1 }, unique: true, name: 'submissions_application_uq' }]);
  await idx('submission_files', [{ key: { storage_key: 1 }, unique: true, name: 'submission_files_key_uq' }, { key: { application_id: 1 }, name: 'submission_files_app_idx' }]);
  await idx('evaluations', [{ key: { application_id: 1 }, unique: true, name: 'evaluations_application_uq' }]);
  await idx('skill_assessments', [{ key: { company_id: 1, created_at: -1 }, name: 'assessments_company_idx' }, { key: { status: 1, related_skill: 1 }, collation: NOCASE, name: 'assessments_public_idx' }]);
  await idx('skill_assessment_questions', [{ key: { assessment_id: 1, question_order: 1 }, unique: true, name: 'questions_order_uq' }]);
  // One attempt per student per assessment.
  await idx('skill_assessment_attempts', [
    { key: { assessment_id: 1, student_id: 1 }, unique: true, name: 'attempts_assessment_student_uq' },
    { key: { student_id: 1, started_at: -1 }, name: 'attempts_student_idx' },
  ]);
  await idx('skill_assessment_answers', [{ key: { attempt_id: 1, question_id: 1 }, unique: true, name: 'answers_attempt_question_uq' }]);
  await idx('saved_students', [{ key: { company_id: 1, student_id: 1 }, unique: true, name: 'saved_company_student_uq' }, { key: { student_id: 1 }, name: 'saved_student_idx' }]);
}
