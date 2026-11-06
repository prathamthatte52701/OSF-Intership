import React, { useEffect, useMemo, useRef, useState } from 'react';
import { studentApi } from './studentApi.js';
import { Skeleton } from '../ui/Skeleton.jsx';
import './student-overview.css';
import { errorMessage, Field, formatDate, LoadingState, PageTitle, StateBlock, StatusPill, StudentIcon } from './StudentUI.jsx';

const statusTone = status => ({ SUBMITTED: 'success', IN_PROGRESS: 'info', APPLIED: 'neutral', EXPIRED: 'warning', REVIEWED: 'success', IN_PROGRESS_ASSESSMENT: 'info' })[status] || 'neutral';
const isShortlisted = evaluation => evaluation?.isShortlisted === true || evaluation?.isShortlisted === 1;
const matchEmail = value => /^\S+@\S+\.\S+$/.test(value);
const validUrl = value => {
  if (!value) return true;
  try { const parsed = new URL(value); return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname); } catch { return false; }
};
const prettyStatus = value => (value || 'UNKNOWN').replaceAll('_', ' ').toLocaleLowerCase().replace(/\b\w/g, letter => letter.toUpperCase());

export function StudentOverviewPage({ profile, session, go }) {
  const [applications, setApplications] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try {
      const [applicationResult, challengeResult] = await Promise.all([
        studentApi.applications(), studentApi.challenges({ skills: (profile?.skills || []).join(',') }),
      ]);
      setApplications(applicationResult.applications || []);
      setChallenges(challengeResult.challenges || []);
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [profile?.id, (profile?.skills || []).join('|')]);

  const activeTasks = applications.filter(application => ['APPLIED', 'IN_PROGRESS'].includes(application.status) && Date.parse(application.individualDeadline) > Date.now());
  const submitted = applications.filter(application => application.status === 'SUBMITTED');
  const shortlisted = applications.filter(application => isShortlisted(application.evaluation));
  const upcoming = applications.filter(application => ['APPLIED', 'IN_PROGRESS'].includes(application.status)).sort((a, b) => Date.parse(a.individualDeadline) - Date.parse(b.individualDeadline)).slice(0, 3);
  const profileFields = profile ? [profile.fullName, profile.college, profile.degree, profile.graduationYear, profile.about, profile.location, profile.skills?.length, profile.githubUrl, profile.linkedinUrl, profile.portfolioUrl].filter(Boolean).length : 0;
  const completion = profile ? Math.round(profileFields / 10 * 100) : 0;

  const now = Date.now();
  const tz = new Intl.DateTimeFormat('en-IN', { timeZoneName: 'short' }).formatToParts(new Date()).find(part => part.type === 'timeZoneName')?.value || '';
  const open = challenges.filter(challenge => !challenge.applicationClosesAt || Date.parse(challenge.applicationClosesAt) > now);
  const inProgress = activeTasks.find(application => application.status === 'IN_PROGRESS');
  const next = !profile || completion < 100 ? { label: 'Complete your profile', path: '/student/profile' }
    : !applications.length ? { label: 'Explore challenges', path: '/student/challenges' }
      : inProgress ? { label: `Continue ${inProgress.roleTitle || 'your task'}`, path: `/student/applications/${encodeURIComponent(inProgress.id)}` }
        : { label: 'Explore challenges', path: '/student/challenges' };
  const firstName = profile?.fullName?.split(' ')[0];

  return <div className="so">
    <section className="so-welcome"><div><h1>Welcome{firstName ? `, ${firstName}` : ''}</h1><p>{profile && completion < 100 ? `Your profile is ${completion}% complete. Finish it so companies can find you.` : applications.length ? 'Pick up where you left off.' : 'Find a real company challenge and apply.'}</p></div><button className="so-cta" onClick={() => go(next.path)}>{next.label} <StudentIcon name="arrow" size={16} /></button></section>
    {loading ? <div className="so-skeleton"><div className="so-stats">{[0, 1, 2, 3].map(i => <Skeleton key={i} height={116} radius="14px" />)}</div><Skeleton height={160} radius="14px" /><Skeleton height={200} radius="14px" /></div> : error ? <StateBlock title="We couldn’t load your overview" tone="error" action={<button className="sp-button sp-button-secondary" onClick={load}>Retry</button>}>{error}</StateBlock> : <>
      {!profile && <StateBlock title="Complete your student profile to get started" action={<button className="sp-button sp-button-primary" onClick={() => go('/student/profile')}>Create profile <StudentIcon name="arrow" size={15} /></button>}>Add your name and skills before applying to challenges or starting an assessment.</StateBlock>}
      {profile && completion < 100 && <div className="sp-completion-card"><div className="sp-completion-copy"><div><span className="sp-eyebrow">PROFILE COMPLETION</span><strong>{completion}% complete</strong></div><p>Add a few details to help companies understand your experience.</p></div><div className="sp-progress-track"><span style={{ width: `${completion}%` }} /></div><button className="sp-button sp-button-secondary" onClick={() => go('/student/profile')}>Continue your profile</button></div>}
      <div className="so-stats">
        <StatCard label="Applications" value={applications.length} icon="briefcase" help={applications.length ? 'Challenges you applied to' : 'Apply to your first challenge'} onClick={() => go('/student/applications')} />
        <StatCard label="Active tasks" value={activeTasks.length} icon="clock" help={activeTasks.length ? 'Open and before deadline' : 'Nothing due right now'} onClick={() => go('/student/applications')} accent="blue" />
        <StatCard label="Submitted" value={submitted.length} icon="file" help={submitted.length ? 'Waiting for company review' : '0 submitted — submit your first task'} onClick={() => go('/student/applications')} accent="green" />
        <StatCard label="Shortlisted" value={shortlisted.length} icon="medal" help={shortlisted.length ? 'Companies want to talk to you' : 'Appears after company review'} onClick={() => go('/student/applications')} accent="gold" />
      </div>
      <div className="so-grid">
        <section className="sp-panel so-card"><div className="sp-panel-heading"><div><span className="sp-eyebrow">KEEP MOVING</span><h2>Upcoming deadlines</h2></div><button className="sp-link-button" onClick={() => go('/student/applications')}>All applications <StudentIcon name="arrow" size={15} /></button></div>
          {upcoming.length ? <div className="sp-deadline-list">{upcoming.map(application => <button className="sp-deadline-row" key={application.id} onClick={() => go(`/student/applications/${encodeURIComponent(application.id)}`)}><span className="sp-deadline-icon"><StudentIcon name="clock" /></span><span className="sp-deadline-main"><strong>{application.roleTitle || 'Challenge task'}</strong><small>{formatDate(application.individualDeadline)} {tz} · {deadlineLabel(application.individualDeadline)}</small></span><StudentIcon name="arrow" size={16} /></button>)}</div> : <StateBlock title="No upcoming task deadlines" action={<button className="sp-link-button" onClick={() => go('/student/challenges')}>Find a challenge <StudentIcon name="arrow" size={15} /></button>}>Applications and individual deadlines will appear here when you apply.</StateBlock>}
        </section>
        <section className="sp-panel sp-profile-summary"><div className="sp-panel-heading"><div><span className="sp-eyebrow">YOUR PROFILE</span><h2>{profile?.fullName || 'Your profile'}</h2></div><button className="sp-icon-button" aria-label="Edit profile" onClick={() => go('/student/profile')}><StudentIcon name="user" /></button></div>
          {profile ? <><p>{profile.about || 'Add a short introduction so companies can learn about your interests and experience.'}</p><div className="sp-chip-list">{profile.skills?.length ? profile.skills.slice(0, 5).map(skill => <span className="sp-chip" key={skill}>{skill}</span>) : <span className="sp-muted">No skills added yet</span>}</div><button className="sp-link-button" onClick={() => go('/student/profile')}>Manage profile <StudentIcon name="arrow" size={15} /></button></> : <><p>Save your skills, projects and professional links in one place.</p><button className="sp-button sp-button-secondary" onClick={() => go('/student/profile')}>Set up your profile</button></>}
        </section>
      </div>
      <section className="sp-panel so-card sp-recommendations"><div className="sp-panel-heading"><div><span className="sp-eyebrow">PUBLISHED BY COMPANIES</span><h2>{profile?.skills?.length ? 'Challenges matching your skills' : 'Recently available challenges'}</h2></div><button className="sp-link-button" onClick={() => go('/student/challenges')}>Browse all <StudentIcon name="arrow" size={15} /></button></div>
        {open.length ? <div className="sp-mini-challenge-grid">{open.slice(0, 3).map(challenge => <ChallengeCard key={challenge.id} challenge={challenge} onOpen={() => go(`/student/challenges/${encodeURIComponent(challenge.id)}`)} compact />)}</div> : <StateBlock title="No published challenges to show yet" action={<button className="sp-link-button" onClick={() => go('/student/challenges')}>Check again <StudentIcon name="arrow" size={15} /></button>}>New opportunities will appear here when companies publish them.</StateBlock>}
      </section>
    </>}
  </div>;
}

