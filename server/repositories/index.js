// Repository layer. MongoDB is the only database; connection comes from MONGODB_URI (+ optional MONGODB_DB).
//
// Interface (plain JS, all methods async): each repository group is an object of functions:
// `auth` (company registration/OTP/setup/login/sessions/profile), `challenges` (public + company challenge CRUD),
// `student` (student auth/profile/projects + shared buildStudentProfile), `applications` (apply/start/submit/evaluate/
// files/drafts), `assessments` (assessments + talent discovery + saved students), `maintenance` (seed script only).
export async function createRepositories() {
  const { connectMongo } = await import('./mongo/connect.js');
  const { createMongoRepositories } = await import('./mongo/index.js');
  const conn = await connectMongo();
  return { conn, ...await createMongoRepositories(conn) };
}
