-- Allow uploaded files and supporting information to be saved before final submission.
ALTER TABLE submissions RENAME TO submissions_before_drafts;
DROP INDEX submissions_application_idx;

CREATE TABLE submissions (
  id TEXT PRIMARY KEY,
  application_id TEXT NOT NULL UNIQUE REFERENCES applications(id) ON DELETE CASCADE,
  github_url TEXT,
  deployed_url TEXT,
  file_reference TEXT,
  supporting_information TEXT,
  submitted_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(application_id, file_reference) REFERENCES submission_files(application_id, id)
);

INSERT INTO submissions(id,application_id,github_url,deployed_url,file_reference,supporting_information,submitted_at,created_at,updated_at)
SELECT id,application_id,github_url,deployed_url,file_reference,supporting_information,submitted_at,created_at,updated_at
FROM submissions_before_drafts;

DROP TABLE submissions_before_drafts;
CREATE INDEX submissions_application_idx ON submissions(application_id);