function StatCard({ label, value, icon, help, onClick, accent = 'navy' }) {
  return <button className={`sp-stat-card so-stat sp-stat-${accent}`} onClick={onClick}><span className="sp-stat-icon"><StudentIcon name={icon} size={18} /></span><span className="sp-stat-value">{value}</span><span className="sp-stat-label">{label}</span><span className="so-stat-help">{help}</span></button>;
}

function deadlineLabel(value) {
  const ms = Date.parse(value) - Date.now();
  if (Number.isNaN(ms)) return 'No deadline';
  if (ms <= 0) return 'Expired';
  const days = Math.ceil(ms / 86400000);
  return `${days} day${days === 1 ? '' : 's'} left`;
}

function ChallengeCard({ challenge, onOpen, compact = false }) {
  return <article className={`sp-challenge-card ${compact ? 'is-compact' : ''}`}><div className="sp-challenge-company"><span className="sp-company-mark">{(challenge.companyName || 'C').charAt(0).toUpperCase()}</span><span>{challenge.companyName || 'Company information unavailable'}</span><StatusPill tone={challenge.isPaid ? 'success' : 'neutral'}>{challenge.isPaid ? 'Paid' : 'Unpaid'}</StatusPill></div><h3>{challenge.roleTitle}</h3><p className="sp-challenge-description">{challenge.taskDescription?.trim() || 'No description provided'}</p><div className="sp-chip-list">{(challenge.requiredSkills || []).slice(0, 5).map(skill => <span className="sp-chip" key={skill}>{skill}</span>)}</div><div className="sp-challenge-meta"><span><StudentIcon name="clock" size={15} /> Closes {formatDate(challenge.applicationClosesAt)}</span><span>{challenge.individualTaskDurationDays} day task</span></div>{challenge.compensationDetails && <p className="sp-compensation">{challenge.compensationDetails}</p>}<button className="sp-button sp-button-secondary sp-card-action" onClick={onOpen}>View challenge <StudentIcon name="arrow" size={15} /></button></article>;
}

