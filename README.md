# OSF Company Portal

A company registration and account portal for **Our Startup Freelancer (OSF)**. The application supports India-only company registration, email verification, secure password setup, authenticated sign-in, and company profile management.

> **Project status:** Local development application. Configure and verify production hosting, database operations, email delivery, domain security, and operational monitoring before using this portal in production.

## Features

### Company registration
- Registration is restricted to companies in India.
- Company name, contact person, email, address, state, city, and six-digit PIN Code are required.
- PAN, MSME registration, address line 2, and Indian phone number are optional.
- PAN is validated when provided.
- State and city selections use the India location dataset; the backend validates that the city belongs to the selected state.
- Email addresses are checked for duplicates without case sensitivity.

### Email verification and account setup
- A six-digit OTP is sent to the registered email address.
- OTP values are stored as HMAC-SHA-256 hashes and expire after five minutes.
- After email verification, the user receives a one-time password setup link.
- Password setup links expire after 30 minutes and can only be used once.
- Passwords are hashed using Argon2id.

### Account and company profile
- Sign in using the OSF User ID and password.
- Authenticated sessions use an HTTP-only cookie and server-side session records.
- View and update company profile information.
- The verified company email is read-only in the profile editor.
- Change the account password.
- Log out by invalidating the server-side session and clearing the session cookie.
- Light and dark themes are available.

### Student and platform foundation
- Student accounts are separate from the company-only `users` table and use email verification, Argon2id password hashes, and their own HTTP-only session cookie.
- Student profiles store searchable skills and linked projects; professional links, resume references, education, and location remain optional.
- Companies can publish live challenges, review applicants and submissions, record manual ratings/feedback/shortlists, and create manually reviewed MCQ assessments.
- Talent discovery filters stored student skills and college information and reports the matching skills directly. Companies can save student profiles.
- Task files are stored under the ignored local `server/uploads/` directory; SQLite stores metadata and an opaque file reference.

### Contact page
- The Contact Us page is present.
- Support email, phone, and office address are currently marked as **not configured**. These are placeholders, not real OSF contact details.
- The page does not currently submit a contact message.

## Technology stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, JavaScript |
| Backend | Node.js, Express |
| Database | SQLite with better-sqlite3 |
| Email | Nodemailer with Gmail SMTP |
| Password hashing | Argon2id |
| OTP protection | HMAC-SHA-256 |
| Phone validation | libphonenumber-js |
| India location data | country-state-city |
| HTTP security | Helmet, express-rate-limit, HTTP-only session cookies |

## Repository structure

```text
.
├── client/
│   ├── public/              # Static assets, including OSF branding
│   ├── src/
│   │   ├── api.js            # Frontend API client
│   │   ├── india.js          # India state, city and phone helpers
│   │   ├── CompanyProfile.jsx
│   │   ├── ContactUs.jsx
│   │   ├── main.jsx          # Application entry and page flows
│   │   └── styles.css
│   └── vite.config.js        # Vite server and /api proxy
├── server/
│   ├── db.js                 # SQLite schema and migrations
│   ├── env.js                # Root .env loading
│   ├── index.js              # Express API and routes
│   ├── mail.js               # Nodemailer email templates and transport
│   ├── migrations/           # Versioned additive platform migrations
│   ├── platform.js           # Student, challenge, assessment, and talent APIs
│   ├── security.js           # OTP, token and password security helpers
│   └── validation.js         # Server-side registration/profile validation
├── .env.example
├── .gitignore
└── package.json              # npm workspaces and root scripts
```

## Prerequisites

- Node.js (use a current LTS release).
- npm.
- A Gmail account with 2-Step Verification enabled and a Gmail App Password, if real email delivery is required.

## Run locally

### 1. Install dependencies

Run these commands from the repository root:

```bash
npm install
```

### 2. Configure environment variables

Create a root-level `.env` file by copying the example:

**Windows PowerShell**
```powershell
Copy-Item .env.example .env
```

**macOS / Linux**
```bash
cp .env.example .env
```

Configure the values:

```dotenv
PORT=4000
VITE_AUTH_MODE=api
DATABASE_PATH=server/data/osf.sqlite
APP_ORIGIN=http://localhost:3000

EMAIL_USER=your-gmail-address@gmail.com
EMAIL_APP_PASSWORD=your-gmail-app-password
EMAIL_FROM_NAME=OSF Admin

OTP_HMAC_SECRET=replace-with-a-random-secret-of-at-least-32-characters
```

Environment variable reference:

| Variable | Purpose |
| --- | --- |
| `PORT` | Express API port. Defaults to `4000`. |
| `VITE_AUTH_MODE` | Use `api` for backend authentication. The explicit `mock` value selects the browser demo mode. |
| `VITE_UI_PREVIEW` | Set to `true` only for an explicitly enabled preview build to show the Desktop/Mobile preview switcher; Vite development shows it automatically. |
| `DATABASE_PATH` | SQLite database path, relative to the repository root when configured. |
| `APP_ORIGIN` | Frontend origin used to create password setup links. |
| `EMAIL_USER` | Gmail account used as the sender. |
| `EMAIL_APP_PASSWORD` | Gmail App Password used by Nodemailer. |
| `EMAIL_FROM_NAME` | Display name shown as the email sender. |
| `OTP_HMAC_SECRET` | Random server-side secret used to HMAC OTP values. Must contain at least 32 characters. |

