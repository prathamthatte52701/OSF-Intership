// Wipes the configured MongoDB database and loads demo data. Usage: npm run seed:demo -- --yes   (dry run without --yes)
// Targets MONGODB_URI / MONGODB_DB from the environment or the repo-root .env - point it at a DEV database only.
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { randomInt } from 'node:crypto';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const uploadsDir = resolve(serverDir, 'uploads');
export const COUNTS = { companies: 5, students: 5, challenges: 12, applications: 8, savedStudents: 2, assessments: 1 };

const DAY = 86400000;
const companies = [
  ['NimbusLoop Technologies', 'Indore', 'Madhya Pradesh', 'Vijay Nagar', '452010', 'Aarav Mehta'],
  ['Kiranaflow Labs', 'Pune', 'Maharashtra', 'Baner Road', '411045', 'Isha Kulkarni'],
  ['GreenGrid Energy Tech', 'Bengaluru', 'Karnataka', 'Indiranagar', '560038', 'Rohan Iyer'],
  ['Quillstack Media', 'Delhi', 'Delhi', 'Connaught Place', '110001', 'Neha Sharma'],
  ['Bharat Bytes Pvt Ltd', 'Hyderabad', 'Telangana', 'HITEC City', '500081', 'Kiran Reddy'],
];
const students = [
  ['Ananya Verma', 'Medicaps University Indore', 'B.Tech Computer Science', 2026, 'Indore, Madhya Pradesh', ['React', 'JavaScript', 'Node.js', 'SQL'],
    [['Campus Connect', 'Event discovery app for college clubs.'], ['Expense Splitter', 'Group expense tracker with settle-up suggestions.']]],
  ['Rahul Deshmukh', 'COEP Technological University', 'B.Tech Information Technology', 2025, 'Pune, Maharashtra', ['Python', 'Django', 'PostgreSQL', 'Docker'],
    [['Library API', 'REST API for a university library.'], ['Log Analyzer', 'CLI that summarises server logs.'], ['Quiz Bot', 'Telegram quiz bot with leaderboards.']]],
  ['Sneha Nair', 'RV College of Engineering', 'B.E. Electronics', 2026, 'Bengaluru, Karnataka', ['Python', 'Data Analysis', 'Pandas', 'Power BI'],
    [['Energy Usage Dashboard', 'Dashboard of household energy data.'], ['Sales Forecast', 'Time-series forecasting notebook.']]],
  ['Mohit Agarwal', 'Delhi Technological University', 'B.Tech Software Engineering', 2025, 'Delhi', ['Content Writing', 'SEO', 'Figma', 'Video Editing'],
    [['Tech Newsletter', 'Weekly newsletter with 1,200 subscribers.'], ['Brand Kit', 'Brand identity for a student startup.']]],
  ['Priya Rao', 'JNTU Hyderabad', 'B.Tech Computer Science', 2026, 'Hyderabad, Telangana', ['Java', 'Spring Boot', 'MySQL', 'REST APIs'],
    [['Hostel Manager', 'Room allocation system with Spring Boot.'], ['Bus Tracker', 'Live campus bus tracking prototype.']]],
];
// [companyIdx, title, status, skills, paid, comp, days, candidates, task]
const challenges = [
  [0, 'Frontend Developer Intern', 'PUBLISHED', ['React', 'JavaScript', 'CSS', 'Accessibility'], 1, 'INR 15,000 stipend', 7, 20, 'Build a responsive dashboard page from the supplied wireframe, with keyboard-accessible filters.'],
  [0, 'Backend API Intern', 'CLOSED', ['Node.js', 'Express', 'SQL', 'REST APIs'], 1, 'INR 12,000 stipend', 10, 15, 'Design a small REST API for an inventory service with validation and tests.'],
  [0, 'QA Automation Intern', 'DRAFT', ['Testing', 'JavaScript', 'Playwright'], 0, null, 5, 10, 'Write end-to-end tests for a sample sign-up flow.'],
  [1, 'Full Stack Developer Intern', 'PUBLISHED', ['React', 'Node.js', 'SQLite', 'Git', 'REST APIs'], 1, 'INR 18,000 stipend', 14, 25, 'Implement a mini order tracker: list, create and update orders with a simple UI.'],
  [1, 'Data Analyst Intern', 'CLOSED', ['SQL', 'Python', 'Pandas', 'Excel'], 1, 'INR 10,000 stipend', 7, 12, 'Analyse the provided sales CSV and report three actionable insights.'],
  [1, 'DevOps Intern', 'DRAFT', ['Docker', 'CI/CD', 'Linux', 'Git'], 0, null, 10, 8, 'Containerise a sample service and add a CI pipeline.'],
  [2, 'Data Science Intern', 'PUBLISHED', ['Python', 'Pandas', 'Data Analysis', 'Power BI'], 1, 'INR 20,000 stipend', 10, 10, 'Clean a smart-meter dataset and visualise peak-load patterns.'],
  [2, 'IoT Firmware Intern', 'DRAFT', ['C', 'Embedded Systems', 'MQTT', 'Git'], 1, 'INR 15,000 stipend', 14, 6, 'Write firmware that publishes sensor readings over MQTT.'],
  [3, 'Content Writer Intern', 'PUBLISHED', ['Content Writing', 'SEO', 'Research', 'Editing'], 0, 'Certificate and bylines', 5, 30, 'Write a 700-word explainer on renewable energy for a general audience.'],
  [3, 'Video Editor Intern', 'CLOSED', ['Video Editing', 'Storytelling', 'Premiere Pro'], 1, 'INR 8,000 stipend', 7, 10, 'Cut a 60-second highlight reel from the supplied footage.'],
  [4, 'Java Developer Intern', 'PUBLISHED', ['Java', 'Spring Boot', 'MySQL', 'REST APIs'], 1, 'INR 14,000 stipend', 10, 15, 'Build CRUD endpoints for a ticketing service with input validation.'],
  [4, 'UI/UX Design Intern', 'DRAFT', ['Figma', 'UX Research', 'Prototyping'], 1, 'INR 9,000 stipend', 7, 5, 'Redesign the onboarding flow of a mobile banking demo.'],
];
const mcqs = [
  ['Which array method returns a new array with only matching items?', 'map', 'filter', 'reduce', 'forEach', 'B'],
  ['What does `===` check in JavaScript?', 'Value only', 'Type only', 'Value and type', 'Reference only', 'C'],
  ['Which hook stores state in a React function component?', 'useEffect', 'useRef', 'useMemo', 'useState', 'D'],
  ['What does `Promise.all` do when one promise rejects?', 'Rejects immediately', 'Ignores it', 'Retries it', 'Waits for all', 'A'],
  ['Which keyword declares a block-scoped constant?', 'var', 'let', 'const', 'static', 'C'],
];