export function StudentProfilePage({ profile, profileLoading, onSaved, onRefresh, notify }) {
  const [form, setForm] = useState(emptyProfile);
  const [skillDraft, setSkillDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [savedMessage, setSavedMessage] = useState('');
  const [projectsBusy, setProjectsBusy] = useState(false);
  const [projectError, setProjectError] = useState('');
  const [projectForm, setProjectForm] = useState({ title: '', description: '', projectUrl: '' });
  const [editingProject, setEditingProject] = useState(null);

  useEffect(() => {
    setForm({ ...emptyProfile, ...(profile || {}), skills: profile?.skills || [] });
  }, [profile?.id, profile?.updatedAt]);

  function setField(key, value) { setForm(current => ({ ...current, [key]: value })); setError(''); setSavedMessage(''); }
  function addSkill(event) {
    event.preventDefault();
    const skill = skillDraft.trim().slice(0, 60);
    if (!skill || form.skills.some(item => item.toLocaleLowerCase() === skill.toLocaleLowerCase())) return setSkillDraft('');
    if (form.skills.length >= 40) return setError('You can add up to 40 skills.');
    setField('skills', [...form.skills, skill]); setSkillDraft('');
  }
  async function saveProfile(event) {
    event.preventDefault(); setError(''); setSavedMessage('');
    if (!form.fullName.trim()) return setError('Full name is required.');
    if (!validUrl(form.profileImage) || !validUrl(form.githubUrl) || !validUrl(form.linkedinUrl) || !validUrl(form.portfolioUrl) || !validUrl(form.resumeReference)) return setError('Use a valid HTTP or HTTPS URL for each profile link.');
    const year = form.graduationYear ? Number(form.graduationYear) : null;
    if (year && (!Number.isInteger(year) || year < 1950 || year > 2200)) return setError('Graduation year must be between 1950 and 2200.');
    setBusy(true);
    try {
      const result = await studentApi.updateProfile({ ...form, fullName: form.fullName.trim(), graduationYear: year, skills: form.skills });
      onSaved(result.profile); setSavedMessage('Your profile changes have been saved.');
    } catch (saveError) { setError(errorMessage(saveError)); }
    finally { setBusy(false); }
  }
  function startProjectEdit(project) {
    setEditingProject(project.id); setProjectForm({ title: project.title, description: project.description || '', projectUrl: project.projectUrl || '' }); setProjectError('');
  }
  function resetProjectForm() { setEditingProject(null); setProjectForm({ title: '', description: '', projectUrl: '' }); setProjectError(''); }
  async function saveProject(event) {
    event.preventDefault(); setProjectError('');
    if (!projectForm.title.trim()) return setProjectError('Project title is required.');
    if (!validUrl(projectForm.projectUrl)) return setProjectError('Enter a valid HTTP or HTTPS project URL.');
    setProjectsBusy(true);
    try {
      if (editingProject) await studentApi.updateProject(editingProject, projectForm);
      else await studentApi.createProject(projectForm);
      await onRefresh(); resetProjectForm();
    } catch (saveError) { setProjectError(errorMessage(saveError)); }
    finally { setProjectsBusy(false); }
  }
  async function deleteProject(id) {
    if (!window.confirm('Remove this project from your profile?')) return;
    setProjectsBusy(true); setProjectError('');
    try { await studentApi.deleteProject(id); await onRefresh(); }
    catch (deleteError) { setProjectError(errorMessage(deleteError)); }
    finally { setProjectsBusy(false); }
  }

  if (profileLoading) return <LoadingState label="Loading your profile…" />;
  return <>
    <PageTitle eyebrow="YOUR PROFESSIONAL STORY" title="My profile" description="Keep your details current so companies can understand your skills and work." />
    {!profile && <StateBlock title="Start with your name and a few skills" >Your other profile fields can stay empty until you are ready to add them.</StateBlock>}
    <div className="sp-profile-layout">
      <form className="sp-panel sp-profile-form" onSubmit={saveProfile}>
        <div className="sp-section-heading"><span className="sp-eyebrow">PROFILE DETAILS</span><h2>About you</h2><p>Only the details you provide are shown to companies in Talent Discovery.</p></div>
        <div className="sp-profile-identity"><div className="sp-large-avatar">{form.profileImage ? <img src={form.profileImage} alt="Profile" /> : (form.fullName || 'S').charAt(0).toUpperCase()}</div><div><strong>{form.fullName || 'Your name'}</strong><small>Profile image uses a public image URL; file upload is not available for profile images.</small></div></div>
        <div className="sp-form-grid">
          <Field label="Full name" value={form.fullName} onChange={event => setField('fullName', event.target.value)} maxLength={150} required autoComplete="name" />
          <Field label="College or university" value={form.college || ''} onChange={event => setField('college', event.target.value)} maxLength={200} />
          <Field label="Degree or course" value={form.degree || ''} onChange={event => setField('degree', event.target.value)} maxLength={160} />
          <Field label="Graduation year" type="number" min="1950" max="2200" value={form.graduationYear || ''} onChange={event => setField('graduationYear', event.target.value)} />
          <Field label="Location" value={form.location || ''} onChange={event => setField('location', event.target.value)} maxLength={160} />
          <Field label="Profile image URL" type="url" value={form.profileImage || ''} onChange={event => setField('profileImage', event.target.value)} maxLength={2048} placeholder="https://…" />
          <Field label="GitHub URL" type="url" value={form.githubUrl || ''} onChange={event => setField('githubUrl', event.target.value)} maxLength={2048} placeholder="https://github.com/…" />
          <Field label="LinkedIn URL" type="url" value={form.linkedinUrl || ''} onChange={event => setField('linkedinUrl', event.target.value)} maxLength={2048} placeholder="https://linkedin.com/in/…" />
          <Field label="Portfolio URL" type="url" value={form.portfolioUrl || ''} onChange={event => setField('portfolioUrl', event.target.value)} maxLength={2048} placeholder="https://…" />
          <Field label="Resume URL / reference" type="url" value={form.resumeReference || ''} onChange={event => setField('resumeReference', event.target.value)} maxLength={2048} placeholder="https://…" hint="Add a link you want companies to open. OSF does not upload resume files here." />
          <Field className="sp-field-full" label="About" as="textarea" rows={5} value={form.about || ''} onChange={event => setField('about', event.target.value)} maxLength={3000} placeholder="A short introduction about your interests, experience and the work you want to do." />
        </div>
        <div className="sp-skill-editor"><label className="sp-field" htmlFor="student-skill-input"><span>Skills</span><small>Add skills that you want companies to find you for.</small></label><div className="sp-skill-entry"><input id="student-skill-input" value={skillDraft} onChange={event => setSkillDraft(event.target.value)} maxLength={60} placeholder="e.g. React, UX research" onKeyDown={event => { if (event.key === 'Enter' || event.key === ',') addSkill(event); }} /><button className="sp-button sp-button-secondary" onClick={addSkill}><StudentIcon name="plus" size={15} /> Add skill</button></div>{form.skills.length > 0 && <div className="sp-editable-skills">{form.skills.map(skill => <span className="sp-edit-skill" key={skill}>{skill}<button type="button" aria-label={`Remove ${skill}`} onClick={() => setField('skills', form.skills.filter(item => item !== skill))}>×</button></span>)}</div>}</div>
        {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}{savedMessage && <div className="student-alert student-alert-success" role="status">{savedMessage}</div>}
        <div className="sp-form-actions"><span>Fields marked optional can be completed later.</span><button className="sp-button sp-button-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
      </form>

      <aside className="sp-profile-aside"><section className="sp-panel"><span className="sp-eyebrow">PROFILE PREVIEW</span><h2>{profile?.fullName || 'Your profile'}</h2><p>{profile?.college || 'College not added'}{profile?.degree ? ` · ${profile.degree}` : ''}</p><p className="sp-profile-preview-about">{profile?.about || 'Your introduction will appear here after you save it.'}</p><div className="sp-chip-list">{profile?.skills?.length ? profile.skills.map(skill => <span className="sp-chip" key={skill}>{skill}</span>) : <span className="sp-muted">No skills yet</span>}</div><div className="sp-profile-links">{[['GitHub', profile?.githubUrl], ['LinkedIn', profile?.linkedinUrl], ['Portfolio', profile?.portfolioUrl], ['Resume', profile?.resumeReference]].filter(([, href]) => href).map(([label, href]) => <a key={label} href={href} target="_blank" rel="noreferrer">{label}<StudentIcon name="arrow" size={14} /></a>)}</div></section>
        <section className="sp-panel sp-project-panel"><div className="sp-section-heading"><span className="sp-eyebrow">YOUR WORK</span><h2>Projects</h2><p>Add projects with optional descriptions and links.</p></div>
          {profile?.projects?.length ? <div className="sp-project-list">{profile.projects.map(project => <article className="sp-project-item" key={project.id}><div className="sp-project-item-heading"><strong>{project.title}</strong><div><button type="button" className="sp-text-action" onClick={() => startProjectEdit(project)}>Edit</button><button type="button" className="sp-text-action is-danger" onClick={() => deleteProject(project.id)} disabled={projectsBusy}>Remove</button></div></div><p>{project.description || 'No description added.'}</p>{project.projectUrl && <a href={project.projectUrl} target="_blank" rel="noreferrer">Open project <StudentIcon name="arrow" size={14} /></a>}</article>)}</div> : <StateBlock title="No projects added yet">Projects are optional. Add one when you are ready to showcase your work.</StateBlock>}
          <form className="sp-project-form" onSubmit={saveProject}><h3>{editingProject ? 'Edit project' : 'Add a project'}</h3><Field label="Project title" value={projectForm.title} onChange={event => setProjectForm(value => ({ ...value, title: event.target.value }))} maxLength={150} required /><Field label="Project URL" type="url" value={projectForm.projectUrl} onChange={event => setProjectForm(value => ({ ...value, projectUrl: event.target.value }))} maxLength={2048} placeholder="https://…" /><Field label="Description" as="textarea" rows={3} value={projectForm.description} onChange={event => setProjectForm(value => ({ ...value, description: event.target.value }))} maxLength={3000} />{projectError && <div className="student-alert student-alert-error" role="alert">{projectError}</div>}<div className="sp-project-actions"><button className="sp-button sp-button-primary" type="submit" disabled={projectsBusy || !profile}>{projectsBusy ? 'Saving…' : editingProject ? 'Save project' : 'Add project'}</button>{editingProject && <button className="sp-button sp-button-secondary" type="button" onClick={resetProjectForm}>Cancel</button>}</div>{!profile && <small>Save your profile before adding projects.</small>}</form>
        </section>
      </aside>
    </div>
  </>;
}

const emptyProfile = { fullName: '', profileImage: '', college: '', degree: '', graduationYear: '', about: '', skills: [], resumeReference: '', githubUrl: '', linkedinUrl: '', portfolioUrl: '', location: '' };

export function ExploreChallengesPage({ go }) {
  const [challenges, setChallenges] = useState([]);
  const [search, setSearch] = useState('');
  const [skill, setSkill] = useState('');
  const [paid, setPaid] = useState('all');
  const [sort, setSort] = useState('closing');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load() {
    setLoading(true); setError('');
    try { const result = await studentApi.challenges({ skills: skill.trim() }); setChallenges(result.challenges || []); }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const visible = useMemo(() => challenges.filter(challenge => {
    const query = search.trim().toLocaleLowerCase();
    const searchable = [challenge.roleTitle, challenge.companyName, challenge.taskDescription, ...(challenge.requiredSkills || [])].join(' ').toLocaleLowerCase();
    if (query && !searchable.includes(query)) return false;
    if (paid === 'paid' && !challenge.isPaid) return false;
    if (paid === 'unpaid' && challenge.isPaid) return false;
    return true;
  }).sort((a, b) => sort === 'title' ? a.roleTitle.localeCompare(b.roleTitle) : sort === 'newest' ? Date.parse(b.createdAt) - Date.parse(a.createdAt) : Date.parse(a.applicationClosesAt) - Date.parse(b.applicationClosesAt)), [challenges, search, paid, sort]);

  return <>
    <PageTitle eyebrow="FIND YOUR NEXT STEP" title="Explore challenges" description="Explore published work from OSF companies and apply when the application window is open." />
    <form className="sp-filter-bar" onSubmit={event => { event.preventDefault(); load(); }}><label className="sp-filter-search"><StudentIcon name="search" /><input aria-label="Search challenges" value={search} onChange={event => setSearch(event.target.value)} placeholder="Search role, company or skill" /></label><Field label="Required skill" value={skill} onChange={event => setSkill(event.target.value)} maxLength={60} placeholder="Filter by skill" /><Field label="Compensation" as="select" value={paid} onChange={event => setPaid(event.target.value)}><option value="all">Any</option><option value="paid">Paid</option><option value="unpaid">Unpaid</option></Field><Field label="Sort by" as="select" value={sort} onChange={event => setSort(event.target.value)}><option value="closing">Closing soon</option><option value="newest">Recently published</option><option value="title">Role title</option></Field><button className="sp-button sp-button-primary" type="submit" disabled={loading}>{loading ? 'Loading…' : 'Apply filters'}</button></form>
    {loading ? <LoadingState label="Loading published challenges…" /> : error ? <StateBlock title="Challenges couldn’t be loaded" tone="error" action={<button className="sp-button sp-button-secondary" onClick={load}>Retry</button>}>{error}</StateBlock> : visible.length ? <><div className="sp-results-count">{visible.length} published {visible.length === 1 ? 'challenge' : 'challenges'}</div><div className="sp-challenge-grid">{visible.map(challenge => <ChallengeCard key={challenge.id} challenge={challenge} onOpen={() => go(`/student/challenges/${encodeURIComponent(challenge.id)}`)} />)}</div></> : <StateBlock title={challenges.length ? 'No challenges match these filters' : 'No published challenges yet'} action={challenges.length ? <button className="sp-button sp-button-secondary" onClick={() => { setSearch(''); setSkill(''); setPaid('all'); load(); }}>Clear filters</button> : null}>{challenges.length ? 'Try a different title, skill or compensation filter.' : 'Published opportunities will appear here when companies open them.'}</StateBlock>}
  </>;
}

export function ChallengeDetailsPage({ challengeId, go, notify }) {
  const [challenge, setChallenge] = useState(null);
  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [applyError, setApplyError] = useState('');
  const [now, setNow] = useState(Date.now());

  async function load() {
    setLoading(true); setError('');
    try {
      const [challengeResult, applicationsResult] = await Promise.all([studentApi.challenge(challengeId), studentApi.applications()]);
      setChallenge(challengeResult.challenge);
      setApplication((applicationsResult.applications || []).find(item => item.challengeId === challengeId) || null);
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [challengeId]);
  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 30000); return () => window.clearInterval(timer); }, []);

  const opens = challenge ? Date.parse(challenge.applicationOpensAt) : 0;
  const closes = challenge ? Date.parse(challenge.applicationClosesAt) : 0;
  const windowNotOpen = now < opens;
  const windowClosed = now > closes;

  async function apply() {
    setBusy(true); setApplyError('');
    try { const result = await studentApi.apply(challengeId); setApplication({ ...result.application, roleTitle: challenge.roleTitle }); notify('success', 'Your application was submitted.'); }
    catch (applyError) { setApplyError(applyError.message || 'The application could not be submitted.'); }
    finally { setBusy(false); }
  }

  if (loading) return <LoadingState label="Loading challenge details…" />;
  if (error || !challenge) return <><PageTitle eyebrow="CHALLENGE DETAILS" title="Challenge unavailable" /><StateBlock title="This challenge could not be opened" tone="error" action={<button className="sp-button sp-button-secondary" onClick={() => go('/student/challenges')}>Back to challenges</button>}>{error || 'The challenge may no longer be published.'}</StateBlock></>;

  return <>
    <button className="sp-back-link" onClick={() => go('/student/challenges')}>← All challenges</button>
    <div className="sp-detail-hero"><div className="sp-company-mark sp-company-mark-large">{(challenge.companyName || 'C').charAt(0).toUpperCase()}</div><div className="sp-detail-hero-copy"><span className="sp-eyebrow">PUBLISHED CHALLENGE</span><h1>{challenge.roleTitle}</h1><p>{challenge.companyName || 'Company information unavailable'}</p></div><StatusPill tone={challenge.isPaid ? 'success' : 'neutral'}>{challenge.isPaid ? 'Paid opportunity' : 'Unpaid opportunity'}</StatusPill></div>
    <div className="sp-detail-grid"><div className="sp-detail-main"><section className="sp-panel"><div className="sp-section-heading"><span className="sp-eyebrow">THE TASK</span><h2>Challenge brief</h2></div><p className="sp-long-copy">{challenge.taskDescription}</p>{challenge.reference && <div className="sp-detail-info"><strong>Reference</strong><p>{challenge.reference}</p></div>}{challenge.language && <div className="sp-detail-info"><strong>Language or tools</strong><p>{challenge.language}</p></div>}{challenge.extraInformation && <div className="sp-detail-info"><strong>Additional information</strong><p>{challenge.extraInformation}</p></div>}</section><section className="sp-panel"><div className="sp-section-heading"><span className="sp-eyebrow">WHAT YOU’LL NEED</span><h2>Required skills</h2></div><div className="sp-chip-list">{challenge.requiredSkills?.map(skillName => <span className="sp-chip" key={skillName}>{skillName}</span>)}</div></section></div>
      <aside className="sp-detail-aside"><section className="sp-panel sp-apply-panel"><span className="sp-eyebrow">APPLICATION WINDOW</span><div className="sp-window-dates"><div><small>Opens</small><strong>{formatDate(challenge.applicationOpensAt, true)}</strong></div><div><small>Closes</small><strong>{formatDate(challenge.applicationClosesAt, true)}</strong></div></div><div className="sp-detail-facts"><div><span>Individual task</span><strong>{challenge.individualTaskDurationDays} days from applying</strong></div><div><span>Compensation</span><strong>{challenge.compensationDetails || (challenge.isPaid ? 'Paid, details to follow' : 'Unpaid')}</strong></div>{challenge.candidateCount != null && <div><span>Candidate limit</span><strong>{challenge.candidateCount}</strong></div>}</div>
          {application ? <><StatusPill tone={statusTone(application.status)}>{prettyStatus(application.status)}</StatusPill><button className="sp-button sp-button-primary sp-button-wide" onClick={() => go(`/student/applications/${encodeURIComponent(application.id)}`)}>View your application</button></> : windowClosed ? <StateBlock title="Applications closed">This challenge is no longer accepting applications.</StateBlock> : windowNotOpen ? <><StateBlock title="Applications open soon">You can apply from {formatDate(challenge.applicationOpensAt, true)}.</StateBlock><button className="sp-button sp-button-disabled sp-button-wide" disabled>Not open yet</button></> : <button className="sp-button sp-button-primary sp-button-wide" onClick={apply} disabled={busy}>{busy ? 'Applying…' : 'Apply to challenge'} <StudentIcon name="arrow" size={16} /></button>}
          {applyError && <div className="student-alert student-alert-error" role="alert">{applyError}</div>}
          <p className="sp-application-note">Your task deadline is calculated when you apply and is separate from this application window.</p>
        </section></aside>
    </div>
  </>;
}

