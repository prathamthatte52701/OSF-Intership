import { ensureIndexes } from './ensureIndexes.js';
import { createAuthRepo } from './auth.js';
import { createChallengesRepo } from './challenges.js';
import { createApplicationsRepo } from './applications.js';
import { createStudentRepo } from './student.js';
import { createAssessmentsRepo } from './assessments.js';
import { createMaintenanceRepo } from './maintenance.js';

// Builds the repository set. Indexes are (re)created here; ensureIndexes.js is the single source of truth for the schema.
export async function createMongoRepositories(conn) {
  await ensureIndexes(conn.db);
  return {
    maintenance: createMaintenanceRepo(conn),
    auth: createAuthRepo(conn),
    challenges: createChallengesRepo(conn),
    student: createStudentRepo(conn),
    applications: createApplicationsRepo(conn),
    assessments: createAssessmentsRepo(conn),
  };
}