**Email configuration:** The backend can start without Gmail credentials, but real OTP and password setup emails will not be delivered. The health endpoint reports whether the email credentials are configured; this is not a delivery test.

**Secret handling:** Never commit `.env`, expose Gmail credentials in frontend code, or share the Gmail App Password. The repository ignores local environment files and SQLite database files.

### 3. Start the frontend and backend

From the repository root:

```bash
npm run dev
```

Run from the repository root to start both services:

- Frontend: http://localhost:3000
- Backend API: http://localhost:4000
- API health check: http://localhost:4000/api/health

Vite proxies requests beginning with `/api` to the backend.

Stop the development processes with `Ctrl+C`.

### Run each service separately

Start only the Express API from the `server/` directory:

```bash
npm run server
```

Or run the server workspace script from the repository root:

```bash
npm run dev --workspace @osf/server
```

Start only the Vite frontend from the `client/` directory:

```bash
npm run dev
```

Or run the client workspace script from the repository root:

```bash
npm run dev --workspace @osf/client
```

When running the client on its own, start the API separately so `/api` requests have a backend to reach.

## Available scripts

Run scripts from the repository root:

| Command | Description |
| --- | --- |
| `npm install` | Install workspace dependencies. |
| `npm run dev` | Start the API and Vite frontend together. |
| `npm run server` | Start only the Express API. |
| `npm run build` | Build the frontend for production. |
| `npm run preview` | Preview the built frontend using Vite. |

The frontend build output is written to the root `dist/` directory.

## Registration and authentication flow

1. **Register:** The React application sends company details to `POST /api/registrations`.
2. **Validate and store:** Express validates the submitted data and saves the registration in SQLite.
3. **Send OTP:** The backend generates a six-digit OTP and uses Nodemailer with Gmail SMTP to send the verification email.
4. **Verify email:** The user submits the OTP to `POST /api/registrations/:id/verify-email`. The backend checks its hash, expiry, and attempt limit.
5. **Set password:** After verification, the backend creates a one-time setup token and sends a password setup link by email.
6. **Create credentials:** The user submits a password and setup token to `POST /api/auth/setup-password`. The password is hashed using Argon2id.
7. **Sign in:** The user signs in through `POST /api/auth/login` using the generated OSF User ID and password.
8. **Use protected pages:** The browser sends the HTTP-only session cookie with API requests. The backend validates the session before returning profile data.
9. **Sign out:** `POST /api/auth/logout` deletes the server-side session and expires the cookie.

## API overview

| Method | Endpoint | Purpose |
| --- | --- | --- |
| GET | `/api/health` | API health and email-configuration status |
| POST | `/api/registrations` | Create a company registration and send OTP |
| POST | `/api/registrations/:id/resend-otp` | Send a replacement OTP |
| POST | `/api/registrations/:id/verify-email` | Verify the registration email |
| POST | `/api/registrations/:id/resend-setup` | Resend the password setup link |
| POST | `/api/auth/resend-password-setup` | Request password setup recovery |
| POST | `/api/auth/setup-password` | Set the account password |
| POST | `/api/auth/login` | Authenticate with OSF User ID and password |
| GET | `/api/auth/session` | Check the current authenticated session |
| POST | `/api/auth/logout` | Invalidate the current session |
| GET | `/api/company/profile` | Get the authenticated company's profile |
| POST | `/api/company/profile` | Update the authenticated company's profile |
| POST | `/api/auth/change-password` | Change the authenticated user's password |

