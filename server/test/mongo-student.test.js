import '../env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

test('student repository exposes its async interface', async () => {
  const { createStudentRepo, buildStudentProfile } = await import('../repositories/mongo/student.js');
  const repo = createStudentRepo({ db: { collection: () => ({}) } });
  for (const name of ['createAccount', 'saveProfile', 'buildStudentProfile']) assert.equal(typeof repo[name], 'function', name);
  assert.ok(Object.values(repo).every(fn => typeof fn === 'function'));
  assert.equal(typeof buildStudentProfile, 'function');
});

// Live tests run only when MONGODB_URI is set; they use a throwaway database osf_test_<random> that is dropped afterwards.
const uri = process.env.MONGODB_URI;
if (!uri) console.log('SKIP mongo-student live tests: MONGODB_URI is not set (no connection attempted).');

test('mongo student repository: registration+OTP atomicity, login/session, profile round-trip, ownership', { skip: !uri && 'MONGODB_URI not set' }, async () => {
  const { connectMongo } = await import('../repositories/mongo/connect.js');
  const { createMongoRepositories } = await import('../repositories/mongo/index.js');
  const conn = await connectMongo({ uri, dbName: `osf_test_${randomBytes(6).toString('hex')}` });
  try {
    const { student } = await createMongoRepositories(conn);
    const now = Date.now();
    const otp = { hash: 'h', expiresAt: now + 1000, sentAt: now };
    const stamp = new Date().toISOString();
    assert.equal(await student.createAccount({ id: 's1', email: 'a@example.com', passwordHash: 'x', timestamp: stamp, otp }), true);
    assert.equal(await student.createAccount({ id: 's2', email: 'A@Example.com', passwordHash: 'x', timestamp: stamp, otp }), false); // case-insensitive unique
    assert.equal(await conn.db.collection('student_otp_challenges').countDocuments({ student_user_id: 's2' }), 0); // no orphan OTP
    assert.equal((await student.getVerifyRecord('A@EXAMPLE.com')).id, 's1');
    await student.bumpOtpAttempts('s1', 5);
    assert.equal((await student.getVerifyRecord('a@example.com')).attempts, 1);
    assert.equal((await student.findLoginUser('a@example.com')).email_verified, 0);
    await student.completeVerification('s1', stamp);
    assert.equal(await student.getVerifyRecord('a@example.com'), undefined); // OTP gone with verification
    assert.equal((await student.findLoginUser('a@example.com')).email_verified, 1);

    await student.createSession({ tokenHash: 't1', userId: 's1', expiresAt: now + 60000, createdAt: stamp });
    await student.createSession({ tokenHash: 't2', userId: 's1', expiresAt: now + 60000, createdAt: stamp });
    assert.equal((await student.findSession('t1')).student_id, null); // no profile yet
    await student.changePassword('s1', 'newhash', stamp, 't1');
    assert.equal(await student.getPasswordHash('s1'), 'newhash');
    assert.ok(await student.findSession('t1'));
    assert.equal(await student.findSession('t2'), undefined); // other sessions dropped

    const values = { profileVisible: null, fullName: 'Ada', profileImage: null, college: 'MIT', degree: null, graduationYear: 2027, about: null, resumeReference: null, githubUrl: null, linkedinUrl: null, portfolioUrl: null, location: null };
    let n = 0;
    const id = await student.saveProfile({ studentId: null, accountId: 's1', newStudentId: 'st1', newSkillId: () => `k${n++}`, values, skills: ['Rust', 'go'], timestamp: stamp });
    assert.equal(id, 'st1');
    assert.equal((await student.findSession('t1')).student_id, 'st1');
    await student.saveProfile({ studentId: id, accountId: 's1', newStudentId: 'zz', newSkillId: () => `k${n++}`, values: { ...values, fullName: 'Ada L', profileVisible: 0 }, skills: ['Python'], timestamp: stamp });
    const profile = await student.buildStudentProfile('st1', { privateFields: true });
    assert.equal(profile.fullName, 'Ada L'); assert.equal(profile.profileVisible, false); assert.deepEqual(profile.skills, ['Python']); assert.equal(profile.graduationYear, 2027);
    assert.equal('resumeReference' in (await student.buildStudentProfile('st1')), false);
    assert.equal(await student.buildStudentProfile('nope'), undefined);

    const project = await student.createProject({ id: 'p1', studentId: 'st1', title: 'T', description: null, projectUrl: null, timestamp: stamp });
    assert.equal(project.title, 'T');
    assert.equal(await student.projectOwned('p1', 'other'), false); // ownership: other students cannot touch it
    assert.equal(await student.deleteProject('p1', 'other'), false);
    assert.equal((await student.updateProject({ id: 'p1', studentId: 'st1', title: 'T2', description: 'd', projectUrl: null, timestamp: stamp })).title, 'T2');
    assert.equal(await student.deleteProject('p1', 'st1'), true);
  } finally {
    await conn.db.dropDatabase();
    await conn.close();
  }
});
