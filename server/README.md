# OSF server

Express + better-sqlite3 API. Copy `.env.example` to `.env` for local configuration.

## Rate limiting

- Failed logins: 10 per 15 minutes per IP + attempted identifier; a successful login resets the count.
- General: 600 requests / 15 min per signed-in session (hashed cookie), 100 / 15 min per IP when anonymous.
- Exempt: `/api/health`, `/api/auth/session`, `/api/student/auth/session`.
- Every 429 is JSON `{ "error": "..." }` with a `Retry-After` header (seconds).

### `TRUST_PROXY`

Set `TRUST_PROXY` to the number of reverse-proxy hops in front of the API (for example `1`). Leave it unset in
development. Without it, everyone behind one proxy shares a single IP bucket; set it only when a proxy you control
sets `X-Forwarded-For`, otherwise clients can spoof their IP.

## Database drivers (`DB_DRIVER`)

| Variable | Default | Meaning |
| --- | --- | --- |
| `DB_DRIVER` | `sqlite` | `sqlite` (default, unchanged behaviour) or `mongo` (partial, see below) |
| `MONGODB_URI` | - | Connection string, required when `DB_DRIVER=mongo`. Never commit it; keep it in `.env`. |
| `MONGODB_DB` | database in the URI | Optional database name override |

Code lives in `server/repositories/` (`sqlite/` and `mongo/`, each exposing the same async functions per route group).
`ensureIndexes.js` replaces SQL migrations on the Mongo path and runs at startup (idempotent).

**Status:** only the company `auth` group (registration, OTP, password setup, login, sessions, company profile) goes through
repositories. Student, challenge, application, assessment and talent routes still use SQLite directly in `platform.js`, so
under `DB_DRIVER=mongo` those `/api` endpoints return `501`. `scripts/seed-demo.js` is SQLite-only. The Mongo code has not
been run against a live cluster.

### Transactions

At connect time `connectMongo` sends `hello`: a replica set (`setName`) or `mongos` uses multi-document transactions; a
standalone server uses the fallback path (atomic conditional `updateOne`/`findOneAndUpdate` plus compensating deletes on
failure). The chosen path is logged once at startup.

### MongoDB Atlas

- Atlas > Network Access: add the IP of the machine/host running the API (or your CIDR range). Connections from other IPs time out.
- Atlas clusters are replica sets, so the transaction path is used.
- Special characters in the connection-string password (`@ : / ? # %`) must be URL-encoded, e.g. `p@ss/word` -> `p%40ss%2Fword`.
- Tests: `test/mongo-repository.test.js` runs live checks against a throwaway database `osf_test_<random>` only when `MONGODB_URI` is set; otherwise it reports "skipped".
