// Shared by the DB-backed tests. MongoDB is the only database, so these tests need a live server: set MONGODB_URI
// (e.g. in the repo-root .env). Without it every DB-backed test is SKIPPED (no connection attempted), like the mongo-*.test.js files.
// Each test file gets its own throwaway database osf_test_<random>, dropped by drop(). Call before importing ../index.js
// (the app reads MONGODB_DB when it connects).
import '../env.js';
import { randomBytes } from 'node:crypto';
import { MongoClient } from 'mongodb';

export const skip = process.env.MONGODB_URI ? false : 'MONGODB_URI not set';
if (skip) console.log('SKIP live Mongo tests: MONGODB_URI is not set (no connection attempted).');

export async function useThrowawayDb() {
  if (skip) return null;
  const dbName = `osf_test_${randomBytes(6).toString('hex')}`;
  process.env.MONGODB_DB = dbName;
  const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName);
  return { db, dbName, async drop() { await db.dropDatabase(); await client.close(); } };
}