Platform APIs use the authenticated student or company session as the owner identity; request body IDs are never used to select a company or student owner.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/student/auth/register` | Create a student account and send an email verification code |
| POST | `/api/student/auth/verify-email` | Verify a student email using its six-digit code |
| POST | `/api/student/auth/resend-otp` | Resend the student verification code |
| POST | `/api/student/auth/login` | Sign in with student email and password |
| GET | `/api/student/auth/session` | Check the student session |
| POST | `/api/student/auth/logout` | Revoke the student session |
| GET / PUT | `/api/student/profile` | Get or update the signed-in student's profile |
| POST / PUT / DELETE | `/api/student/projects`, `/api/student/projects/:id` | Manage the signed-in student's projects |
| GET | `/api/students/:id` | Retrieve permitted public profile fields |
| GET | `/api/challenges`, `/api/challenges/:id` | Browse published challenges |
| POST | `/api/company/challenges` | Create a draft challenge |
| GET / PUT | `/api/company/challenges`, `/api/company/challenges/:id` | List or update owned challenges |
| POST | `/api/company/challenges/:id/publish` | Publish an owned challenge |
| POST | `/api/company/challenges/:id/close` | Close an owned challenge to new applications |
| POST | `/api/student/challenges/:id/applications` | Apply during the challenge application window |
| POST | `/api/student/applications/:id/start` | Mark an active task as in progress |
| GET | `/api/student/applications` | View own applications, submissions, and permitted evaluations |
| GET | `/api/company/challenges/:id/applications`, `/api/company/applications/:id` | Review applicants to owned challenges |
| PUT | `/api/student/applications/:id/file` | Upload a task file as raw bytes with `X-File-Name` and MIME type headers |
| PUT | `/api/student/applications/:id/submission` | Submit GitHub/deployed links, file reference, or supporting information |
| GET | `/api/student/applications/:id/submission`, `/api/company/applications/:id/submission` | Retrieve a submission for its student or challenge owner |
| GET | `/api/student/applications/:id/file`, `/api/company/applications/:id/file` | Download an authorized submission file |
| PUT | `/api/company/applications/:id/evaluation` | Record a manual 1–5 rating, feedback, and shortlist decision |
| POST / GET | `/api/company/assessments` | Create or list owned MCQ assessments |
| PUT | `/api/company/assessments/:id` | Update an owned draft assessment |
| POST / PUT / DELETE | `/api/company/assessments/:id/questions` | Manage questions on an owned draft assessment |
| POST | `/api/company/assessments/:id/publish`, `/api/company/assessments/:id/close` | Publish or close an owned assessment |
| GET | `/api/student/assessments`, `/api/student/assessments/:id` | Browse available assessments without answer keys |
| POST | `/api/student/assessments/:id/attempts` | Start one attempt for an assessment |
| GET | `/api/student/assessment-attempts`, `/api/student/assessment-attempts/:id` | View own assessment attempts |
| PUT | `/api/student/assessment-attempts/:id/answers` | Submit selected answers for an attempt |
| GET | `/api/company/assessments/:id/attempts`, `/api/company/assessment-attempts/:id` | Review attempts for an owned assessment |
| PUT | `/api/company/assessment-attempts/:id/evaluation` | Record a manual assessment score and feedback |
| GET | `/api/company/talent`, `/api/company/talent/:id` | Search profiles and inspect skill overlaps/projects |
| GET / POST / DELETE | `/api/company/saved-students`, `/api/company/saved-students/:studentId` | Manage saved student profiles |

Protected endpoints require a valid session cookie. The backend derives company ownership from the authenticated session; clients do not select the company record to read or update.

## Security notes

- Registration and profile data are validated on the backend; frontend validation is for user experience only.
- The backend enforces India-only registration and validates state/city combinations.
- OTPs are stored as HMAC-SHA-256 hashes, expire after five minutes, and have a limited number of verification attempts.
- OTP resend requests have a 60-second cooldown and a maximum of five sends per hour.
- Password setup tokens are stored as hashes, expire after 30 minutes, and are single-use.
- Passwords are hashed using Argon2id.
- API requests are rate-limited, and Helmet supplies common HTTP security headers.
- Session identifiers are stored as hashes in SQLite. The browser cookie is HTTP-only and uses SameSite=Lax; the Secure attribute is enabled in production.
- Student session identifiers use a separate table and cookie; student emails are verified with HMAC-protected OTPs before login.
- Challenge applicant task deadlines are snapshotted at apply time and are independent from the public application window.
- Submission uploads are limited to 10 MB and accepted only for matching PDF, TXT, ZIP, PNG, or JPG extension/MIME/content signatures. Files are saved under `server/uploads/`; the directory is not served publicly.
- Assessment answer keys are returned only to the owning company. Student APIs return questions and selected answers without correct answers; scores and reviews are entered manually.
- The default session lifetime is 12 hours.
- Keep all credentials and secrets on the server.

## Database and local data

SQLite is created automatically at the configured database path. By default, the database is stored at `server/data/osf.sqlite`. The database directory and SQLite files are excluded from Git.

The server applies additive, versioned schema migrations for company authentication and the student/platform modules. Do not delete the SQLite database to apply code changes if it contains registrations or user accounts. Back up the database before making manual schema or data changes.

## Current limitations and production checklist

- Real email delivery depends on valid Gmail SMTP credentials and must be tested with an approved recipient address.
- A configured email sender does not guarantee inbox delivery; messages may be delayed, rejected, or filtered as spam.
- Contact Us currently displays unconfigured placeholders and does not send messages. Add verified OSF support information before launch.
- The application currently uses local SQLite storage. Select and configure a production database and backup/restore process before deployment.
- Configure the production frontend origin, HTTPS, secure environment variables, database persistence, and deployment-specific session settings.
- Run end-to-end tests for registration, OTP delivery and verification, password setup, login, profile updates, password changes, and logout in the target environment.
- Review the third-party package licences and deployment requirements before redistributing or hosting the application.

## Licence

No project licence is currently specified in this repository. All rights reserved unless a licence is added by the repository owner.
