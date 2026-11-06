CREATE TABLE student_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1)),
  account_status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(account_status IN ('ACTIVE','SUSPENDED')),
  password_created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE student_otp_challenges (
  student_user_id TEXT PRIMARY KEY REFERENCES student_users(id) ON DELETE CASCADE,
  otp_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  resend_count INTEGER NOT NULL DEFAULT 0,
  resend_window_started_at INTEGER NOT NULL,
  last_sent_at INTEGER NOT NULL
);
CREATE TABLE student_sessions (
  token_hash TEXT PRIMARY KEY,
  student_user_id TEXT NOT NULL REFERENCES student_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX student_sessions_expiry_idx ON student_sessions(expires_at);
CREATE INDEX student_sessions_user_idx ON student_sessions(student_user_id);

CREATE TABLE students (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL UNIQUE REFERENCES student_users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  profile_image TEXT,
  college TEXT,
  degree TEXT,
  graduation_year INTEGER CHECK(graduation_year IS NULL OR graduation_year BETWEEN 1950 AND 2200),
  about TEXT,
  resume_reference TEXT,
  github_url TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  location TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX students_college_idx ON students(college COLLATE NOCASE);
CREATE TABLE student_skills (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  skill TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  UNIQUE(student_id, skill)
);
CREATE INDEX student_skills_skill_idx ON student_skills(skill COLLATE NOCASE);
CREATE TABLE student_projects (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  project_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX student_projects_student_idx ON student_projects(student_id);

CREATE TABLE challenges (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role_title TEXT NOT NULL,
  reference TEXT,
  task_description TEXT NOT NULL,
  language TEXT,
  extra_information TEXT,
  is_paid INTEGER NOT NULL DEFAULT 0 CHECK(is_paid IN (0,1)),
  compensation_details TEXT,
  candidate_count INTEGER CHECK(candidate_count IS NULL OR candidate_count >= 0),
  application_opens_at TEXT NOT NULL,
  application_closes_at TEXT NOT NULL,
  individual_task_duration_days INTEGER NOT NULL CHECK(individual_task_duration_days BETWEEN 1 AND 365),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','CLOSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK(application_closes_at >= application_opens_at)
);
CREATE INDEX challenges_company_idx ON challenges(company_id, created_at DESC);
CREATE INDEX challenges_public_window_idx ON challenges(status, application_opens_at, application_closes_at);
CREATE TABLE challenge_skills (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  skill TEXT NOT NULL COLLATE NOCASE,
  created_at TEXT NOT NULL,
  UNIQUE(challenge_id, skill)
);
CREATE INDEX challenge_skills_skill_idx ON challenge_skills(skill COLLATE NOCASE);

CREATE TABLE applications (
  id TEXT PRIMARY KEY,
  challenge_id TEXT NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  applied_at TEXT NOT NULL,
  individual_deadline TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'APPLIED' CHECK(status IN ('APPLIED','IN_PROGRESS','SUBMITTED','EXPIRED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(challenge_id, student_id)
);
CREATE INDEX applications_student_idx ON applications(student_id, applied_at DESC);
CREATE INDEX applications_challenge_idx ON applications(challenge_id, applied_at DESC);
CREATE INDEX applications_deadline_idx ON applications(status, individual_deadline);

CREATE TABLE submission_files (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  storage_key TEXT NOT NULL UNIQUE,
  original_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK(size_bytes BETWEEN 1 AND 10485760),
  created_at TEXT NOT NULL,
  UNIQUE(application_id, id)
);
CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  github_url TEXT,
  deployed_url TEXT,
  file_reference TEXT,
  supporting_information TEXT,
  submitted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(application_id, file_reference) REFERENCES submission_files(application_id, id)
);
CREATE INDEX submissions_application_idx ON submissions(application_id);

CREATE TABLE evaluations (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  rating INTEGER CHECK(rating IS NULL OR rating BETWEEN 1 AND 5),
  feedback TEXT,
  is_shortlisted INTEGER NOT NULL DEFAULT 0 CHECK(is_shortlisted IN (0,1)),
  evaluated_by TEXT NOT NULL REFERENCES users(id),
  evaluated_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX evaluations_shortlist_idx ON evaluations(is_shortlisted, updated_at DESC);

CREATE TABLE skill_assessments (
  id TEXT PRIMARY KEY,
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  related_skill TEXT NOT NULL,
  instructions TEXT,
  duration_minutes INTEGER CHECK(duration_minutes IS NULL OR duration_minutes BETWEEN 1 AND 1440),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','PUBLISHED','CLOSED')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX skill_assessments_company_idx ON skill_assessments(company_id, created_at DESC);
CREATE INDEX skill_assessments_public_idx ON skill_assessments(status, related_skill COLLATE NOCASE);
CREATE TABLE skill_assessment_questions (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES skill_assessments(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  option_a TEXT NOT NULL,
  option_b TEXT NOT NULL,
  option_c TEXT NOT NULL,
  option_d TEXT NOT NULL,
  correct_answer TEXT NOT NULL CHECK(correct_answer IN ('A','B','C','D')),
  question_order INTEGER NOT NULL CHECK(question_order > 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(assessment_id, question_order)
);
CREATE INDEX assessment_questions_assessment_idx ON skill_assessment_questions(assessment_id, question_order);
CREATE TABLE skill_assessment_attempts (
  id TEXT PRIMARY KEY,
  assessment_id TEXT NOT NULL REFERENCES skill_assessments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  submitted_at TEXT,
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS' CHECK(status IN ('IN_PROGRESS','SUBMITTED','REVIEWED','EXPIRED')),
  review_status TEXT NOT NULL DEFAULT 'PENDING' CHECK(review_status IN ('PENDING','REVIEWED')),
  manual_score REAL CHECK(manual_score IS NULL OR manual_score BETWEEN 0 AND 100),
  company_feedback TEXT,
  reviewed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(assessment_id, student_id)
);
CREATE INDEX assessment_attempts_assessment_idx ON skill_assessment_attempts(assessment_id, submitted_at DESC);
CREATE INDEX assessment_attempts_student_idx ON skill_assessment_attempts(student_id, started_at DESC);
CREATE TABLE skill_assessment_answers (
  id TEXT PRIMARY KEY,
  attempt_id TEXT NOT NULL REFERENCES skill_assessment_attempts(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL REFERENCES skill_assessment_questions(id) ON DELETE CASCADE,
  selected_option TEXT NOT NULL CHECK(selected_option IN ('A','B','C','D')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(attempt_id, question_id)
);
CREATE INDEX assessment_answers_attempt_idx ON skill_assessment_answers(attempt_id);

CREATE TABLE saved_students (
  company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  note TEXT,
  created_at TEXT NOT NULL,
  PRIMARY KEY(company_id, student_id)
);
CREATE INDEX saved_students_student_idx ON saved_students(student_id);
