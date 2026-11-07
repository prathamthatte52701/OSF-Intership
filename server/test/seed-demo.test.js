import test from 'node:test';
import assert from 'node:assert/strict';
import { skip, useThrowawayDb } from '../testSupport/mongo.js';

test('seed is idempotent, populates expected documents, passwords verify', { skip }, async () => {
  const mongo = await useThrowawayDb();
  let repos;
  try {
    const { createRepositories } = await import('../repositories/index.js');
    const { seed, generatePassword } = await import('../scripts/seed-demo.js');
    const sec = await import('../security.js');
    repos = await createRepositories();
    const { db } = mongo;
    const password = generatePassword();
    assert.ok(sec.validatePassword(password));
    let creds;
    for (let i = 0; i < 2; i++) creds = await seed(repos, { password, ...sec });
    const n = c => db.collection(c).countDocuments();
    assert.deepEqual(await Promise.all(['companies', 'users', 'students', 'challenges', 'applications', 'saved_students', 'skill_assessments', 'skill_assessment_questions', 'skill_assessment_attempts'].map(n)), [5, 5, 5, 12, 8, 2, 1, 5, 1]);
    const now = new Date().toISOString();
    assert.equal(await db.collection('challenges').countDocuments({ status: 'PUBLISHED', application_opens_at: { $lte: now }, application_closes_at: { $gte: now } }), 5);
    assert.equal((await db.collection('applications').distinct('status')).length, 4);
    // no dangling references
    const ids = async c => new Set((await db.collection(c).find({}, { projection: { _id: 1 } }).toArray()).map(d => d._id));
    const [studentIds, challengeIds, companyIds] = await Promise.all([ids('students'), ids('challenges'), ids('companies')]);
    for (const a of await db.collection('applications').find().toArray()) assert.ok(challengeIds.has(a.challenge_id) && studentIds.has(a.student_id));
    for (const c of await db.collection('challenges').find().toArray()) assert.ok(companyIds.has(c.company_id));
    const attempt = await db.collection('skill_assessment_attempts').findOne();
    assert.equal(attempt.answers.length, 5);
    const hashes = [...await db.collection('users').find().toArray(), ...await db.collection('student_users').find().toArray()].map(u => u.password_hash);
    assert.equal(hashes.length, creds.length);
    for (const h of hashes) assert.ok(await sec.verifyPassword(h, password));
    assert.match((await db.collection('users').findOne()).user_id, /^OSF-\d{6}$/);
    assert.deepEqual((await db.collection('challenges').findOne({ role_title: 'Full Stack Developer Intern' })).required_skills, ['Git', 'Node.js', 'React', 'REST APIs', 'SQLite']);
  } finally {
    await repos?.conn.close();
    await mongo.drop();
  }
});
