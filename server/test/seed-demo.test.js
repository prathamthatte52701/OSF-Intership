import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATABASE_PATH = join(mkdtempSync(join(tmpdir(), 'osf-seed-')), 'seed.sqlite');
const { db } = await import('../db.js');
const { seed, generatePassword } = await import('../scripts/seed-demo.js');
const sec = await import('../security.js');

test('seed is idempotent, populates expected rows, passwords verify', async () => {
  const password = generatePassword();
  assert.ok(sec.validatePassword(password));
  let creds;
  for (let i = 0; i < 2; i++) creds = await seed(db, { password, ...sec });
  const n = t => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  assert.deepEqual([n('companies'), n('users'), n('students'), n('challenges'), n('applications'), n('saved_students'), n('skill_assessments'), n('skill_assessment_attempts')], [5, 5, 5, 12, 8, 2, 1, 1]);
  assert.equal(n('schema_migrations'), 3);
  const now = new Date().toISOString();
  assert.equal(db.prepare("SELECT COUNT(*) c FROM challenges WHERE status='PUBLISHED' AND application_opens_at<=? AND application_closes_at>=?").get(now, now).c, 5);
  assert.equal(db.prepare('SELECT COUNT(DISTINCT status) c FROM applications').get().c, 4);
  assert.deepEqual(db.pragma('foreign_key_check'), []);
  assert.equal(db.pragma('foreign_keys', { simple: true }), 1);
  const hashes = [...db.prepare('SELECT password_hash h FROM users').all(), ...db.prepare('SELECT password_hash h FROM student_users').all()];
  assert.equal(hashes.length, creds.length);
  for (const { h } of hashes) assert.ok(await sec.verifyPassword(h, password));
  assert.match(db.prepare('SELECT user_id FROM users').get().user_id, /^OSF-\d{6}$/);
});
