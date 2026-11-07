// MongoDB connection + capability detection. Never logs the URI (it contains credentials).
import { MongoClient } from 'mongodb';

// Transactions need a replica set (or sharded cluster). A standalone mongod rejects startSession().withTransaction.
// `hello` reports `setName` for replica set members and `msg: 'isdbgrid'` for mongos.
export async function detectTransactionSupport(client) {
  try {
    const hello = await client.db('admin').command({ hello: 1 });
    return Boolean(hello.setName || hello.msg === 'isdbgrid');
  } catch {
    return false; // be conservative: use the findOneAndUpdate fallback path
  }
}

export async function connectMongo({ uri = process.env.MONGODB_URI, dbName = process.env.MONGODB_DB } = {}) {
  if (!uri) throw new Error('MONGODB_URI is required (URL-encode special characters in the password).');
  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 });
  await client.connect();
  const db = client.db(dbName || undefined); // falls back to the database named in the URI, else "test"
  const supportsTransactions = await detectTransactionSupport(client);
  console.log(`MongoDB connected; atomic operations use ${supportsTransactions ? 'multi-document transactions' : 'conditional findOneAndUpdate fallback (standalone server)'}.`);
  return { client, db, supportsTransactions, close: () => client.close() };
}
