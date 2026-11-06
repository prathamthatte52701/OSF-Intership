import { ensureIndexes } from './ensureIndexes.js';
import { createAuthRepo } from './auth.js';
import { createStudentRepo } from './student.js';

// Builds the Mongo repository set. Indexes are (re)created here, replacing SQL migrations.
export async function createMongoRepositories(conn) {
  await ensureIndexes(conn.db);
  return { auth: createAuthRepo(conn), student: createStudentRepo(conn) };
}
