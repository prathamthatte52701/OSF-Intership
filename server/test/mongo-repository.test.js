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
