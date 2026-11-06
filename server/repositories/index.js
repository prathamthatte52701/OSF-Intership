// Repository selector. DB_DRIVER=sqlite (default) | mongo.
//
// Interface (plain JS, all methods async): each repository group is an object of functions.
// Ported groups: `auth` (company registration/OTP/setup/login/sessions/profile), `challenges`
// (public + company challenge CRUD), and `student` (student auth/profile/projects + shared
// buildStudentProfile) in both drivers.
// Not yet extracted: applications, assessments, talent/saved students - these still use
// `db.prepare` in platform.js (sqlite only). `db` is returned for them and is null under the
// mongo driver.
export async function createRepositories(driver = process.env.DB_DRIVER || 'sqlite') {
  if (driver === 'sqlite') {
    const { db } = await import('../db.js');
    const { createAuthRepo } = await import('./sqlite/auth.js');
    const { createChallengesRepo } = await import('./sqlite/challenges.js');
    const { createStudentRepo } = await import('./sqlite/student.js');
    return {
      driver, db,
      auth: createAuthRepo(db),
      challenges: createChallengesRepo(db),
      student: createStudentRepo(db),
    };
  }
  if (driver === 'mongo') {
    const { connectMongo } = await import('./mongo/connect.js');
    const { createMongoRepositories } = await import('./mongo/index.js');
    const conn = await connectMongo();
    return { driver, db: null, conn, ...await createMongoRepositories(conn) };
  }
  throw new Error(`Unknown DB_DRIVER "${driver}". Use "sqlite" or "mongo".`);
}
