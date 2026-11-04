# OSF Portal Implementation Progress

## Scope and repository findings

- The supplied `E:\OSF-Intership` workspace was empty: no source files, framework, routes, backend, or package scripts were present.
- A small React + Vite frontend was created. The supplied OSF logo image is stored at `public/osf-logo.png`.
- Phase 9 was a browser UI demonstration. Phase 10 adds a local Express API, SQLite persistence, server-side OTP/authentication, and Gmail SMTP integration driven by environment variables.

## Completed phases

### Phase 1 — Repository inspection and project planning

- Confirmed the workspace was empty and selected a minimal React + Vite setup.
- Planned shared responsive brand layout, three-step registration, mock verification/login/password change, and company dashboard.

### Phase 2 — Design system and application shell

- Added OSF navy, blue, gold, neutral, and separately defined light/dark design tokens.
- Added responsive branded registration/auth shell, theme preference, shared fields/buttons, notices, modal, and dashboard shell.

### Phases 3–8 — UI pages and connected demo journey

- Added a three-step company registration flow with inline validation, review, duplicate-email check, and saved demo profile.
- Added searchable country, state/province, and city fields using the offline `country-state-city` dataset. City data loads only after a state is selected; India PAN and postal-code rules remain country-specific.
- Added mock OTP preview and verification UI, resend cooldown, expiry, attempt limit, generated demo user ID, login, mandatory password change, and dashboard navigation.
- Added company overview, profile, account information, activity, theme toggle, and logout.
- Protected dashboard and mandatory password-change routes in the client UI.

## Files

- `client/` — React + Vite frontend, including `index.html`, `src/`, and `public/osf-logo.png`.
- `server/` — Express API, SQLite schema, security, validation, and Gmail mailer.
- Root `package.json` — npm workspaces and `npm run dev`, `npm run server`, and `npm run build` commands.
- `README.md` — setup and run instructions.

## Checks performed

- `npm install --no-audit --no-fund` completed.
- `npm run build` completed successfully after implementation.
- Browser UI review confirmed the form advances and the selected country/state populates the dependent options.
- Manual browser journey completed: registration, India state/city selection, mock OTP preview/verification, first login, mandatory password change, dashboard, logout, and re-login.
- Confirmed Indian phone input normalizes to E.164 (`+919876543210`), duplicate/field validation remains active, theme toggle changes the dashboard, and direct dashboard access while logged out redirects to login.
- Reviewed desktop dashboard and mobile registration presentation. No automated browser suite, accessibility audit, or full breakpoint sweep was run.

## Known limitations

- This is not real authentication and must not be treated as secure production login.
- Demo account/session/profile values are held in browser localStorage; the mock OTP is held in memory and is never written there.
- Demo passwords are held in memory only and are not written to localStorage. A browser refresh ends the demo credential flow.
- The linked `dr5hn/countries-states-cities-database` project was reviewed. It is comprehensive and uses ODbL 1.0 with attribution, but its published full JSON export is large. This UI uses the separate offline `country-state-city` package snapshot instead; check its GPL-3.0 license before redistributing or deploying this app.
- The lazily loaded city dataset adds an approximately 8 MB uncompressed build chunk (about 2.3 MB gzip); Vite reports a chunk-size warning. It is downloaded only when a state with city data is selected.
- Browser-storage auth/profile remains a demo only; production authentication and session security require the backend.
- No real PAN/MSME validation, email delivery, backend, database, rate limiting, or persistent server session exists.

### Phase 9 — UI and journey review

- Completed manual UI journey and responsive/theme review as recorded above.
- Fixed initial-load protected-route handling and dashboard section route selection.
- Added international phone validation/E.164 normalization and country calling-code selector; improved optional postal-code handling and dark-theme link contrast.
- Build passed. Vite reports the lazy city-data chunk size; it loads only after state selection.

### Phase 10 — Backend and Gmail integration (implementation in progress)

- Added Express API routes for company registration, email verification, one-time password setup, login/logout, session lookup, protected company profile, and password changes.
- Added local SQLite persistence for company, user, OTP challenge, and session records. Database path is configurable with `DATABASE_PATH`; SQLite is for local development only.
- Added server-side validation, OTP HMAC hashing, attempt/resend limits, Argon2id password hashes, one-time setup links, HTTP-only session cookies, Helmet headers, and API rate limiting.
- Added Nodemailer Gmail SMTP templates for OTP, password setup, and password-change notification. Credentials are read only from server `.env` and are not committed.
- Wired UI API mode to the backend and added email OTP and password setup screens; mock preview remains only in explicit mock mode.
- Local checks: production frontend build passed; API started with a temporary local secret; `/api/health` returned OK and reported Gmail unconfigured; invalid registration was rejected with HTTP 400.
- Not yet verified: successful email delivery and a full registration-to-login journey, because no `.env`/Gmail App Password or approved recipient is available. Do not claim Gmail sending works until that test passes.

## Run locally

1. Run `npm install` once from the project root.
2. Copy `.env.example` to `.env` and set `OTP_HMAC_SECRET` (at least 32 random characters), `EMAIL_USER`, and a Gmail App Password in `EMAIL_APP_PASSWORD`.
3. Run `npm run server` in one terminal and `npm run dev` in another.
4. Open the Vite URL. Registration emails are sent to the email entered in the form.

Never commit `.env` or paste the Gmail App Password into chat. Production use still needs a chosen production database/hosting configuration and deployment security review.
