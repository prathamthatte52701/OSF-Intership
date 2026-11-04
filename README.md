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
- The default session lifetime is 12 hours.
- Keep all credentials and secrets on the server.

## Database and local data

SQLite is created automatically at the configured database path. By default, the database is stored at `server/data/osf.sqlite`. The database directory and SQLite files are excluded from Git.

The server includes additive schema migrations for authentication setup fields. Do not delete the SQLite database to apply code changes if it contains registrations or user accounts. Back up the database before making manual schema or data changes.

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
