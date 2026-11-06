import '../env.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { detectTransactionSupport } from '../repositories/mongo/connect.js';

const fakeClient = hello => ({ db: () => ({ command: async () => { if (hello instanceof Error) throw hello; return hello; } }) });

test('transaction capability detection: replica set / mongos yes, standalone / error no', async () => {
  assert.equal(await detectTransactionSupport(fakeClient({ setName: 'rs0' })), true);
  assert.equal(await detectTransactionSupport(fakeClient({ msg: 'isdbgrid' })), true);
  assert.equal(await detectTransactionSupport(fakeClient({ isWritablePrimary: true })), false);
  assert.equal(await detectTransactionSupport(fakeClient(new Error('boom'))), false);
});

// Live tests run only when MONGODB_URI is set; they use a throwaway database osf_test_<random> that is dropped afterwards.
const uri = process.env.MONGODB_URI;
if (!uri) console.log('SKIP mongo-repository live tests: MONGODB_URI is not set (no connection attempted).');

test('mongo auth repository: uniqueness, atomic verification, session TTL index', { skip: !uri && 'MONGODB_URI not set' }, async () => {
  const { connectMongo } = await import('../repositories/mongo/connect.js');
  const { createMongoRepositories } = await import('../repositories/mongo/index.js');
  const dbName = `osf_test_${randomBytes(6).toString('hex')}`;
  const conn = await connectMongo({ uri, dbName });
  try {
    const { auth } = await createMongoRepositories(conn);
    const reg = { companyName: 'Acme', address1: 'a', country: 'India', countryCode: 'IN', city: 'Pune', contactName: 'Z', email: 'Z@Example.com' };
    const otp = { hash: 'h', expiresAt: Date.now() + 1000, sentAt: Date.now() };
    await auth.createRegistration(reg, 'c1', new Date().toISOString(), otp);
    await assert.rejects(auth.createRegistration({ ...reg, email: 'z@example.com' }, 'c2', new Date().toISOString(), otp), { code: 11000 }); // case-insensitive unique email
    assert.equal(await conn.db.collection('companies').countDocuments({ _id: 'c2' }), 0); // no orphan from the failed attempt
    const verify = id => auth.completeVerification({ companyId: 'c1', verifiedAt: new Date().toISOString(), userRowId: id, userId: 'OSF1', setupTokenHash: 't', verifiedTime: Date.now(), setupLifeMs: 1000 });
    assert.equal(await verify('u1'), true);
    assert.equal(await verify('u2'), false); // only one verification wins
    assert.equal(await conn.db.collection('users').countDocuments({ company_id: 'c1' }), 1);
    const indexes = await conn.db.collection('sessions').indexes();
    assert.ok(indexes.some(i => i.expireAfterSeconds === 0), 'sessions TTL index exists');
  } finally {
    await conn.db.dropDatabase();
    await conn.close();
  }
});

test('mongo challenges repository: draft lifecycle, edit lock, open-window public list with pagination', { skip: !uri && 'MONGODB_URI not set' }, async () => {
  const { connectMongo } = await import('../repositories/mongo/connect.js');
  const { createMongoRepositories } = await import('../repositories/mongo/index.js');
  const { challengeOwnedByCompany } = await import('../repositories/challengeOwnership.js');
  const conn = await connectMongo({ uri, dbName: `osf_test_${randomBytes(6).toString('hex')}` });
  try {
    const { challenges } = await createMongoRepositories(conn);
    await conn.db.collection('companies').insertMany([{ _id: 'co1', company_name: 'Acme' }, { _id: 'co2', company_name: 'Other' }]);
    const day = 86400000, now = Date.now(), iso = ms => new Date(ms).toISOString();
    const mk = (title, skills = ['Node']) => ({ roleTitle: title, taskDescription: 'd', requiredSkills: skills, reference: null, language: null, extraInformation: null, isPaid: 0,
      compensationDetails: null, candidateCount: null, applicationOpensAt: iso(now - day), applicationClosesAt: iso(now + day), individualTaskDurationDays: 7 });
    const ts = iso(now);
    await challenges.create(mk('A'), 'a', 'co1', ts);
    assert.deepEqual((await challenges.listForCompany('co1')).map(c => [c.id, c.status, c.applicationCount]), [['a', 'DRAFT', 0]]);
    assert.equal((await challenges.listForCompany('co2')).length, 0);
    assert.equal((await challenges.updateIfDraft('a', 'co1', mk('A2', ['react', 'Node']), ts)).role_title, 'A2');
    assert.equal(await challenges.updateIfDraft('a', 'co2', mk('x'), ts), null); // not the owner
    await assert.rejects(challengeOwnedByCompany(challenges, 'a', 'co2'), { status: 404 });
    assert.deepEqual((await challengeOwnedByCompany(challenges, 'a', 'co1')).requiredSkills, ['Node', 'react']);
    assert.equal((await challenges.publish('a', 'co1', ts)).status, 'PUBLISHED');
    assert.equal(await challenges.updateIfDraft('a', 'co1', mk('A3'), ts), null); // edit lock -> route answers 409
    // Public list: only PUBLISHED and inside the window; ordered by closing date; limit/offset.
    for (const [id, opens, closes] of [['b', -day, 2 * day], ['c', -day, 3 * day], ['future', day, 2 * day], ['past', -3 * day, -day]]) {
      await challenges.create({ ...mk(id), applicationOpensAt: iso(now + opens), applicationClosesAt: iso(now + closes) }, id, 'co1', ts);
      await challenges.publish(id, 'co1', ts);
    }
    await challenges.create(mk('draft'), 'draft', 'co1', ts);
    const open = await challenges.listPublicOpen({ now: iso(now), limit: 100, offset: 0 });
    assert.deepEqual(open.map(c => c.id), ['a', 'b', 'c']);
    assert.equal(open[0].company_name, 'Acme');
    assert.deepEqual((await challenges.listPublicOpen({ now: iso(now), limit: 1, offset: 1 })).map(c => c.id), ['b']);
    assert.deepEqual((await challenges.listPublicOpen({ now: iso(now), skills: ['REACT'], limit: 100, offset: 0 })).map(c => c.id), ['a']); // case-insensitive
    assert.equal(await challenges.getPublic('draft'), null);
    assert.equal(await challenges.close('a', 'co1', ts), true);
    assert.equal(await challenges.getPublic('a'), null);
  } finally {
    await conn.db.dropDatabase();
    await conn.close();
  }
});
