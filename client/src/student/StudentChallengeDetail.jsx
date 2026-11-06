import React, { useCallback, useEffect, useRef, useState } from 'react';
import { studentApi } from './studentApi.js';
import { useDialog } from '../ui/useDialog.js';
import { errorMessage, StatusPill } from './StudentUI.jsx';
import './student-challenge-detail.css';

const DAY = 86400000;
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time';
const fmt = value => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value));

// Apply is blocked until the basics are filled in. The overview's 10-field score is a nudge, not a gate;
// we require its essential subset only.
export const profileReady = p => Boolean(p && p.fullName && p.college && p.degree && p.skills?.length);

function countdown(closes, now) {
  const ms = closes - now;
  if (ms <= 0) return 'Closed';
  const days = Math.floor(ms / DAY);
  if (days >= 1) return `Closes in ${days} day${days === 1 ? '' : 's'}`;
  const hours = Math.floor(ms / 3600000);
  return hours >= 1 ? `Closes in ${hours} hour${hours === 1 ? '' : 's'}` : `Closes in ${Math.max(1, Math.ceil(ms / 60000))} min`;
}

function ConfirmDialog({ challenge, busy, error, onConfirm, onCancel }) {
  const ref = useDialog({ onCancel, busy, initialFocus: 'button.scd-primary' });
  const deadline = Date.now() + challenge.individualTaskDurationDays * DAY;
  return <div className="scd-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel(); }}>
    <div className="scd-dialog" role="dialog" aria-modal="true" aria-labelledby="scd-dialog-title" ref={ref}>
      <h2 id="scd-dialog-title">Apply to {challenge.roleTitle}?</h2>
      <p>Your {challenge.individualTaskDurationDays}-day task clock starts the moment you confirm, not when you open the task.</p>
      <div className="scd-deadline"><span>If you apply now, your task is due</span><strong>{fmt(deadline)}</strong></div>
      <p className="scd-helper">The exact deadline is set by the server when your application is recorded. You can&rsquo;t withdraw an application afterwards.</p>
      {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}
      <div className="scd-actions">
        <button className="sp-button sp-button-secondary" onClick={onCancel} disabled={busy}>Not yet</button>
        <button className="sp-button sp-button-primary scd-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Applying…' : 'Apply and start my clock'}</button>
      </div>
    </div>
  </div>;
}

function Skeleton() {
  return <div className="scd" role="status" aria-label="Loading challenge"><div className="scd-skel scd-skel-title" /><div className="scd-skel scd-skel-sub" />
    <div className="scd-grid"><div className="scd-card"><div className="scd-skel scd-skel-line" /><div className="scd-skel scd-skel-line" /><div className="scd-skel scd-skel-line scd-short" /></div>
      <div className="scd-card"><div className="scd-skel scd-skel-line" /><div className="scd-skel scd-skel-line" /><div className="scd-skel scd-skel-line scd-short" /></div></div></div>;
}

