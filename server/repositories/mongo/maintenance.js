// Dev/ops helpers used by scripts/seed-demo.js only (never mounted on the HTTP API).
// Operates on every non-system collection of the connected database; indexes are kept.
import { BSON } from 'mongodb';

export function createMaintenanceRepo({ db }) {
  const names = async () => (await db.listCollections({}, { nameOnly: true }).toArray()).map(c => c.name).filter(n => !n.startsWith('system.')).sort();
  return {
    databaseName: db.databaseName,
    collectionNames: names,
    // Full dump as { collection: [docs] } for a pre-wipe JSON backup.
    async dumpAll() {
      const out = {};
      for (const name of await names()) out[name] = await db.collection(name).find({}).toArray();
      return out;
    },
    serialize: docs => BSON.EJSON.stringify(docs, null, 1),
    // Deletes every document in every collection, then inserts `data` ({ collection: [docs] }). Not atomic across
    // collections (works on standalone servers too); a failed seed leaves a partial demo set that the next run wipes again.
    async replaceAll(data) {
      for (const name of await names()) await db.collection(name).deleteMany({});
      for (const [name, docs] of Object.entries(data)) if (docs.length) await db.collection(name).insertMany(docs);
    },
  };
}
