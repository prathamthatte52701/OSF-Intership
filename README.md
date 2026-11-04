# OSF Company Portal

Responsive company registration portal for Our Startup Freelancer.

Company registration is limited to India. PAN, MSME registration, and phone are optional; state, city, and a six-digit PIN Code are required. PAN is validated when supplied, and phone numbers must be Indian numbers.

## Project layout

```text
client/       React + Vite frontend
server/       Express API and local SQLite data
client/vite.config.js Vite config and /api development proxy
```

## Run the app (frontend + API)

Open a terminal in the `client/` folder:

```powershell
cd E:\OSF-Intership\client
npm install
npm run dev
```

`npm run dev` starts both Vite on port `3000` and the API on port `4000`. Open `http://localhost:3000`. Stop both with `Ctrl+C`.

This runs registration and the UI locally. Real OTP/setup emails require Gmail settings in a root `.env`; without them the API reports that email delivery is unavailable.

## Run the API

The API starts without Gmail settings so the UI can run locally. To enable real email delivery, create a root `.env` from `.env.example` and set `EMAIL_USER`, `EMAIL_APP_PASSWORD`, and `OTP_HMAC_SECRET` (at least 32 random characters). Keep `.env` private.

To run only the API in a separate terminal, from the project root:

```powershell
Copy-Item .env.example .env
```

Or run the server on its own from the server folder:

```powershell
cd E:\OSF-Intership\server
npm install
npm run dev
```

To run both from the project root instead, run `npm install` and then `npm run dev`.

The API listens on `http://localhost:4000`; Vite forwards `/api` requests to it. SQLite data is created locally under `server/data/` and is ignored by Git.

Authenticated company profile updates use `POST /api/company/profile`; the server derives the company from the session and keeps the verified email read-only. `/contact` displays demo placeholders until verified OSF support details are configured.

## Build the frontend

```powershell
npm run build
```

The built frontend is written to `dist/`.
