import React, { useEffect, useState } from 'react';
import { companyApi } from './companyApi.js';
import { Skeleton, ErrorState, fmtDate, errMsg, OPTION_KEYS } from './SkillShared.jsx';

export function AttemptsList({ go, assessmentId }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const load = () => {
    setError(''); setRows(null);
    companyApi.assessmentAttempts(assessmentId).then(r => setRows(r.attempts)).catch(e => { if (e.status === 401) return go('/login'); setError(errMsg(e)); });
  };
  useEffect(load, [assessmentId]);
  const back = <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/skills')}>Back to assessments</button>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!rows) return <Skeleton />;
  return (
    <div>
      <div className="cp-page-header"><div><h2>Attempts</h2><p>{rows.length} student{rows.length === 1 ? '' : 's'} attempted this assessment.</p></div>{back}</div>
      {rows.length === 0 ? (
        <div className="cp-card"><div className="cp-empty-state"><strong>No attempts yet</strong><p>Attempts appear here once students start the assessment.</p></div></div>
      ) : (
        <div className="cp-card" style={{ overflowX: 'auto' }}>
          <table className="cp-table">
            <thead><tr><th>Student</th><th>Status</th><th>Submitted</th><th>Review</th><th /></tr></thead>
            <tbody>
              {rows.map(a => (
                <tr key={a.id}>
                  <td>{a.fullName}<div className="cp-muted">{a.college}</div></td>
                  <td>{a.status}</td>
                  <td>{fmtDate(a.submittedAt)}</td>
                  <td><span className={`status-pill ${a.reviewStatus === 'REVIEWED' ? 'success' : 'neutral'}`}>{a.reviewStatus}</span></td>
                  <td><button className="btn btn-outline btn-sm" onClick={() => go(`/dashboard/skills/${encodeURIComponent(assessmentId)}/attempts/${encodeURIComponent(a.id)}`)}>Open</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function AttemptDetail({ go, assessmentId, attemptId }) {
  const [attempt, setAttempt] = useState(null);
  const [error, setError] = useState('');
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [formErr, setFormErr] = useState('');
  const load = () => {
    setError(''); setAttempt(null);
    companyApi.assessmentAttempt(attemptId).then(r => {
      setAttempt(r.attempt); setScore(r.attempt.manualScore ?? ''); setFeedback(r.attempt.companyFeedback || '');
    }).catch(e => { if (e.status === 401) return go('/login'); setError(errMsg(e)); });
  };
  useEffect(load, [attemptId]);
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!attempt) return <Skeleton />;

  const submitted = !!attempt.submittedAt;
  const correct = attempt.questions.filter(q => q.selectedOption === q.correctAnswer).length;

  async function save() {
    setFormErr(''); setMsg('');
    const n = score === '' ? null : Number(score);
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 100)) return setFormErr('Score must be between 0 and 100.');
    setSaving(true);
    try {
      const r = await companyApi.evaluateAttempt(attemptId, { manualScore: n, companyFeedback: feedback.trim() });
      setAttempt(c => ({ ...c, ...r.attempt, questions: c.questions })); setMsg('Review saved.');
    } catch (e) { setFormErr(errMsg(e)); }
    setSaving(false);
  }

  return (
    <div>
      <div className="cp-page-header">
        <div><h2>{attempt.fullName}</h2>
          <p>{attempt.college} · {submitted ? `Submitted ${fmtDate(attempt.submittedAt)}` : 'Not submitted yet'} · {correct} of {attempt.questions.length} correct</p></div>
        <button className="btn btn-outline btn-sm" onClick={() => go(`/dashboard/skills/${encodeURIComponent(assessmentId)}/attempts`)}>Back to attempts</button>
      </div>
      <ol className="cp-question-list">
        {attempt.questions.map(q => (
          <li key={q.id} className="cp-card cp-question-item">
            <p className="cp-question-text">{q.questionText}</p>
            <ul className="cp-option-list">
              {OPTION_KEYS.map(k => {
                const chosen = q.selectedOption === k; const right = q.correctAnswer === k;
                return <li key={k} className={right ? 'correct' : chosen ? 'wrong' : ''}>{k}. {q[`option${k}`]}{chosen && ' (student answer)'}{right && ' (correct)'}</li>;
              })}
            </ul>
            {!q.selectedOption && <p className="cp-muted">No answer given.</p>}
          </li>
        ))}
      </ol>
      <div className="cp-card" style={{ marginTop: 24 }}>
        <h3 className="cp-card-title">Your review</h3>
        {!submitted && <p className="cp-muted">You can review this attempt once the student submits it.</p>}
        {formErr && <div className="cp-alert cp-alert-error" role="alert">{formErr}</div>}
        {msg && <div className="cp-alert" role="status">{msg}</div>}
        <label className="cp-field"><span>Score (0 to 100, optional)</span>
          <input type="number" min="0" max="100" value={score} disabled={!submitted} onChange={e => setScore(e.target.value)} /></label>
        <label className="cp-field"><span>Feedback for the student (optional)</span>
          <textarea value={feedback} maxLength={5000} disabled={!submitted} onChange={e => setFeedback(e.target.value)} /></label>
        <button className="btn btn-primary btn-sm" disabled={!submitted || saving} onClick={save}>{saving ? 'Saving...' : 'Save review'}</button>
      </div>
    </div>
  );
}