export function MyApplicationsPage({ go }) {
  const [applications, setApplications] = useState([]);
  const [companyByChallenge, setCompanyByChallenge] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try {
      const [applicationResult, challengeResult] = await Promise.all([studentApi.applications(), studentApi.challenges()]);
      setApplications(applicationResult.applications || []);
      setCompanyByChallenge(Object.fromEntries((challengeResult.challenges || []).map(challenge => [challenge.id, challenge.companyName])));
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  return <>
    <PageTitle eyebrow="YOUR OPPORTUNITY TRACKER" title="My applications" description="Follow each application and its individual task deadline." action={<button className="sp-button sp-button-secondary" onClick={() => go('/student/challenges')}>Explore challenges <StudentIcon name="arrow" size={15} /></button>} />
    {loading ? <LoadingState label="Loading your applications…" /> : error ? <StateBlock title="Applications couldn’t be loaded" tone="error" action={<button className="sp-button sp-button-secondary" onClick={load}>Retry</button>}>{error}</StateBlock> : applications.length ? <div className="sp-application-list">{applications.map(application => <ApplicationCard key={application.id} application={application} companyName={companyByChallenge[application.challengeId]} onOpen={() => go(`/student/applications/${encodeURIComponent(application.id)}`)} />)}</div> : <StateBlock title="You haven’t applied to a challenge yet" action={<button className="sp-button sp-button-primary" onClick={() => go('/student/challenges')}>Explore challenges <StudentIcon name="arrow" size={15} /></button>}>When you apply, the challenge and your task deadline will appear here.</StateBlock>}
  </>;
}

function ApplicationCard({ application, companyName, onOpen }) {
  return <button className="sp-application-card" onClick={onOpen}><span className="sp-application-mark"><StudentIcon name="briefcase" /></span><span className="sp-application-main"><strong>{application.roleTitle || 'Challenge application'}</strong><small>{companyName || 'Company details are no longer publicly available'}</small><span className="sp-application-dates">Applied {formatDate(application.appliedAt)} · Deadline {formatDate(application.individualDeadline)}</span></span><span className="sp-application-badges"><StatusPill tone={statusTone(application.status)}>{prettyStatus(application.status)}</StatusPill>{application.submission?.submittedAt && <StatusPill tone="success">Submitted</StatusPill>}{isShortlisted(application.evaluation) && <StatusPill tone="gold">Shortlisted</StatusPill>}</span><StudentIcon name="arrow" size={17} /></button>;
}

export function ApplicationDetailsPage({ applicationId, go, notify }) {
  const [application, setApplication] = useState(null);
  const [companyName, setCompanyName] = useState('');
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  async function load() {
    setLoading(true); setError('');
    try {
      const [applicationResult, submissionResult, challengeResult] = await Promise.all([
        studentApi.applications(), studentApi.submission(applicationId), studentApi.challenges(),
      ]);
      const found = (applicationResult.applications || []).find(item => item.id === applicationId);
      if (!found) throw new Error('This application could not be found in your account.');
      setApplication(found); setSubmission(submissionResult.submission);
      setCompanyName((challengeResult.challenges || []).find(challenge => challenge.id === found.challengeId)?.companyName || '');
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [applicationId]);
  async function startTask() {
    setStarting(true); setError('');
    try { const result = await studentApi.startApplication(applicationId); setApplication(current => ({ ...current, status: result.application.status })); notify('success', 'Your task is now in progress.'); }
    catch (startError) { setError(startError.message); }
    finally { setStarting(false); }
  }
  if (loading) return <LoadingState label="Loading your application…" />;
  if (error && !application) return <><PageTitle eyebrow="APPLICATION" title="Application unavailable" /><StateBlock title="We couldn’t open this application" tone="error" action={<button className="sp-button sp-button-secondary" onClick={() => go('/student/applications')}>Back to applications</button>}>{error}</StateBlock></>;
  const deadlinePassed = Date.parse(application.individualDeadline) <= Date.now();
  const canEditSubmission = !deadlinePassed && application.status !== 'EXPIRED';
  const isSubmitted = application.status === 'SUBMITTED' || Boolean(submission?.submittedAt);
  const challenge = { roleTitle: application.roleTitle || 'Challenge application', companyName, applicationClosesAt: application.applicationClosesAt };

  return <>
    <button className="sp-back-link" onClick={() => go('/student/applications')}>← My applications</button>
    <PageTitle eyebrow="APPLICATION DETAILS" title={application.roleTitle || 'Challenge application'} description={companyName || 'Company information unavailable'} action={<StatusPill tone={statusTone(application.status)}>{prettyStatus(application.status)}</StatusPill>} />
    <div className="sp-application-detail-grid"><div className="sp-panel"><div className="sp-panel-heading"><div><span className="sp-eyebrow">YOUR TASK</span><h2>Individual deadline</h2></div><StudentIcon name="clock" size={22} /></div><div className="sp-deadline-highlight"><strong>{formatDate(application.individualDeadline, true)}</strong><span>{deadlinePassed ? 'Deadline passed' : 'Calculated by OSF when you applied'}</span></div><div className="sp-detail-facts"><div><span>Applied</span><strong>{formatDate(application.appliedAt, true)}</strong></div><div><span>Challenge application window closes</span><strong>{formatDate(application.applicationClosesAt, true)}</strong></div></div><p className="sp-muted">Your individual task deadline is independent from the public application window.</p>{application.status === 'APPLIED' && canEditSubmission && !submission && <button className="sp-button sp-button-primary" onClick={startTask} disabled={starting}>{starting ? 'Starting…' : 'Start task'} <StudentIcon name="arrow" size={15} /></button>}{error && <div className="student-alert student-alert-error" role="alert">{error}</div>}</div>
      <div className="sp-panel"><span className="sp-eyebrow">COMPANY REVIEW</span><h2>Evaluation</h2>{application.evaluation ? <div className="sp-review-card"><div className="sp-review-top">{application.evaluation.rating != null && <strong className="sp-rating">{application.evaluation.rating}<small>/5</small></strong>}{isShortlisted(application.evaluation) && <StatusPill tone="gold">Shortlisted</StatusPill>}</div><p>{application.evaluation.feedback || 'No written feedback was provided.'}</p><small>Reviewed {formatDate(application.evaluation.evaluatedAt)}</small></div> : <StateBlock title="No company review yet">Evaluation and shortlist information will appear here when the company updates your application.</StateBlock>}</div>
    </div>
    <SubmissionPanel application={application} submission={submission} canEdit={canEditSubmission} isSubmitted={isSubmitted} onSaved={async result => { setSubmission(result); setApplication(current => ({ ...current, status: 'SUBMITTED', submission: { submittedAt: result.submittedAt } })); await load(); notify('success', 'Your submission was saved.'); }} />
  </>;
}

function SubmissionPanel({ application, submission, canEdit, isSubmitted, onSaved }) {
  const [form, setForm] = useState({ githubUrl: '', deployedUrl: '', supportingInformation: '', fileReference: '' });
  const [fileName, setFileName] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  useEffect(() => { setForm({ githubUrl: submission?.githubUrl || '', deployedUrl: submission?.deployedUrl || '', supportingInformation: submission?.supportingInformation || '', fileReference: submission?.fileReference || '' }); setFileName(submission?.file?.name || ''); }, [submission?.id, submission?.updatedAt, submission?.fileReference, submission?.file?.name]);

  async function download() {
    setError(''); setSaved(''); setDownloading(true);
    try {
      const result = await studentApi.downloadFile(application.id);
      const objectUrl = URL.createObjectURL(result.blob);
      const link = document.createElement('a'); link.href = objectUrl; link.download = result.filename; document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    } catch (downloadError) { setError(errorMessage(downloadError)); }
    finally { setDownloading(false); }
  }

  async function upload() {
    if (!selectedFile) return setError('Choose a file before uploading.');
    if (selectedFile.size > 10 * 1024 * 1024) return setError('Files must be 10 MB or smaller.');
    const extension = `.${selectedFile.name.split('.').pop()?.toLowerCase() || ''}`;
    const allowed = { '.pdf': ['application/pdf'], '.txt': ['text/plain'], '.zip': ['application/zip', 'application/x-zip-compressed'], '.png': ['image/png'], '.jpg': ['image/jpeg'], '.jpeg': ['image/jpeg'] };
    if (!allowed[extension] || (selectedFile.type && !allowed[extension].includes(selectedFile.type))) return setError('Choose a matching PDF, TXT, ZIP, PNG or JPG file.');
    setUploading(true); setError(''); setSaved('');
    try {
      const result = await studentApi.uploadFile(application.id, selectedFile);
      setForm(current => ({ ...current, fileReference: result.file.id })); setFileName(result.file.name); setSelectedFile(null); setSaved('File uploaded and ready to include in your submission.');
    } catch (uploadError) { setError(errorMessage(uploadError)); }
    finally { setUploading(false); }
  }
  async function submit(event) {
    event.preventDefault(); setError(''); setSaved('');
    if (!validUrl(form.githubUrl) || !validUrl(form.deployedUrl)) return setError('Use a valid HTTP or HTTPS URL for each link.');
    if (!form.githubUrl && !form.deployedUrl && !form.supportingInformation.trim() && !form.fileReference) return setError('Add a repository, deployed link, file, or supporting information.');
    setSaving(true);
    try { const result = await studentApi.submitWork(application.id, form); await onSaved(result.submission); }
    catch (submitError) { setError(errorMessage(submitError)); }
    finally { setSaving(false); }
  }

  return <section className="sp-panel sp-submission-panel"><div className="sp-panel-heading"><div><span className="sp-eyebrow">TASK DELIVERY</span><h2>{isSubmitted ? 'Your submission' : 'Submit your work'}</h2></div>{isSubmitted && <StatusPill tone="success">Submitted {formatDate(submission?.submittedAt || application.submission?.submittedAt)}</StatusPill>}</div>
    {submission ? <div className="sp-existing-submission"><div><strong>{isSubmitted ? 'Current submission' : 'Saved draft'}</strong><span>Updated {formatDate(submission.updatedAt || submission.submittedAt, true)}</span></div><div className="sp-submission-links">{submission.githubUrl && <a href={submission.githubUrl} target="_blank" rel="noreferrer">GitHub repository <StudentIcon name="arrow" size={14} /></a>}{submission.deployedUrl && <a href={submission.deployedUrl} target="_blank" rel="noreferrer">Deployed project <StudentIcon name="arrow" size={14} /></a>}{submission.fileReference && <div className="sp-uploaded-file"><StudentIcon name="file" size={16} /><span>{submission.file?.name || fileName || 'Uploaded file'}</span>{submission.file ? <button className="sp-button sp-button-secondary" type="button" onClick={download} disabled={downloading}>{downloading ? 'Downloading…' : 'Download'}</button> : <StatusPill tone="warning">Unavailable</StatusPill>}</div>}{submission.supportingInformation && <p>{submission.supportingInformation}</p>}</div></div> : <p className="sp-muted">Share a repository, live project, file, or supporting notes. You can use more than one method.</p>}
    {!canEdit ? <StateBlock title={isSubmitted ? 'Your task deadline has passed' : 'This task can no longer be submitted'}>Existing submission and company review details remain available above.</StateBlock> : application.status === 'APPLIED' && !isSubmitted ? <StateBlock title="Start your task to enable submissions">Use the Start task action above to mark your application in progress.</StateBlock> : <form className="sp-submission-form" onSubmit={submit}><div className="sp-form-grid"><Field label="GitHub repository URL" type="url" value={form.githubUrl} onChange={event => setForm(current => ({ ...current, githubUrl: event.target.value }))} maxLength={2048} placeholder="https://github.com/…" /><Field label="Deployed project URL" type="url" value={form.deployedUrl} onChange={event => setForm(current => ({ ...current, deployedUrl: event.target.value }))} maxLength={2048} placeholder="https://…" /><Field className="sp-field-full" label="Supporting information" as="textarea" rows={4} maxLength={5000} value={form.supportingInformation} onChange={event => setForm(current => ({ ...current, supportingInformation: event.target.value }))} placeholder="Anything the company should know about your work." /></div>
      <div className="sp-upload-row"><label className="sp-field"><span>Submission file</span><input type="file" accept=".pdf,.txt,.zip,.png,.jpg,.jpeg,application/pdf,text/plain,application/zip,image/png,image/jpeg" onChange={event => { setSelectedFile(event.target.files?.[0] || null); setError(''); }} /><small>PDF, TXT, ZIP, PNG or JPG · up to 10 MB</small></label><button className="sp-button sp-button-secondary" type="button" onClick={upload} disabled={!selectedFile || uploading}>{uploading ? 'Uploading…' : 'Upload file'}</button></div>
      {form.fileReference && <div className="sp-uploaded-file"><StudentIcon name="file" size={16} /><span>{fileName || 'Uploaded file'}</span><button className="sp-button sp-button-secondary" type="button" onClick={download} disabled={downloading}>{downloading ? 'Downloading…' : 'Download'}</button><StatusPill tone="success">Ready</StatusPill></div>}
      {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}{saved && <div className="student-alert student-alert-success" role="status">{saved}</div>}
      <div className="sp-form-actions"><span>OSF confirms the submission after the server accepts it.</span><button className="sp-button sp-button-primary" type="submit" disabled={saving || uploading}>{saving ? 'Submitting…' : isSubmitted ? 'Update submission' : 'Submit work'}</button></div>
    </form>}
  </section>;
}

export function SkillVerificationPage({ go }) {
  const [assessments, setAssessments] = useState([]);
  const [attempts, setAttempts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function load() {
    setLoading(true); setError('');
    try { const [assessmentResult, attemptResult] = await Promise.all([studentApi.assessments(), studentApi.attempts()]); setAssessments(assessmentResult.assessments || []); setAttempts(attemptResult.attempts || []); }
    catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);
  const attemptsByAssessment = Object.fromEntries(attempts.map(attempt => [attempt.assessmentId, attempt]));
  const available = [...assessments];
  for (const attempt of attempts) {
    if (!available.some(assessment => assessment.id === attempt.assessmentId)) available.push({
      id: attempt.assessmentId, title: attempt.assessmentTitle, relatedSkill: 'Previous assessment',
      durationMinutes: attempt.durationMinutes, status: attempt.assessmentStatus,
    });
  }
  return <>
    <PageTitle eyebrow="SHOW WHAT YOU KNOW" title="Skill verification" description="Attempt company-created assessments and follow the manual review from your workspace." />
    {loading ? <LoadingState label="Loading available assessments…" /> : error ? <StateBlock title="Assessments couldn’t be loaded" tone="error" action={<button className="sp-button sp-button-secondary" onClick={load}>Retry</button>}>{error}</StateBlock> : available.length ? <div className="sp-assessment-grid">{available.map(assessment => {
      const attempt = attemptsByAssessment[assessment.id];
      return <article className="sp-assessment-card" key={assessment.id}><div className="sp-assessment-icon"><StudentIcon name="medal" size={20} /></div><div className="sp-assessment-head"><span className="sp-chip">{assessment.relatedSkill}</span>{attempt && <StatusPill tone={statusTone(attempt.status)}>{prettyStatus(attempt.status)}</StatusPill>}{assessment.status === 'CLOSED' && <StatusPill>Closed</StatusPill>}</div><h2>{assessment.title}</h2><p>{assessment.description || (assessment.status === 'CLOSED' ? 'This assessment is closed to new attempts. Your history and review remain available.' : 'A company-created assessment to demonstrate your skills.')}</p><div className="sp-assessment-meta"><span>{assessment.durationMinutes ? `${assessment.durationMinutes} min` : 'No time limit'}</span><span>Manual company review</span></div><button className="sp-button sp-button-secondary sp-card-action" onClick={() => go(`/student/assessments/${encodeURIComponent(assessment.id)}`)}>{attempt?.status === 'IN_PROGRESS' ? 'Continue attempt' : attempt ? 'View attempt' : 'View assessment'} <StudentIcon name="arrow" size={15} /></button></article>;
    })}</div> : <StateBlock title="No assessments are available yet">Published company assessments will appear here.</StateBlock>}
  </>;
}

export function AssessmentPage({ assessmentId, go, notify }) {
  const [assessment, setAssessment] = useState(null);
  const [attempt, setAttempt] = useState(null);
  const [answers, setAnswers] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saveState, setSaveState] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(null);
  const answersRef = useRef({});
  const saveQueue = useRef(Promise.resolve());
  const saveSequence = useRef(0);
  const expiryRefresh = useRef(false);
  const monotonicDeadline = useRef(null);

  function acceptAttempt(nextAttempt) {
    setAttempt(nextAttempt);
    monotonicDeadline.current = nextAttempt?.expiresAt && nextAttempt?.serverNow
      ? performance.now() + Math.max(0, Date.parse(nextAttempt.expiresAt) - Date.parse(nextAttempt.serverNow)) : null;
  }

  async function load() {
    setLoading(true); setError('');
    setAttempt(null); setAssessment(null); setAnswers({}); answersRef.current = {}; monotonicDeadline.current = null;
    saveQueue.current = Promise.resolve(); saveSequence.current = 0; expiryRefresh.current = false;
    try {
      const result = await studentApi.assessment(assessmentId); setAssessment(result.assessment);
      const attemptResult = await studentApi.attempts();
      const existing = (attemptResult.attempts || []).find(item => item.assessmentId === assessmentId);
      if (existing) {
        const fullAttempt = await studentApi.attempt(existing.id);
        acceptAttempt(fullAttempt.attempt);
        const savedAnswers = Object.fromEntries((fullAttempt.attempt.questions || []).filter(question => question.selectedOption).map(question => [question.id, question.selectedOption]));
        answersRef.current = savedAnswers; setAnswers(savedAnswers);
        setSaveState('');
      }
    } catch (loadError) { setError(errorMessage(loadError)); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, [assessmentId]);
  useEffect(() => {
    if (!attempt?.durationMinutes || !attempt.startedAt || attempt.status !== 'IN_PROGRESS') { setSecondsLeft(null); return undefined; }
    const update = () => {
      const deadline = monotonicDeadline.current ?? (Date.parse(attempt.startedAt) + attempt.durationMinutes * 60000);
      const currentTime = monotonicDeadline.current == null ? Date.now() : performance.now();
      const remaining = Math.max(0, Math.ceil((deadline - currentTime) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !expiryRefresh.current) {
        expiryRefresh.current = true;
        studentApi.attempt(attempt.id).then(result => acceptAttempt(result.attempt)).catch(loadError => setError(errorMessage(loadError)));
      }
    };
    expiryRefresh.current = false;
    update(); const timer = window.setInterval(update, 1000); return () => window.clearInterval(timer);
  }, [attempt?.id, attempt?.startedAt, attempt?.durationMinutes, attempt?.status]);

  function selectAnswer(questionId, selectedOption) {
    const snapshot = { ...answersRef.current, [questionId]: selectedOption };
    answersRef.current = snapshot;
    setAnswers(snapshot);
    const sequence = ++saveSequence.current;
    setSaveState('saving'); setError('');
    const pending = saveQueue.current.catch(() => {}).then(() => studentApi.saveAnswers(attempt.id,
      Object.entries(snapshot).map(([id, option]) => ({ questionId: id, selectedOption: option }))));
    saveQueue.current = pending.then(result => {
      acceptAttempt(result.attempt);
      if (sequence === saveSequence.current) setSaveState('saved');
      return result;
    }, saveError => {
      if (sequence === saveSequence.current) { setSaveState('error'); setError(`Answer not saved: ${errorMessage(saveError)}`); }
      throw saveError;
    });
    saveQueue.current.catch(() => {});
  }

  async function start() {
    setBusy(true); setError('');
    try { const result = await studentApi.startAttempt(assessmentId); acceptAttempt(result.attempt); setAnswers({}); answersRef.current = {}; }
    catch (startError) { setError(startError.message); }
    finally { setBusy(false); }
  }
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await saveQueue.current;
      const result = await studentApi.submitAnswers(attempt.id, Object.entries(answersRef.current).map(([questionId, selectedOption]) => ({ questionId, selectedOption })));
      acceptAttempt(result.attempt); notify('success', 'Your answers were submitted for company review.');
    } catch (submitError) { setError(errorMessage(submitError)); if (submitError.status === 409) { const refreshed = await studentApi.attempt(attempt.id).catch(() => null); if (refreshed) acceptAttempt(refreshed.attempt); else await load(); } }
    finally { setBusy(false); }
  }

  if (loading) return <LoadingState label="Loading assessment…" />;
  if (error && !assessment) return <><PageTitle eyebrow="SKILL VERIFICATION" title="Assessment unavailable" /><StateBlock title="This assessment couldn’t be opened" tone="error" action={<button className="sp-button sp-button-secondary" onClick={() => go('/student/skills')}>Back to assessments</button>}>{error}</StateBlock></>;
  const submitted = attempt && ['SUBMITTED', 'REVIEWED'].includes(attempt.status);
  const attemptExpired = attempt?.status === 'EXPIRED';
  const expired = secondsLeft === 0;
  return <>
    <button className="sp-back-link" onClick={() => go('/student/skills')}>← Skill verification</button>
    <PageTitle eyebrow={assessment.relatedSkill} title={assessment.title} description={assessment.description || 'Company-created multiple-choice assessment.'} action={assessment.durationMinutes ? <StatusPill tone="info">{assessment.durationMinutes} minutes</StatusPill> : <StatusPill>No timer</StatusPill>} />
    {assessment.instructions && <div className="sp-panel sp-instructions"><span className="sp-eyebrow">INSTRUCTIONS</span><p>{assessment.instructions}</p></div>}
    {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}
    {!attempt ? <div className="sp-panel sp-assessment-start"><div className="sp-assessment-icon"><StudentIcon name="medal" size={22} /></div><div><h2>{assessment.status === 'CLOSED' ? 'Assessment closed' : 'Ready to begin?'}</h2><p>{assessment.status === 'CLOSED' ? 'This assessment is no longer available for new attempts.' : 'This assessment allows one attempt. Your answers will be reviewed manually by the company. Correct answers and automatic scores are not shown.'}</p></div>{assessment.status === 'PUBLISHED' && <button className="sp-button sp-button-primary" onClick={start} disabled={busy}>{busy ? 'Starting…' : 'Start assessment'} <StudentIcon name="arrow" size={16} /></button>}</div>
      : attemptExpired ? <section className="sp-panel sp-attempt-result"><div className="sp-panel-heading"><div><span className="sp-eyebrow">YOUR ATTEMPT</span><h2>Time expired</h2></div><StatusPill tone="warning">Expired</StatusPill></div><StateBlock title="This attempt expired before submission">Answers saved before the deadline remain on your attempt. You can review the attempt here, but it cannot be edited or submitted.</StateBlock></section>
        : submitted ? <section className="sp-panel sp-attempt-result"><div className="sp-panel-heading"><div><span className="sp-eyebrow">YOUR ATTEMPT</span><h2>{prettyStatus(attempt.status)}</h2></div><StatusPill tone={statusTone(attempt.status)}>{prettyStatus(attempt.status)}</StatusPill></div><p>Submitted {formatDate(attempt.submittedAt, true)}. Correct answers are not displayed.</p>{attempt.reviewStatus === 'REVIEWED' ? <div className="sp-review-card"><div className="sp-review-top">{attempt.manualScore != null && <strong className="sp-rating">{attempt.manualScore}<small>/100</small></strong>}<StatusPill tone="success">Reviewed</StatusPill></div><p>{attempt.companyFeedback || 'The company did not leave written feedback.'}</p>{attempt.reviewedAt && <small>Reviewed {formatDate(attempt.reviewedAt, true)}</small>}</div> : <StateBlock title="Waiting for company review">Your attempt has been submitted. A score or feedback will appear here when the company adds its manual review.</StateBlock>}</section>
        : <form className="sp-panel sp-attempt-form" onSubmit={submit}><div className="sp-panel-heading"><div><span className="sp-eyebrow">YOUR ATTEMPT</span><h2>Answer the questions</h2></div>{secondsLeft != null && <StatusPill tone={expired ? 'warning' : 'info'}>{expired ? 'Checking expiry…' : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')} remaining`}</StatusPill>}</div><p className="sp-muted">Choose one option for each question. Your score is not calculated automatically.</p>{attempt.questions.map((question, index) => <fieldset className="sp-question" key={question.id} disabled={expired || busy}><legend><span>Question {index + 1}</span>{question.questionText}</legend>{['A', 'B', 'C', 'D'].map(option => <label className={`sp-option ${answers[question.id] === option ? 'is-selected' : ''}`} key={option}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => selectAnswer(question.id, option)} /><span className="sp-option-letter">{option}</span><span>{question[`option${option}`]}</span></label>)}</fieldset>)}<div className="sp-form-actions"><span>{saveState === 'saving' ? 'Saving answers…' : saveState === 'saved' ? 'All answers saved.' : saveState === 'error' ? 'Some answers need to be saved again.' : 'Answers save automatically while you work.'}</span><button className="sp-button sp-button-primary" type="submit" disabled={busy || expired || saveState === 'saving'}>{busy ? 'Submitting…' : 'Submit answers'}</button></div></form>}
  </>;
}
