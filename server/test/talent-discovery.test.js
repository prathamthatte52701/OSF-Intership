import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';

const testDirectory = mkdtempSync(join(tmpdir(), 'osf-talent-'));
process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = join(testDirectory, 'talent.sqlite');
process.env.OTP_HMAC_SECRET = 'talent-test-only-otp-pepper-32-characters-long';
process.env.APP_ORIGIN = 'http://localhost:3000';

const [{ app }, { db }, { sha256, newSecret, newId }] = await Promise.all([import('../index.js'), import('../db.js'), import('../security.js')]);
const server = createServer(app);
app.set('trust proxy', 'loopback');
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let sequence = 20;
async function call(path, cookie, method = 'GET', body) {
  const response = await fetch(`${origin}${path}`, { method, headers: { 'x-forwarded-for': `198.51.100.${sequence++}`, ...(body ? { 'content-type': 'application/json' } : {}), cookie }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json().catch(() => null) };
}
const now = () => new Date().toISOString();
function company(id) {
  const t = now(); const accountId = newId(); const token = newSecret();
  db.prepare(`INSERT INTO companies(id,company_name,address1,country,country_code,city,contact_name,email,status,created_at,verified_at) VALUES (?,?,?,'India','IN','Pune','Owner',?,'VERIFIED',?,?)`).run(id, id, '1 Road', `${id}@x.example`, t, t);
  db.prepare(`INSERT INTO users(id,company_id,user_id,password_hash,created_at,email_verified,must_change_password,password_setup_status) VALUES (?,?,?,'x',?,1,0,'COMPLETED')`).run(accountId, id, `OSF-${id}`, t);
  db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').run(sha256(token), accountId, Date.now() + 60000, t);
  return `osf_session=${encodeURIComponent(token)}`;
}
function student(id, skills, { visible = 1, updated = now() } = {}) {
  const t = now();
  db.prepare('INSERT INTO student_users(id,email,password_hash,email_verified,password_created_at,updated_at,created_at) VALUES (?,?,?,1,?,?,?)').run(`u-${id}`, `${id}@s.example`, 'x', t, t, t);
  db.prepare('INSERT INTO students(id,account_id,full_name,college,profile_visible,created_at,updated_at) VALUES (?,?,?,?,?,?,?)').run(id, `u-${id}`, id, 'Test Institute', visible, t, updated);
  for (const skill of skills) db.prepare('INSERT INTO student_skills(id,student_id,skill,created_at) VALUES (?,?,?,?)').run(newId(), id, skill, t);
}

test('talent discovery: ranking, pagination, visibility, saved note', async t => {
  t.after(async () => { await new Promise(r => server.close(r)); db.close(); rmSync(testDirectory, { recursive: true, force: true }); });
  const c1 = company('c1'); const c2 = company('c2');

  // Best match is the OLDEST profile, so a recency-first cut would drop it.
  student('best', ['JavaScript', 'CSS', 'SQL'], { updated: '2000-01-01T00:00:00.000Z' });
  student('mid', ['javascript', 'css'], { updated: '2000-01-02T00:00:00.000Z' });
  for (let i = 0; i < 30; i++) student(`one${i}`, ['JavaScript'], { updated: `2020-01-${String(i + 1).padStart(2, '0')}T00:00:00.000Z` });
  let r = await call('/api/company/talent?skills=JavaScript,CSS,SQL&limit=3', c1);
  assert.deepEqual(r.body.students.map(s => s.id), ['best', 'mid', 'one29']);
  assert.deepEqual(r.body.students.map(s => s.matchCount), [3, 2, 1]);
  assert.equal(r.body.total, 32);
  r = await call('/api/company/talent?skills=JavaScript,CSS,SQL&limit=3&offset=3', c1);
  assert.equal(r.body.students[0].id, 'one28');
  r = await call('/api/company/talent?limit=500', c1);
  assert.equal(r.body.limit, 50); assert.equal(r.body.students.length, 32);

  student('hidden', ['Rust'], { visible: 0 });
  student('hiddenApplied', ['Rust'], { visible: 0 });
  student('shown', ['Rust']);
  const ids = body => body.students.map(s => s.id).sort();
  const t0 = now();
  db.prepare(`INSERT INTO challenges(id,company_id,role_title,task_description,application_opens_at,application_closes_at,individual_task_duration_days,status,created_at,updated_at) VALUES ('ch1','c1','Role','Task',?,?,1,'PUBLISHED',?,?)`).run(t0, t0, t0, t0);
  db.prepare(`INSERT INTO applications(id,challenge_id,student_id,applied_at,individual_deadline,created_at,updated_at) VALUES ('a1','ch1','hiddenApplied',?,?,?,?)`).run(t0, t0, t0, t0);
  assert.deepEqual(ids((await call('/api/company/talent?skills=Rust', c1)).body), ['hiddenApplied', 'shown']); // visible shown, hidden excluded, applied included
  assert.deepEqual(ids((await call('/api/company/talent?skills=Rust', c2)).body), ['shown']); // different company: applied student stays hidden
  assert.equal((await call('/api/company/talent/hidden', c1)).status, 404);
  assert.equal((await call('/api/company/talent/hiddenApplied', c1)).status, 200);
  assert.equal((await call('/api/company/talent/hiddenApplied', c2)).status, 404);
  assert.equal((await call('/api/company/talent/shown', c2)).status, 200);

  assert.equal((await call('/api/company/saved-students/best', c1, 'POST', { note: 'Strong' })).status, 201);
  assert.equal((await call('/api/company/saved-students', c1)).body.students[0].note, 'Strong');
});
