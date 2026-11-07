# OSF server

Express + MongoDB API. Copy `.env.example` to `.env` (repo root) for local configuration; `MONGODB_URI` is required.

## Rate limiting

- Failed logins: 10 per 15 minutes per IP + attempted identifier; a successful login resets the count.
- General: 600 requests / 15 min per signed-in session (hashed cookie), 100 / 15 min per IP when anonymous.
- Exempt: `/api/health`, `/api/auth/session`, `/api/student/auth/session`.
- Every 429 is JSON `{ "error": "..." }` with a `Retry-After` header (seconds).

### `TRUST_PROXY`

Set `TRUST_PROXY` to the number of reverse-proxy hops in front of the API (for example `1`). Leave it unset in
development. Without it, everyone behind one proxy shares a single IP bucket; set it only when a proxy you control
sets `X-Forwarded-For`, otherwise clients can spoof their IP.

## Database (MongoDB)

MongoDB is the only database. There is no driver switch and no SQL.

| Variable | Default | Meaning |
| --- | --- | --- |
| `MONGODB_URI` | - | Required connection string. Never commit it; keep it in `.env`. |
| `MONGODB_DB` | database in the URI, else `test` | Optional database name override |

Code lives in `server/repositories/mongo/`, one repository per route group (`auth`, `challenges`, `student`, `applications`,
`assessments`), plus `maintenance` (used only by the seed script). `ensureIndexes.js` is the single source of truth for the
schema (there are no migrations); it runs at startup and is idempotent. Documents keep snake_case field names and use the
string id as `_id`.

### Demo data

`npm run seed:demo` (dry run) / `npm run seed:demo -- --yes` wipes **every collection** of the configured database and loads
the demo dataset. It refuses to run with `NODE_ENV=production`. Before wiping it dumps each collection as JSON to
`server/data/backups/<timestamp>/`; the credentials are written to `server/data/demo-credentials.txt` (both ignored by Git).
Point it at a development database only.

### Transactions

At connect time `connectMongo` sends `hello`: a replica set (`setName`) or `mongos` uses multi-document transactions; a
standalone server uses the fallback path (atomic conditional `updateOne`/`findOneAndUpdate` plus compensating deletes on
failure). The chosen path is logged once at startup.

### MongoDB Atlas

- Atlas > Network Access: add the IP of the machine/host running the API (or your CIDR range). Connections from other IPs time out.
- Atlas clusters are replica sets, so the transaction path is used.
- Special characters in the connection-string password (`@ : / ? # %`) must be URL-encoded, e.g. `p@ss/word` -> `p%40ss%2Fword`.
- Tests: every DB-backed test file creates a throwaway database `osf_test_<random>` (dropped afterwards) and is skipped, with a notice, when `MONGODB_URI` is not set. Shared helper: `testSupport/mongo.js`.