export function generatePassword() {
  const sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*-_'];
  const all = sets.join('');
  const chars = sets.map(s => s[randomInt(s.length)]);
  while (chars.length < 20) chars.push(all[randomInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = randomInt(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return chars.join('');
}


// Core logic; takes the repository set (needs `maintenance`) so tests can use a throwaway database. Returns credential rows.
export async function seed(repos, { password, now = Date.now(), hashPassword, newId, newUserId }) {
  const at = ms => new Date(ms).toISOString();
  const ts = at(now);
  const hash = await hashPassword(password); // one hash shared by all demo accounts
  const creds = [];
  const co = [], st = [], ch = [];
  const slugOf = s => s.toLowerCase().replace(/[^a-z]+/g, '');
  const sortSkills = skills => [...skills].sort((a, b) => { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }); // same order as the challenges repo
  const data = Object.fromEntries(['companies', 'users', 'student_users', 'students', 'student_skills', 'student_projects', 'challenges', 'applications',
    'submissions', 'evaluations', 'saved_students', 'skill_assessments', 'skill_assessment_questions', 'skill_assessment_attempts'].map(n => [n, []]));
  const ins = (collection, doc) => data[collection].push(doc);

  const usedIds = new Set();
  const hrUsers = [];
  companies.forEach(([name, city, state, area, postal, contact], i) => {
    const id = newId(); co.push(id);
    const email = `hr@${slugOf(name)}.test`;
    let userId; do { userId = newUserId(); } while (usedIds.has(userId)); usedIds.add(userId);
    ins('companies', { _id: id, company_name: name, pan: `ABCDE${1000 + i}F`, msme: `UDYAM-XX-00-000${i + 1}`, address1: `${10 + i}, ${area}`, address2: `${city} Business Park`, country: 'India', country_code: 'IN', state, city, postal, contact_name: contact, email, phone_e164: `+91981000000${i + 1}`, status: 'VERIFIED', created_at: ts, verified_at: ts });
    const hrId = newId(); hrUsers.push(hrId);
    ins('users', { _id: hrId, company_id: id, user_id: userId, password_hash: hash, setup_token_hash: null, setup_expires_at: null, password_changed_at: ts, created_at: ts, email_verified: 1, must_change_password: 0, password_setup_status: 'COMPLETED', setup_resend_count: 0, setup_resend_window_started_at: 0, setup_last_sent_at: 0 });
    creds.push({ role: 'company', login: `${userId} (${email})`, name });
  });
  students.forEach(([name, college, degree, year, location, skills, projects]) => {
    const accountId = newId(), id = newId(); st.push(id);
    const slug = slugOf(name);
    const email = `${slug}@student.test`;
    ins('student_users', { _id: accountId, email, password_hash: hash, email_verified: 1, account_status: 'ACTIVE', password_created_at: ts, updated_at: ts, created_at: ts });
    ins('students', { _id: id, account_id: accountId, full_name: name, profile_image: null, college, degree, graduation_year: year, about: `${degree} student at ${college}, keen on hands-on projects in ${skills.slice(0, 2).join(' and ')}.`, resume_reference: null, github_url: `https://github.com/${slug}`, linkedin_url: `https://www.linkedin.com/in/${slug}`, portfolio_url: `https://${slug}.example.test`, location, profile_visible: 1, created_at: ts, updated_at: ts });
    skills.forEach(skill => ins('student_skills', { _id: newId(), student_id: id, skill, created_at: ts }));
    projects.forEach(([title, description], k) => ins('student_projects', { _id: newId(), student_id: id, title, description, project_url: `https://github.com/${slug}/project-${k + 1}`, created_at: ts, updated_at: ts }));
    creds.push({ role: 'student', login: email, name });
  });
  challenges.forEach(([ci, title, status, skills, paid, comp, days, cand, task], i) => {
    const id = newId(); ch.push(id);
    const [opens, closes] = status === 'PUBLISHED' ? [now - 5 * DAY, now + 20 * DAY] : status === 'CLOSED' ? [now - 40 * DAY, now - 10 * DAY] : [now + 3 * DAY, now + 30 * DAY];
    ins('challenges', { _id: id, company_id: co[ci], role_title: title, reference: `REF-${2000 + i}`, task_description: task, language: 'English', extra_information: 'Submit a GitHub link, a deployed URL, or a short write-up.', is_paid: paid, compensation_details: comp, candidate_count: cand, application_opens_at: at(opens), application_closes_at: at(closes), individual_task_duration_days: days, required_skills: sortSkills(skills), status, created_at: at(now - 45 * DAY), updated_at: ts });
  });
  // challenge idx: 0,3,6,8,10 published; 1,4,9 closed; 2,5,7,11 draft
  const apply = (c, s, status, appliedAgo, deadlineInDays) => {
    const id = newId();
    ins('applications', { _id: id, challenge_id: ch[c], student_id: st[s], applied_at: at(now - appliedAgo * DAY), individual_deadline: at(now + deadlineInDays * DAY), status, created_at: at(now - appliedAgo * DAY), updated_at: ts });
    return id;
  };
  const submission = (application_id, extra) => ins('submissions', { _id: newId(), application_id, github_url: null, deployed_url: null, file_reference: null, supporting_information: null, ...extra });
  const submit = (a, extra) => submission(a, { submitted_at: at(now - DAY), created_at: at(now - DAY), updated_at: ts, ...extra });
  apply(0, 0, 'APPLIED', 1, 6);
  const draft = apply(0, 1, 'IN_PROGRESS', 2, 5);
  submission(draft, { github_url: 'https://github.com/rahuldeshmukh/dashboard-wip', supporting_information: 'Draft: layout done, filters pending.', submitted_at: null, created_at: ts, updated_at: ts });
  submit(apply(0, 2, 'SUBMITTED', 4, 3), { deployed_url: 'https://sneha-dashboard.example.test', supporting_information: 'Deployed on a static host; notes in README.' });
  const good = apply(3, 0, 'SUBMITTED', 6, 8);
  submit(good, { github_url: 'https://github.com/ananyaverma/order-tracker', deployed_url: 'https://order-tracker.example.test', supporting_information: 'Includes tests and setup notes.' });
  ins('evaluations', { _id: newId(), application_id: good, rating: 5, feedback: 'Clean code, great UI polish. Shortlisted for interview.', is_shortlisted: 1, evaluated_by: hrUsers[1], evaluated_at: ts, created_at: ts, updated_at: ts });
  apply(3, 3, 'EXPIRED', 20, -2);
  apply(6, 1, 'APPLIED', 1, 9);
  apply(8, 2, 'APPLIED', 2, 4);
  submit(apply(10, 4, 'SUBMITTED', 3, 6), { supporting_information: 'Approach: layered Spring Boot service with validation; endpoints documented in the write-up.' });

  ins('saved_students', { _id: newId(), company_id: co[0], student_id: st[0], note: 'Strong React fundamentals; follow up for internship.', created_at: ts });
  ins('saved_students', { _id: newId(), company_id: co[1], student_id: st[2], note: 'Good analytics portfolio.', created_at: ts });

  const aid = newId();
  ins('skill_assessments', { _id: aid, company_id: co[0], title: 'JavaScript Fundamentals', description: 'Five quick questions on core JavaScript and React.', related_skill: 'JavaScript', instructions: 'Choose one answer per question.', duration_minutes: 15, status: 'PUBLISHED', created_at: ts, updated_at: ts });
  const qids = mcqs.map(([q, a, b, c, d, correct], i) => {
    const id = newId();
    ins('skill_assessment_questions', { _id: id, assessment_id: aid, question_text: q, option_a: a, option_b: b, option_c: c, option_d: d, correct_answer: correct, question_order: i + 1, created_at: ts, updated_at: ts });
    return id;
  });
  // Answers are embedded in the attempt document (see repositories/mongo/assessments.js).
  ins('skill_assessment_attempts', { _id: newId(), assessment_id: aid, student_id: st[0], started_at: at(now - 2 * DAY), submitted_at: at(now - 2 * DAY + 600000), status: 'REVIEWED', review_status: 'REVIEWED', manual_score: 80, company_feedback: 'Solid grasp of the basics; revisit Promise handling.', reviewed_at: ts,
    answers: qids.map((q, i) => ({ question_id: q, selected_option: i === 3 ? 'B' : mcqs[i][5] })), created_at: ts, updated_at: ts });

  await repos.maintenance.replaceAll(data); // wipes every collection, then inserts the demo set
  return creds;
}

async function main() {
  if (process.env.NODE_ENV === 'production') { console.error('Refusing to run: NODE_ENV is production.'); process.exit(1); }
  if (!process.argv.includes('--yes')) {
    console.log(`DRY RUN (pass --yes to execute). Database: ${process.env.MONGODB_DB || '(the database named in MONGODB_URI)'}`);
    console.log('Would: dump every collection to JSON under server/data/backups/<timestamp>/, delete ALL documents from every collection, empty server/uploads/.');
    console.log('Would insert:', JSON.stringify(COUNTS));
    return;
  }
  await import('../env.js');
  const { createRepositories } = await import('../repositories/index.js'); // no email helpers are imported: nothing here can send mail
  const { hashPassword, newId, newUserId, validatePassword } = await import('../security.js');
  const password = process.env.DEMO_PASSWORD || generatePassword();
  if (!validatePassword(password)) { console.error('DEMO_PASSWORD must be 12+ chars with upper, lower, digit and special character.'); process.exit(1); }
  const repos = await createRepositories();
  try {
    const dump = await repos.maintenance.dumpAll();
    const backupDir = resolve(serverDir, 'data/backups', new Date().toISOString().replace(/[:.]/g, '-'));
    mkdirSync(backupDir, { recursive: true });
    for (const [name, docs] of Object.entries(dump)) writeFileSync(resolve(backupDir, `${name}.json`), repos.maintenance.serialize(docs));
    console.log(`Backup written: ${backupDir} (${Object.keys(dump).length} collections)`);
    const creds = await seed(repos, { password, hashPassword, newId, newUserId });
    if (existsSync(uploadsDir)) for (const f of readdirSync(uploadsDir)) rmSync(resolve(uploadsDir, f), { recursive: true, force: true });
    const table = ['ROLE\tLOGIN\tPASSWORD\tNAME', ...creds.map(c => `${c.role}\t${c.login}\t${password}\t${c.name}`)].join('\n');
    const credFile = resolve(serverDir, 'data/demo-credentials.txt');
    mkdirSync(dirname(credFile), { recursive: true });
    writeFileSync(credFile, table + '\n');
    console.log(`Seeded ${JSON.stringify(COUNTS)}\n\n${table}\n\nCredentials also saved to ${credFile}`);
  } finally {
    await repos.conn.close();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
