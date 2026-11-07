import '../env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

test('assessments repository exposes its async interface', async () => {
  const { createAssessmentsRepo } = await import('../repositories/mongo/assessments.js');
  const repo = createAssessmentsRepo({ db: { collection: () => ({}) } });
  for (const name of ['createAssessment', 'startAttempt', 'expireAttempts']) assert.equal(typeof repo[name], 'function', name);
  assert.ok(Object.values(repo).every(fn => typeof fn === 'function'));
});

// Live tests run only when MONGODB_URI is set; they use a throwaway database osf_test_<random> that is dropped afterwards.
const uri = process.env.MONGODB_URI;
if (!uri) console.log('SKIP mongo-assessments live tests: MONGODB_URI is not set (no connection attempted).');

test('mongo assessments repository: draft lock, one attempt, privacy, answers+evaluation, talent visibility, saved note', { skip: !uri && 'MONGODB_URI not set' }, async () => {
  const { connectMongo } = await import('../repositories/mongo/connect.js');
  const { createMongoRepositories } = await import('../repositories/mongo/index.js');
  const conn = await connectMongo({ uri, dbName: `osf_test_${randomBytes(6).toString('hex')}` });
  try {
    const { assessments: repo, student } = await createMongoRepositories(conn);
    const ts = new Date().toISOString();
    const C1 = 'co1'; const C2 = 'co2';
    // students: visible, hidden, hidden-but-applied-to-C1, hidden-but-applied-to-C2
    const mk = (id, visible, updated, skills) => Promise.all([
      conn.db.collection('students').insertOne({ _id: id, account_id: `a${id}`, full_name: id, college: 'MIT', profile_visible: visible, created_at: ts, updated_at: updated }),
      conn.db.collection('student_skills').insertMany(skills.map((skill, n) => ({ _id: `${id}k${n}`, student_id: id, skill, created_at: ts }))),
    ]);
    await mk('vis', 1, '2026-01-01', ['Rust', 'Go']); await mk('hid', 0, '2026-01-02', ['Rust']);
    await mk('hidC1', 0, '2026-01-03', ['rust']); await mk('hidC2', 0, '2026-01-04', ['Rust']);
    await conn.db.collection('challenges').insertMany([{ _id: 'ch1', company_id: C1 }, { _id: 'ch2', company_id: C2 }]);
    await conn.db.collection('applications').insertMany([{ _id: 'ap1', challenge_id: 'ch1', student_id: 'hidC1' }, { _id: 'ap2', challenge_id: 'ch2', student_id: 'hidC2' }]);

    // talent: ranking by match count, pagination, visibility exception
    let r = await repo.searchTalent({ companyId: C1, skills: ['rust', 'go'], college: '', limit: 10, offset: 0 });
    assert.deepEqual(r.rows.map(x => [x.id, x.matchCount]), [['vis', 2], ['hidC1', 1]]); // hid + hidC2 hidden from C1
    assert.equal(r.total, 2);
    r = await repo.searchTalent({ companyId: C1, skills: ['rust', 'go'], college: 'mi', limit: 1, offset: 1 });
    assert.deepEqual(r.rows.map(x => x.id), ['hidC1']); assert.equal(r.total, 2);
    assert.equal(await repo.isTalentVisible('vis', C1), true);
    assert.equal(await repo.isTalentVisible('hid', C1), false);
    assert.equal(await repo.isTalentVisible('hidC1', C1), true);
    assert.equal(await repo.isTalentVisible('hidC2', C1), false);
    assert.equal(await repo.isTalentVisible('hidC2', C2), true);

    // saved students note round-trip
    await repo.saveStudent(C1, 'vis', 'first', ts); await repo.saveStudent(C1, 'vis', 'second', ts);
    const savedRows = await repo.listSaved(C1);
    assert.equal(savedRows.length, 1); assert.equal(savedRows[0].note, 'second');
    assert.equal(await repo.removeSaved(C1, 'vis'), true); assert.equal(await repo.removeSaved(C1, 'vis'), false);

    // assessments: draft lock, publish, privacy
    const a = await repo.createAssessment({ id: 'as1', companyId: C1, title: 'T', description: null, relatedSkill: 'Rust', instructions: null, duration: null, timestamp: ts });
    const q = await repo.addQuestion({ id: 'q1', assessmentId: 'as1', questionText: 'Q?', options: ['a', 'b', 'c', 'd'], correctAnswer: 'B', order: 1, timestamp: ts });
    assert.equal(q.correctAnswer, 'B');
    assert.equal(await repo.addQuestion({ id: 'q2', assessmentId: 'as1', questionText: 'Q2', options: ['a', 'b', 'c', 'd'], correctAnswer: 'A', order: 1, timestamp: ts }), null); // duplicate order
    assert.equal(await repo.getOwned('as1', C2), null); // ownership
    await repo.setStatus('as1', 'PUBLISHED', ts);
    assert.equal(await repo.updateIfDraft('as1', C1, { title: 'X', description: null, relatedSkill: 'Rust', instructions: null, duration: null, timestamp: ts }), null); // locked after publish
    const detail = await repo.getForStudent('as1', 'vis');
    assert.equal(detail.questions, undefined); assert.ok(!JSON.stringify(detail).includes('correct'));
    assert.ok(!JSON.stringify(await repo.listPublished()).includes('correct'));

    // attempts: one per student, answers, evaluation
    const att = await repo.startAttempt({ id: 'at1', assessmentId: 'as1', studentId: 'vis', timestamp: ts });
    assert.equal(await repo.startAttempt({ id: 'at2', assessmentId: 'as1', studentId: 'vis', timestamp: ts }), null);
    assert.ok(!JSON.stringify(att).includes('correct'));
    assert.equal(await repo.saveAnswers({ attemptId: 'at1', studentId: 'vis', answers: [{ questionId: 'q1', selectedOption: 'C' }], finalize: false, timestamp: ts, now: Date.now() }), 'IN_PROGRESS');
    assert.equal(await repo.saveAnswers({ attemptId: 'at1', studentId: 'vis', answers: [{ questionId: 'q1', selectedOption: 'B' }], finalize: true, timestamp: ts, now: Date.now() }), 'SUBMITTED');
    assert.equal(await repo.saveAnswers({ attemptId: 'at1', studentId: 'vis', answers: [], finalize: true, timestamp: ts, now: Date.now() }), 'SUBMITTED'); // conflict re-fetch reports winner's state
    const mine = await repo.getStudentAttempt('at1', 'vis');
    assert.equal(mine.questions[0].selectedOption, 'B'); assert.ok(!JSON.stringify(mine).includes('correct'));
    assert.equal(await repo.getStudentAttempt('at1', 'hid'), null);
    assert.equal((await repo.getOwnedAttempt('at1', C2)), null);
    await repo.evaluateAttempt('at1', { score: 90, feedback: 'ok', timestamp: ts });
    const company = await repo.getCompanyAttempt('at1');
    assert.equal(company.questions[0].correctAnswer, 'B'); assert.equal(company.status, 'REVIEWED'); assert.equal(company.manualScore, 90);
    assert.equal(a.attemptCount, 0);
    void student;
  } finally {
    await conn.db.dropDatabase();
    await conn.close();
  }
});
