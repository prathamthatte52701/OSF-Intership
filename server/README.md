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
