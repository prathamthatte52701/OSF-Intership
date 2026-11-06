import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const dir = mkdtempSync(join(tmpdir(), 'osf-applicants-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(dir, 't.sqlite');
process.env.OTP_HMAC_SECRET = 'platform-test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';
const [{ app }, { db }, { sha256, newSecret, newId }] = await Promise.all([import('../index.js'), import('../db.js'), import('../security.js')]);
const server = createServer(app);
app.set('trust proxy', 'loopback');
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = `http://127.0.0.1:${server.address().port}`;
let seq = 100;
async function request(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(`${origin}${path}`, { method, headers: { 'x-forwarded-for': `203.0.113.${seq++}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json().catch(() => null) };
}
function company(id) {
  const ts = new Date().toISOString(); const acc = newId(); const token = newSecret();
  db.prepare(`INSERT INTO companies(id,company_name,address1,country,country_code,city,contact_name,email,status,created_at,verified_at) VALUES (?,?,?,'India','IN','Pune','Owner',?,'VERIFIED',?,?)`).run(id, id, '1 Rd', `${id}@x.example`, ts, ts);
  db.prepare(`INSERT INTO users(id,company_id,user_id,password_hash,created_at,email_verified,must_change_password,password_setup_status) VALUES (?,?,?, 'h',?,1,0,'COMPLETED')`).run(acc, id, `OSF-${id}`, ts);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha256(token), acc, Date.now() + 60000, ts);
  return `osf_session=${encodeURIComponent(token)}`;
}

test('applicant evaluation requires submission; student profile is scoped to own applicants (404 cross-company)', async t => {
  t.after(async () => { await new Promise(r => server.close(r)); db.close(); rmSync(dir, { recursive: true, force: true }); });
  const ts = new Date().toISOString(); const future = new Date(Date.now() + 86400000).toISOString();
  const one = company('co-one'); const two = company('co-two');
  const acc = newId(); const sid = newId(); const chId = newId(); const appId = newId();
  db.prepare(`INSERT INTO student_users(id,email,password_hash,email_verified,account_status,password_created_at,updated_at,created_at) VALUES (?,'stud@example.com','h',1,'ACTIVE',?,?,?)`).run(acc, ts, ts, ts);
  db.prepare('INSERT INTO students(id,account_id,full_name,college,created_at,updated_at) VALUES (?,?,?,?,?,?)').run(sid, acc, 'Asha Student', 'Example Institute', ts, ts);
  db.prepare(`INSERT INTO challenges(id,company_id,role_title,task_description,status,application_opens_at,application_closes_at,individual_task_duration_days,created_at,updated_at) VALUES (?,?,?,?,'PUBLISHED',?,?,2,?,?)`).run(chId, 'co-one', 'Role', 'Task', ts, future, ts, ts);
  db.prepare(`INSERT INTO applications(id,challenge_id,student_id,applied_at,individual_deadline,status,created_at,updated_at) VALUES (?,?,?,?,?,'IN_PROGRESS',?,?)`).run(appId, chId, sid, ts, future, ts, ts);

  const evalBody = { rating: 4, feedback: 'ok', isShortlisted: true };
  assert.equal((await request(`/api/company/applications/${appId}/evaluation`, { method: 'PUT', cookie: one, body: evalBody })).status, 400);
  db.prepare('INSERT INTO submissions(id,application_id,created_at,updated_at) VALUES (?,?,?,?)').run(newId(), appId, ts, ts);
  assert.equal((await request(`/api/company/applications/${appId}/evaluation`, { method: 'PUT', cookie: one, body: evalBody })).status, 400);
  db.prepare('UPDATE submissions SET submitted_at=? WHERE application_id=?').run(ts, appId);
  db.prepare("UPDATE applications SET status='SUBMITTED' WHERE id=?").run(appId);
  assert.equal((await request(`/api/company/applications/${appId}/evaluation`, { method: 'PUT', cookie: one, body: evalBody })).status, 200);

  const ok = await request(`/api/company/applications/${appId}/student`, { cookie: one });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.student.fullName, 'Asha Student');
  assert.equal(ok.body.student.contactEmail, 'stud@example.com');
  assert.equal((await request(`/api/company/applications/${appId}/student`, { cookie: two })).status, 404);
  assert.equal((await request(`/api/company/applications/${appId}/student`)).status, 401);
});