export default function StudentChallengeDetail({ challengeId, go, notify, profile, profileLoading }) {
  const [state, setState] = useState({ status: 'loading' });
  const [application, setApplication] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applyError, setApplyError] = useState('');

  const load = useCallback(async () => {
    setState({ status: 'loading' });
    try {
      const [{ challenge }, { applications }] = await Promise.all([studentApi.challenge(challengeId), studentApi.applications()]);
      setApplication((applications || []).find(item => item.challengeId === challengeId) || null);
      setState({ status: 'ready', challenge });
    } catch (error) {
      // A closed challenge is hidden from /challenges/:id, but an existing application can still be opened.
      if (error.status === 404) {
        try {
          const { applications } = await studentApi.applications();
          setApplication((applications || []).find(item => item.challengeId === challengeId) || null);
        } catch { /* fall through to not-found */ }
        setState({ status: 'missing' });
      } else setState({ status: 'error', message: errorMessage(error) });
    }
  }, [challengeId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const back = () => (window.history.length > 1 ? window.history.back() : go('/student/challenges'));
  const backLink = <button className="sp-back-link" onClick={back}>← Back</button>;

  if (state.status === 'loading') return <>{backLink}<Skeleton /></>;
  if (state.status === 'error') return <>{backLink}<div className="scd-state" role="alert"><h2>We couldn&rsquo;t load this challenge</h2><p>{state.message}</p><button className="sp-button sp-button-secondary" onClick={load}>Retry</button></div></>;
  if (state.status === 'missing') return <>{backLink}<div className="scd-state"><h2>Challenge not found</h2><p>It may have been closed by the company or was never published.</p>
    {application && <button className="sp-button sp-button-primary" onClick={() => go(`/student/applications/${encodeURIComponent(application.id)}`)}>Open my application</button>}
    <button className="sp-button sp-button-secondary" onClick={() => go('/student/challenges')}>Browse open challenges</button></div></>;

  const { challenge } = state;
  const opens = Date.parse(challenge.applicationOpensAt);
  const closes = Date.parse(challenge.applicationClosesAt);
  const owned = new Set((profile?.skills || []).map(skill => skill.toLowerCase()));
  const skills = challenge.requiredSkills || [];
  const have = skills.filter(skill => owned.has(skill.toLowerCase())).length;

  let bar;
  if (application) bar = { text: 'You applied to this challenge.', button: <button className="sp-button sp-button-primary" onClick={() => go(`/student/applications/${encodeURIComponent(application.id)}`)}>Already applied — open my application</button> };
  else if (now < opens) bar = { text: 'This challenge isn’t accepting applications yet.', button: <button className="sp-button sp-button-primary" disabled>Applications open on {fmt(opens)}</button> };
  else if (now > closes) bar = { text: 'The application window has ended.', button: <button className="sp-button sp-button-primary" disabled>Applications closed</button> };
  else if (!profileLoading && !profileReady(profile)) bar = { text: 'Add your name, college, degree and at least one skill so companies can review you.', button: <><button className="sp-button sp-button-primary" disabled>Complete your profile first</button><button className="sp-link-button" onClick={() => go('/student/profile')}>Go to my profile</button></> };
  else bar = { text: `You’ll have ${challenge.individualTaskDurationDays} days to finish once you apply.`, button: <button className="sp-button sp-button-primary" disabled={profileLoading} onClick={() => { setApplyError(''); setConfirming(true); }}>Apply now</button> };

  async function apply() {
    setBusy(true); setApplyError('');
    try {
      const { application: created } = await studentApi.apply(challenge.id);
      setApplication({ ...created, roleTitle: challenge.roleTitle });
      setConfirming(false);
      notify?.('success', 'Application recorded. Your task clock has started.');
    } catch (error) { setApplyError(error.message || 'The application could not be submitted.'); }
    finally { setBusy(false); }
  }

  return <div className="scd">
    {backLink}
    <header className="scd-header">
      <h1>{challenge.roleTitle}</h1>
      <div className="scd-meta">
        <span className="scd-avatar" aria-hidden="true">{(challenge.companyName || 'C').charAt(0).toUpperCase()}</span>
        <span className="scd-company">{challenge.companyName || 'Company unavailable'}</span>
        <StatusPill tone={challenge.isPaid ? 'success' : 'neutral'}>{challenge.isPaid ? 'Paid' : 'Unpaid'}</StatusPill>
        <StatusPill tone="neutral">{challenge.status === 'PUBLISHED' ? 'Open' : challenge.status.charAt(0) + challenge.status.slice(1).toLowerCase()}</StatusPill>
      </div>
    </header>
    <div className="scd-grid">
      <main className="scd-main">
        <section className="scd-card"><h2>Task description</h2><p className="scd-prewrap">{challenge.taskDescription}</p></section>
        {(challenge.extraInformation || challenge.language || challenge.reference) && <section className="scd-card"><h2>Requirements and extras</h2>
          {challenge.extraInformation && <p className="scd-prewrap">{challenge.extraInformation}</p>}
          {challenge.language && <p><span className="scd-label">Language</span> {challenge.language}</p>}
          {challenge.reference && (/^https?:\/\//i.test(challenge.reference)
            ? <p><span className="scd-label">Reference</span> <a href={challenge.reference} target="_blank" rel="noopener noreferrer">{challenge.reference}</a></p>
            : <p><span className="scd-label">Reference</span> <span className="scd-prewrap">{challenge.reference}</span></p>)}
        </section>}
      </main>
      <aside className="scd-side">
        <section className="scd-card"><h2>Key facts</h2>
          <dl className="scd-facts">
            <div><dt>Application window</dt><dd className="scd-num">{fmt(opens)} to {fmt(closes)}</dd><dd className="scd-helper">Times shown in {tz}</dd>{now <= closes && <dd className="scd-countdown scd-num">{now < opens ? `Opens in ${Math.ceil((opens - now) / DAY)} day(s)` : countdown(closes, now)}</dd>}</div>
            <div><dt>Task duration</dt><dd className="scd-num">{challenge.individualTaskDurationDays} days after you apply</dd></div>
            <div><dt>Compensation</dt><dd>{challenge.isPaid ? challenge.compensationDetails || 'Paid — details not shared' : 'Unpaid'}</dd></div>
            <div><dt>Candidates needed</dt><dd className="scd-num">{challenge.candidateCount ?? '—'}</dd></div>
          </dl>
        </section>
        <section className="scd-card"><h2>Required skills</h2>
          {skills.length ? <><p className="scd-helper">You have {have} of {skills.length} skills</p>
            <ul className="scd-chips">{skills.map(skill => { const mine = owned.has(skill.toLowerCase()); return <li key={skill} className={mine ? 'is-match' : ''}>{mine && <span aria-hidden="true">✓ </span>}{skill}{mine && <span className="scd-sr"> (on your profile)</span>}</li>; })}</ul></>
            : <p className="scd-helper">No specific skills were listed.</p>}
        </section>
      </aside>
    </div>
    <div className="scd-bar" role="region" aria-label="Apply">
      <p>{bar.text}</p><div className="scd-bar-actions">{bar.button}</div>
    </div>
    {confirming && <ConfirmDialog challenge={challenge} busy={busy} error={applyError} onConfirm={apply} onCancel={() => setConfirming(false)} />}
  </div>;
}
