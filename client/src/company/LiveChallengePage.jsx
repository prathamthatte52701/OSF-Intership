import React, { useEffect, useState } from 'react';
import { companyApi } from './companyApi.js';

const FILTERS = ['All', 'Draft', 'Published', 'Closed'];
const STATUS_LABEL = { DRAFT: 'DRAFT', PUBLISHED: 'PUBLISHED', CLOSED: 'CLOSED' };

function errorMessage(error) {
  return error?.message || 'The request could not be completed.';
}

function fmtLocal(iso) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch {
    return '—';
  }
}

function PublishCloseConfirm({ action, onConfirm, onCancel }) {
  const text = action === 'publish'
    ? 'Publishing makes this challenge visible to students.'
    : 'Closing stops new applications. Students who already applied can still submit until their own deadline.';
  return (
    <div className="confirm-dialog-overlay" role="dialog" aria-modal="true">
      <div className="confirm-dialog">
        <p>{text}</p>
        <div className="confirm-dialog-actions">
          <button className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button className="btn btn-primary btn-sm" onClick={onConfirm}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

export default function LiveChallengePage({ go }) {
  const [challenges, setChallenges] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [busyId, setBusyId] = useState(null);
  const [rowErrors, setRowErrors] = useState({});
  const [confirmState, setConfirmState] = useState(null);
  const [toast, setToast] = useState('');

  function load() {
    setError('');
    setChallenges(null);
    companyApi.challenges()
      .then(result => setChallenges(result.challenges))
      .catch(err => {
        if (err.status === 401) { go('/login'); return; }
        setError(errorMessage(err));
      });
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);

  function updateRow(id, patch) {
    setChallenges(current => current.map(item => (item.id === id ? { ...item, ...patch } : item)));
  }

  async function runAction(id, action) {
    setBusyId(id);
    setRowErrors(current => ({ ...current, [id]: '' }));
    try {
      const result = action === 'publish' ? await companyApi.publishChallenge(id) : await companyApi.closeChallenge(id);
      if (action === 'publish') updateRow(id, result.challenge);
      else updateRow(id, { status: 'CLOSED' });
      setToast(action === 'publish' ? 'Challenge published.' : 'Challenge closed.');
    } catch (err) {
      if (err.status === 401) { go('/login'); return; }
      setRowErrors(current => ({ ...current, [id]: errorMessage(err) }));
    } finally {
      setBusyId(null);
      setConfirmState(null);
    }
  }

  if (error) {
    return (
      <div className="dash-card">
        <div className="empty-state-box">
          <strong>{error}</strong>
          <button className="btn btn-outline btn-sm" onClick={load} style={{ marginTop: '12px' }}>Retry</button>
        </div>
      </div>
    );
  }

  if (!challenges) {
    return (
      <div className="dash-card">
        <div className="empty-state-box">
          <span className="loading-spinner" />
          <strong>Loading challenges…</strong>
        </div>
      </div>
    );
  }

  const counts = {
    All: challenges.length,
    Draft: challenges.filter(c => c.status === 'DRAFT').length,
    Published: challenges.filter(c => c.status === 'PUBLISHED').length,
    Closed: challenges.filter(c => c.status === 'CLOSED').length,
  };
  const visible = filter === 'All' ? challenges : challenges.filter(c => c.status === filter.toUpperCase());

  return (
    <div>
      <div className="dash-card-header" style={{ marginBottom: '16px' }}>
        <div>
          <h3>Live Challenge</h3>
          <p>Manage the roles you publish for student applicants</p>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => go('/dashboard/challenges/new')}>New challenge</button>
      </div>

      <div className="challenge-filter-tabs">
        {FILTERS.map(name => (
          <button
            key={name}
            className={`challenge-filter-tab ${filter === name ? 'active' : ''}`}
            onClick={() => setFilter(name)}
          >
            {name} <span>{counts[name]}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="dash-card">
          <div className="empty-state-box">
            <strong>No challenges yet</strong>
            <p>Create your first challenge to start receiving applications.</p>
            <button className="btn btn-primary btn-sm" onClick={() => go('/dashboard/challenges/new')} style={{ marginTop: '12px' }}>
              Create your first challenge
            </button>
          </div>
        </div>
      ) : (
        <>
          <table className="challenge-table dash-desktop-only">
            <thead>
              <tr>
                <th>Role</th>
                <th>Status</th>
                <th>Application window</th>
                <th>Task days</th>
                <th>Paid</th>
                <th>Skills</th>
                <th>Applicants</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visible.map(challenge => (
                <ChallengeRow
                  key={challenge.id}
                  challenge={challenge}
                  busy={busyId === challenge.id}
                  error={rowErrors[challenge.id]}
                  go={go}
                  onPublish={() => setConfirmState({ id: challenge.id, action: 'publish' })}
                  onClose={() => setConfirmState({ id: challenge.id, action: 'close' })}
                />
              ))}
            </tbody>
          </table>

          <div className="challenge-card-list dash-mobile-only">
            {visible.map(challenge => (
              <ChallengeCard
                key={challenge.id}
                challenge={challenge}
                busy={busyId === challenge.id}
                error={rowErrors[challenge.id]}
                go={go}
                onPublish={() => setConfirmState({ id: challenge.id, action: 'publish' })}
                onClose={() => setConfirmState({ id: challenge.id, action: 'close' })}
              />
            ))}
          </div>
        </>
      )}

      {confirmState && (
        <PublishCloseConfirm
          action={confirmState.action}
          onCancel={() => setConfirmState(null)}
          onConfirm={() => runAction(confirmState.id, confirmState.action)}
        />
      )}

      {toast && (
        <div className="toast-container">
          <div className="toast toast-success" role="status">{toast}</div>
        </div>
      )}
    </div>
  );
}

function ChallengeMeta({ challenge }) {
  return (
    <>
      <div className="challenge-window">
        {fmtLocal(challenge.applicationOpensAt)} → {fmtLocal(challenge.applicationClosesAt)}
      </div>
      <div className="challenge-skills-chips">
        {(challenge.requiredSkills || []).map(skill => (
          <span key={skill} className="chip">{skill}</span>
        ))}
      </div>
    </>
  );
}

function RowActions({ challenge, busy, go, onPublish, onClose }) {
  if (challenge.status === 'DRAFT') {
    return (
      <>
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={() => go(`/dashboard/challenges/${encodeURIComponent(challenge.id)}/edit`)}>Edit</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={onPublish}>Publish</button>
      </>
    );
  }
  if (challenge.status === 'PUBLISHED') {
    return <button className="btn btn-outline btn-sm" disabled={busy} onClick={onClose}>Close</button>;
  }
  return <span className="data-table-value">No actions</span>;
}

function ChallengeRow({ challenge, busy, error, go, onPublish, onClose }) {
  return (
    <tr>
      <td>{challenge.roleTitle}</td>
      <td><span className={`status-pill ${challenge.status === 'PUBLISHED' ? 'success' : challenge.status === 'CLOSED' ? 'warning' : ''}`}>{STATUS_LABEL[challenge.status]}</span></td>
      <td><ChallengeMeta challenge={challenge} /></td>
      <td>{challenge.individualTaskDurationDays}</td>
      <td>{challenge.isPaid ? 'Paid' : 'Unpaid'}</td>
      <td className="challenge-skills-cell">{(challenge.requiredSkills || []).map(skill => <span key={skill} className="chip">{skill}</span>)}</td>
      <td>{challenge.applicationCount ?? 0}</td>
      <td>
        <div className="challenge-row-actions">
          <RowActions challenge={challenge} busy={busy} go={go} onPublish={onPublish} onClose={onClose} />
        </div>
        {error && <div className="challenge-row-error">{error}</div>}
      </td>
    </tr>
  );
}

function ChallengeCard({ challenge, busy, error, go, onPublish, onClose }) {
  return (
    <div className="dash-card challenge-card">
      <div className="dash-card-header">
        <div>
          <h3>{challenge.roleTitle}</h3>
          <span className={`status-pill ${challenge.status === 'PUBLISHED' ? 'success' : challenge.status === 'CLOSED' ? 'warning' : ''}`}>{STATUS_LABEL[challenge.status]}</span>
        </div>
      </div>
      <ChallengeMeta challenge={challenge} />
      <div className="data-table-rows">
        <div className="data-table-row"><span className="data-table-label">Task days</span><span className="data-table-value">{challenge.individualTaskDurationDays}</span></div>
        <div className="data-table-row"><span className="data-table-label">Compensation</span><span className="data-table-value">{challenge.isPaid ? 'Paid' : 'Unpaid'}</span></div>
        <div className="data-table-row"><span className="data-table-label">Applicants</span><span className="data-table-value">{challenge.applicationCount ?? 0}</span></div>
      </div>
      <div className="challenge-row-actions">
        <RowActions challenge={challenge} busy={busy} go={go} onPublish={onPublish} onClose={onClose} />
      </div>
      {error && <div className="challenge-row-error">{error}</div>}
    </div>
  );
}
