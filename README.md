# OSF Company Portal

Responsive company registration portal for Our Startup Freelancer.

## Project layout

```text
client/       React + Vite frontend
server/       Express API and local SQLite data
vite.config.js Vite config and /api development proxy
```

## Run the frontend

From the project root:

```powershell
npm install
npm run dev
```

Open the URL printed by Vite (usually `http://localhost:5173`). This runs the frontend. API-backed registration requires the server too.

## Run the API

In a second terminal, from the project root:

```powershell
Copy-Item .env.example .env
```

Set `OTP_HMAC_SECRET` in `.env` to a random value of at least 32 characters. For Gmail email delivery, also set `EMAIL_USER` and `EMAIL_APP_PASSWORD` to a Gmail account and its App Password. Keep `.env` private.

Then run:

```powershell
npm run server
```

The API listens on `http://localhost:4000`; Vite forwards `/api` requests to it. SQLite data is created locally under `server/data/` and is ignored by Git.

## Build the frontend

```powershell
npm run build
```

The built frontend is written to `dist/`.
