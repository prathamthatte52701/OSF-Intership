import '../env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';

test('applications repositories expose the same interface in both drivers', async () => {
  const [{ createApplicationsRepo: sqliteRepo }, { createApplicationsRepo: mongoRepo }] =
    await Promise.all([import('../repositories/sqlite/applications.js'), import('../repositories/mongo/applications.js')]);
  const names = repo => Object.keys(repo).sort();
  assert.deepEqual(names(mongoRepo({ db: { collection: () => ({}) } })), names(sqliteRepo(null)));
});

// Live tests run only when MONGODB_URI is set; they use a throwaway database osf_test_<random>.
const uri = process.env.MONGODB_URI;
if (!uri) console.log('SKIP mongo-applications live tests: MONGODB_URI is not set (no connection attempted).');

test('mongo applications repository: apply/duplicate, draft vs submit, evaluation rules, ownership', { skip: !uri && 'MONGODB_URI not set' }, async () => {
  const { connectMongo } = await import('../repositories/mongo/connect.js');
  const { createMongoRepositories } = await import('../repositories/mongo/index.js');
  const conn = await connectMongo({ uri, dbName: `osf_test_${randomBytes(6).toString('hex')}` });
  try {
    const { applications } = await createMongoRepositories(conn);
    const { db } = conn;
    const now = Date.now(), iso = new Date(now).toISOString(), ts = iso;
    await db.collection('companies').insertMany([{ _id: 'co1', company_name: 'Acme', email: 'a@x.com' }, { _id: 'co2', company_name: 'Other', email: 'b@x.com' }]);
    await db.collection('challenges').insertMany([
      { _id: 'ch1', company_id: 'co1', role_title: 'Dev', task_description: 'Build', is_paid: 0, application_opens_at: new Date(now - 1e6).toISOString(), application_closes_at: new Date(now + 1e6).toISOString(), individual_task_duration_days: 3, status: 'PUBLISHED', required_skills: ['go'] },
      { _id: 'ch2', company_id: 'co1', role_title: 'Old', task_description: 'x', application_opens_at: new Date(now - 2e6).toISOString(), application_closes_at: new Date(now - 1e6).toISOString(), individual_task_duration_days: 3, status: 'PUBLISHED', required_skills: [] },
    ]);
    await db.collection('students').insertOne({ _id: 'st1', account_id: 'u1', full_name: 'Ada' });

    assert.equal((await applications.apply({ id: 'a1', challengeId: 'ch2', studentId: 'st1', now })).status, 'WINDOW_CLOSED');
    assert.equal((await applications.apply({ id: 'a1', challengeId: 'nope', studentId: 'st1', now })).status, 'NOT_AVAILABLE');
    assert.equal((await applications.apply({ id: 'a1', challengeId: 'ch1', studentId: 'st1', now })).status, 'OK');
    assert.equal((await applications.apply({ id: 'a2', challengeId: 'ch1', studentId: 'st1', now })).status, 'DUPLICATE');

    assert.equal((await applications.listForStudent('st1', now, ts))[0].id, 'a1');
    const listed = await applications.listForChallenge('ch1', now, ts);
    assert.equal(listed.length, 1); assert.equal(listed[0].submittedAt, null); assert.equal(listed[0].isShortlisted, false);

    // Ownership: cross-company lookup is undefined (route returns 404).
    assert.ok(await applications.getForCompany('a1', 'co1'));
    assert.equal(await applications.getForCompany('a1', 'co2'), undefined);
    assert.equal(await applications.getForStudent('a1', 'other'), undefined);

    // Cannot edit until started.
    assert.equal(await applications.saveSubmission({ id: 's0', applicationId: 'a1', studentId: 'st1', githubUrl: null, deployedUrl: null, fileReference: null, supportingInformation: 'x', now, ts }), false);
    await applications.markInProgress('a1', ts);

    // Draft does not set submitted.
    assert.equal(await applications.saveDraft({ id: 's1', applicationId: 'a1', githubUrl: null, deployedUrl: null, supportingInformation: 'wip', ts }), true);
    assert.equal((await applications.getSubmission('a1')).submittedAt, null);
    assert.equal(await applications.getSubmission('a1', { submittedOnly: true }), null);
    assert.equal(await applications.hasSubmitted('a1'), false);

    // File replacement removes the old metadata row and reports it for disk cleanup.
    const f = n => ({ fileId: `f${n}`, submissionId: `x${n}`, applicationId: 'a1', studentId: 'st1', storageKey: `k${n}.txt`, originalName: 'a.txt', mimeType: 'text/plain', sizeBytes: 1, now, ts });
    assert.deepEqual((await applications.saveFile(f(1))).replaced, []);
    const second = await applications.saveFile(f(2));
    assert.deepEqual(second.replaced.map(r => r.storage_key), ['k1.txt']);
    assert.equal(await applications.getFile('a1', 'f1'), undefined);
    assert.equal((await applications.getSubmissionFile('a1')).id, 'f2');

    // Submission sets submitted_at + SUBMITTED.
    assert.equal(await applications.saveSubmission({ id: 's2', applicationId: 'a1', studentId: 'st1', githubUrl: 'https://github.com/a/b', deployedUrl: null, fileReference: null, supportingInformation: null, now, ts }), true);
    assert.ok((await applications.getSubmission('a1', { submittedOnly: true })).submittedAt);
    assert.equal((await applications.getSubmission('a1')).fileReference, 'f2'); // existing file kept
    assert.equal((await applications.getForStudent('a1', 'st1')).status, 'SUBMITTED');
    assert.equal(await applications.saveDraft({ id: 's3', applicationId: 'a1', githubUrl: null, deployedUrl: null, supportingInformation: 'late', ts }), false); // drafts blocked after submit
    assert.equal(await applications.hasSubmitted('a1'), true);

    // Evaluation: stored, upserted, and its existence is what blocks further edits (route checks hasEvaluation).
    assert.equal(await applications.hasEvaluation('a1'), false);
    const ev = await applications.saveEvaluation({ id: 'e1', applicationId: 'a1', rating: 4, feedback: 'ok', isShortlisted: true, evaluatedBy: 'u', ts });
    assert.equal(ev.rating, 4); assert.equal(ev.isShortlisted, 1);
    assert.equal(await applications.hasEvaluation('a1'), true);
    assert.equal((await applications.listForChallenge('ch1', now, ts))[0].isShortlisted, true);
  } finally {
    await conn.db.dropDatabase();
    await conn.client.close();
  }
});
