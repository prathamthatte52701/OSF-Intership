import React, { useEffect, useMemo, useState } from 'react';
import { companyApi } from './companyApi.js';
import { Crumbs, Skeleton, LoadError, StatusPill, STATUS, fmtDate, loadFailure } from './applicantsShared.jsx';

const matchOf = (skills, required) => {
  const have = new Set((skills || []).map(s => s.toLowerCase()));
  return required.filter(s => have.has(s.toLowerCase())).length;
};

export default function ChallengeApplicantsPage({ go, challengeId }) {
  const [challenge, setChallenge] = useState(null);
  const [applicants, setApplicants] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('ALL');
  const [shortlistedOnly, setShortlistedOnly] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('match');

  function load() {
    setError(''); setApplicants(null);
    Promise.all([companyApi.challenges(), companyApi.applicants(challengeId)])
      .then(([c, a]) => {
        const found = c.challenges.find(item => item.id === challengeId);
        if (!found) { setError('This challenge could not be found. It may have been removed.'); return; }
        setChallenge(found); setApplicants(a.applications);
      })
      .catch(err => loadFailure(err, go, setError));
  }
  useEffect(load, [challengeId]);

  const required = challenge?.requiredSkills || [];
  const rows = useMemo(() => {
    if (!applicants) return [];
    const q = query.trim().toLowerCase();
    return applicants
      .filter(a => (status === 'ALL' || a.status === status) && (!shortlistedOnly || a.isShortlisted)
        && (!q || `${a.fullName} ${a.college || ''}`.toLowerCase().includes(q)))
      .map(a => ({ ...a, match: matchOf(a.skills, required) }))
      .sort((a, b) => (sort === 'match' ? b.match - a.match : 0) || Date.parse(b.appliedAt) - Date.parse(a.appliedAt));
  }, [applicants, status, shortlistedOnly, query, sort, required.join('|')]);

  const crumbs = [{ label: 'Live Challenge', to: '/dashboard/challenges' }, { label: 'Applicants' }];
  const back = { go, backTo: '/dashboard/challenges', backLabel: 'Back to challenges' };
  if (error) return <div><Crumbs items={crumbs} go={go} /><LoadError message={error} onRetry={load} {...back} /></div>;
  if (!applicants || !challenge) return <div><Crumbs items={crumbs} go={go} /><Skeleton /></div>;

  const counts = Object.keys(STATUS).map(key => [key, applicants.filter(a => a.status === key).length]);
  const open = a => go(`/dashboard/applications/${encodeURIComponent(a.id)}`);

  return (
    <div>
      <Crumbs items={crumbs} go={go} />
      <div className="ap-head">
        <h2 className="ap-title">{challenge.roleTitle}</h2>
        <p className="ap-sub tabular-nums">{applicants.length} applicant{applicants.length === 1 ? '' : 's'}. Review submitted work and shortlist the strongest candidates.</p>
        <div className="ap-counts">
          {counts.map(([key, n]) => <span key={key} className={`status-pill ${STATUS[key].tone}`}>{STATUS[key].label} <span className="tabular-nums">{n}</span></span>)}
        </div>
      </div>

      {applicants.length === 0 ? (
        <div className="cp-card"><div className="cp-empty-state">
          <strong>No applicants yet</strong>
          <p>{challenge.status === 'PUBLISHED' ? 'Students who apply will appear here.' : 'Publish this challenge so students can apply.'}</p>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => go('/dashboard/challenges')}>Back to challenges</button>
        </div></div>
      ) : (
        <>
          <div className="ap-toolbar">
            <label className="cp-field"><span>Search</span><input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Student name or college" /></label>
            <label className="cp-field"><span>Status</span>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="ALL">All statuses</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </label>
            <label className="cp-field"><span>Sort by</span>
              <select value={sort} onChange={e => setSort(e.target.value)}>
                <option value="match">Skill match</option>
                <option value="date">Applied date</option>
              </select>
            </label>
            <label className="cp-field-checkbox"><input type="checkbox" checked={shortlistedOnly} onChange={e => setShortlistedOnly(e.target.checked)} /> Shortlisted only</label>
          </div>

          {rows.length === 0 ? (
            <div className="cp-card"><div className="cp-empty-state">
              <strong>No applicants match these filters</strong>
              <button type="button" className="btn btn-outline btn-sm" style={{ marginTop: 16 }} onClick={() => { setQuery(''); setStatus('ALL'); setShortlistedOnly(false); }}>Clear filters</button>
            </div></div>
          ) : (
            <>
              <table className="challenge-table cp-table dash-desktop-only">
                <thead><tr><th>Student</th><th>College</th><th>Skills match</th><th>Status</th><th>Applied</th><th>Deadline</th><th>Submitted</th><th>Shortlisted</th></tr></thead>
                <tbody>
                  {rows.map(a => (
                    <tr key={a.id}>
                      <td><div className="ap-person"><span className="ap-avatar" aria-hidden="true">{(a.fullName || '?').charAt(0).toUpperCase()}</span>
                        <button type="button" className="ap-link" onClick={() => open(a)}>{a.fullName}</button></div></td>
                      <td>{a.college || '—'}</td>
                      <td className="tabular-nums">{a.match} of {required.length}</td>
                      <td><StatusPill status={a.status} /></td>
                      <td className="tabular-nums">{fmtDate(a.appliedAt)}</td>
                      <td className="tabular-nums">{fmtDate(a.individualDeadline)}</td>
                      <td className="tabular-nums">{fmtDate(a.submittedAt)}</td>
                      <td><span className={`ap-star ${a.isShortlisted ? 'on' : ''}`} aria-label={a.isShortlisted ? 'Shortlisted' : 'Not shortlisted'}>{a.isShortlisted ? '★' : '☆'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="challenge-card-list dash-mobile-only">
                {rows.map(a => (
                  <div key={a.id} className="dash-card challenge-card">
                    <div className="ap-person">
                      <span className="ap-avatar" aria-hidden="true">{(a.fullName || '?').charAt(0).toUpperCase()}</span>
                      <div><button type="button" className="ap-link" onClick={() => open(a)}>{a.fullName} {a.isShortlisted ? '★' : ''}</button>
                        <div className="ap-sub">{a.college || '—'}</div></div>
                    </div>
                    <div className="data-table-rows">
                      <div className="data-table-row"><span className="data-table-label">Status</span><StatusPill status={a.status} /></div>
                      <div className="data-table-row"><span className="data-table-label">Skills match</span><span className="data-table-value tabular-nums">{a.match} of {required.length}</span></div>
                      <div className="data-table-row"><span className="data-table-label">Applied</span><span className="data-table-value tabular-nums">{fmtDate(a.appliedAt)}</span></div>
                      <div className="data-table-row"><span className="data-table-label">Submitted</span><span className="data-table-value tabular-nums">{fmtDate(a.submittedAt)}</span></div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
