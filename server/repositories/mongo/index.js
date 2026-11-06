import { ensureIndexes } from './ensureIndexes.js';
import { createAuthRepo } from './auth.js';
import { createChallengesRepo } from './challenges.js';
import { createStudentRepo } from './student.js';

// Builds the Mongo repository set. Indexes are (re)created here, replacing SQL migrations.
export async function createMongoRepositories(conn) {
  await ensureIndexes(conn.db);
  return { auth: createAuthRepo(conn), challenges: createChallengesRepo(conn), student: createStudentRepo(conn) };
}
