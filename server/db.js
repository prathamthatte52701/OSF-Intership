import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const serverDir = dirname(fileURLToPath(import.meta.url));
const databasePath = process.env.DATABASE_PATH
  ? resolve(serverDir, '..', process.env.DATABASE_PATH)
  : resolve(serverDir, 'data/osf.sqlite');
mkdirSync(dirname(databasePath), { recursive: true });
export const db = new Database(databasePath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id TEXT PRIMARY KEY,
    company_name TEXT NOT NULL,
    pan TEXT,
    msme TEXT,
    address1 TEXT NOT NULL,
    address2 TEXT,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    state TEXT,
    city TEXT NOT NULL,
    postal TEXT,
    contact_name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    phone_e164 TEXT,
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','VERIFIED')),
    created_at TEXT NOT NULL,
    verified_at TEXT
  );
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    company_id TEXT NOT NULL UNIQUE REFERENCES companies(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    setup_token_hash TEXT,
    setup_expires_at INTEGER,
    password_changed_at TEXT,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS otp_challenges (
    company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
    otp_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    resend_count INTEGER NOT NULL DEFAULT 0,
    resend_window_started_at INTEGER NOT NULL,
    last_sent_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
`);

// Add setup recovery state to databases created by earlier portal versions.
const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
const addUserColumn = (name, definition) => {
  if (!userColumns.has(name)) db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
};
addUserColumn('email_verified', 'INTEGER NOT NULL DEFAULT 0 CHECK(email_verified IN (0,1))');
addUserColumn('must_change_password', 'INTEGER NOT NULL DEFAULT 1 CHECK(must_change_password IN (0,1))');
addUserColumn("password_setup_status", "TEXT NOT NULL DEFAULT 'PENDING' CHECK(password_setup_status IN ('PENDING','COMPLETED'))");
addUserColumn('setup_resend_count', 'INTEGER NOT NULL DEFAULT 0');
addUserColumn('setup_resend_window_started_at', 'INTEGER NOT NULL DEFAULT 0');
addUserColumn('setup_last_sent_at', 'INTEGER NOT NULL DEFAULT 0');
db.exec(`UPDATE users SET
  email_verified=CASE WHEN EXISTS (SELECT 1 FROM companies c WHERE c.id=users.company_id AND c.status='VERIFIED') THEN 1 ELSE 0 END,
  must_change_password=CASE WHEN password_hash IS NULL THEN 1 ELSE 0 END,
  password_setup_status=CASE WHEN password_hash IS NULL THEN 'PENDING' ELSE 'COMPLETED' END
  WHERE email_verified=0 OR must_change_password<>(password_hash IS NULL) OR password_setup_status<>CASE WHEN password_hash IS NULL THEN 'PENDING' ELSE 'COMPLETED' END`);
