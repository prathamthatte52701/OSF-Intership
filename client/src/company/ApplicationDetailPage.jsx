import React, { useEffect, useState } from 'react';
import { companyApi } from './companyApi.js';
import { Crumbs, Skeleton, LoadError, StatusPill, fmtDate, loadFailure } from './applicantsShared.jsx';

const FEEDBACK_MAX = 5000; // matches server optionalText limit for evaluation feedback

function fmtSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  return bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function ApplicationDetailPage({ go, applicationId }) {
  const [data, setData] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [error, setError] = useState('');
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [shortlisted, setShortlisted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState({ kind: '', text: '' });

  function load() {
    setError(''); setData(null);
    companyApi.application(applicationId)
      .then(async ({ application }) => {
        const [sub, list] = await Promise.all([companyApi.submission(applicationId), companyApi.challenges()]);
        setChallenge(list.challenges.find(c => c.id === application.challengeId) || null);
        const ev = application.evaluation;
        setRating(ev?.rating || 0); setFeedback(ev?.feedback || ''); setShortlisted(Boolean(ev?.isShortlisted));
        setData({ application, submission: sub.submission });
      })
      .catch(err => loadFailure(err, go, setError));
  }
  useEffect(load, [applicationId]);

  const listPath = data ? `/dashboard/challenges/${encodeURIComponent(data.application.challengeId)}/applicants` : '/dashboard/challenges';
  if (error) return <div><Crumbs items={[{ label: 'Live Challenge', to: '/dashboard/challenges' }, { label: 'Application' }]} go={go} /><LoadError message={error} onRetry={load} go={go} backTo="/dashboard/challenges" backLabel="Back to challenges" /></div>;
  if (!data) return <div><Crumbs items={[{ label: 'Live Challenge', to: '/dashboard/challenges' }, { label: 'Application' }]} go={go} /><Skeleton /></div>;

  const { application, submission } = data;
  const student = application.student;
  const canEvaluate = application.status === 'SUBMITTED' && Boolean(submission?.submittedAt);
  const evaluation = application.evaluation;

  async function save(event) {
    event.preventDefault();
    setSaving(true); setSaveMsg({ kind: '', text: '' });
    try {
      const result = await companyApi.evaluate(application.id, { rating: rating || null, feedback, isShortlisted: shortlisted });
      setData(current => ({ ...current, application: { ...current.application, evaluation: result.evaluation } }));
      setSaveMsg({ kind: 'ok', text: 'Evaluation saved.' });
    } catch (err) {
      if (err.status === 401) { go('/login'); return; }
      setSaveMsg({ kind: 'error', text: err.message });
    } finally { setSaving(false); }
  }

  return (
    <div>
      <Crumbs go={go} items={[
        { label: 'Live Challenge', to: '/dashboard/challenges' },
        { label: challenge?.roleTitle || 'Challenge', to: listPath },
        { label: student.fullName }]} />
      <div className="ap-head">
        <h2 className="ap-title">{student.fullName}</h2>
        <p className="ap-sub">Applied to {challenge?.roleTitle || 'this challenge'} <StatusPill status={application.status} /></p>
      </div>

      <div className="ap-grid">
        <div className="ap-stack">
          <section className="cp-card" aria-labelledby="tl-h">
            <h3 className="cp-card-title" id="tl-h">Timeline</h3>
            <ul className="ap-timeline tabular-nums">
              <li><span>Applied and started</span><span>{fmtDate(application.appliedAt, true)}</span></li>
              <li><span>Individual deadline</span><span>{fmtDate(application.individualDeadline, true)}</span></li>
              {application.status === 'SUBMITTED' && <li><span>Submitted</span><span>{fmtDate(submission?.submittedAt, true)}</span></li>}
              {application.status === 'EXPIRED' && <li><span>Expired without submission</span><span>{fmtDate(application.individualDeadline, true)}</span></li>}
            </ul>
          </section>

          <section className="cp-card" aria-labelledby="sub-h">
            <h3 className="cp-card-title" id="sub-h">Submission</h3>
            {!submission ? (
              <p className="ap-sub">{application.status === 'EXPIRED' ? 'The deadline passed without a submission.' : 'Nothing submitted yet. The student is still working on the task.'}</p>
            ) : (
              <div className="cp-view-rows" style={{ marginTop: 0, paddingTop: 0 }}>
                {submission.supportingInformation && <div className="cp-view-row"><span>Notes</span><p className="ap-text">{submission.supportingInformation}</p></div>}
                {(submission.githubUrl || submission.deployedUrl) && (
                  <div className="cp-view-row"><span>Links</span>
                    <div className="ap-links">
                      {submission.githubUrl && <a href={submission.githubUrl} target="_blank" rel="noopener noreferrer">Repository</a>}
                      {submission.deployedUrl && <a href={submission.deployedUrl} target="_blank" rel="noopener noreferrer">Deployed site</a>}
                    </div></div>
                )}
                {submission.file && (
                  <div className="cp-view-row"><span>File</span>
                    <a className="btn btn-outline btn-sm" href={`/api/company/applications/${encodeURIComponent(application.id)}/file`} download>
                      Download {submission.file.name} <span className="tabular-nums">({fmtSize(submission.file.sizeBytes)})</span>
                    </a></div>
                )}
              </div>
            )}
          </section>

          <form className="cp-card" onSubmit={save} aria-labelledby="ev-h">
            <h3 className="cp-card-title" id="ev-h">Evaluation</h3>
            {!canEvaluate && <div className="cp-alert">You can evaluate this application once the student submits their work.</div>}
            {saveMsg.kind === 'error' && <div className="cp-alert cp-alert-error" role="alert">{saveMsg.text}</div>}
            <div className="cp-field">
              <span id="rating-l">Rating</span>
              <div className="ap-stars" role="radiogroup" aria-labelledby="rating-l">
                {[1, 2, 3, 4, 5].map(n => (
                  <button key={n} type="button" role="radio" aria-checked={rating === n} aria-label={`${n} star${n === 1 ? '' : 's'}`}
                    className={n <= rating ? 'on' : ''} disabled={!canEvaluate || saving} onClick={() => setRating(rating === n ? 0 : n)}>{n <= rating ? '★' : '☆'}</button>
                ))}
              </div>
            </div>
            <label className="cp-field"><span>Feedback</span>
              <textarea rows={5} maxLength={FEEDBACK_MAX} value={feedback} disabled={!canEvaluate || saving} onChange={e => setFeedback(e.target.value)} />
              <small className="tabular-nums">{feedback.length} / {FEEDBACK_MAX}</small>
            </label>
            <label className="cp-field-checkbox"><input type="checkbox" checked={shortlisted} disabled={!canEvaluate || saving} onChange={e => setShortlisted(e.target.checked)} /> Shortlist this student</label>
            <div className="cp-button-row" style={{ marginTop: 16, alignItems: 'center' }}>
              <button type="submit" className="btn btn-primary btn-sm" disabled={!canEvaluate || saving}>{saving ? 'Saving…' : evaluation ? 'Update evaluation' : 'Save evaluation'}</button>
              {saveMsg.kind === 'ok' && <span className="ap-saved-note" role="status">{saveMsg.text}</span>}
              {evaluation && saveMsg.kind !== 'ok' && <span className="ap-saved-note">Last saved {fmtDate(evaluation.evaluatedAt, true)}</span>}
            </div>
          </form>
        </div>

        <aside className="cp-card" aria-labelledby="st-h">
          <h3 className="cp-card-title" id="st-h">Student</h3>
          <div className="ap-person" style={{ marginBottom: 16 }}>
            <span className="ap-avatar" aria-hidden="true">{(student.fullName || '?').charAt(0).toUpperCase()}</span>
            <div><strong>{student.fullName}</strong><div className="ap-sub">{student.college || 'College not provided'}</div></div>
          </div>
          <div className="challenge-skills-chips" style={{ marginBottom: 16 }}>{(student.skills || []).map(s => <span key={s} className="chip">{s}</span>)}</div>
          <div className="cp-button-row">
            <button type="button" className="btn btn-primary btn-sm" onClick={() => go(`/dashboard/students/${encodeURIComponent(student.id)}`)}>View full profile</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => go(listPath)}>Back to applicants</button>
          </div>
        </aside>
      </div>
    </div>
  );
}
