import React, { useEffect, useState } from 'react';
import { companyApi } from './companyApi.js';
import { Skeleton, ErrorState, ConfirmDialog, PUBLISH_TEXT, CLOSE_TEXT, fmtDate, errMsg, publishBlocker } from './SkillShared.jsx';

const FILTERS = ['All', 'Draft', 'Published', 'Closed'];
const pill = s => (s === 'PUBLISHED' ? 'success' : 'neutral');
const duration = m => (m ? `${m} min` : 'No limit');

export default function SkillVerificationPage({ go }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('All');
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [rowError, setRowError] = useState({});
  const [toast, setToast] = useState('');

  function load() {
    setError(''); setItems(null);
    companyApi.assessments().then(r => setItems(r.assessments)).catch(e => {
      if (e.status === 401) return go('/login');
      setError(errMsg(e));
    });
  }
  useEffect(load, []);
  useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  async function run() {
    const { id, action } = confirm;
    setBusy(true); setRowError(c => ({ ...c, [id]: '' }));
    try {
      if (action === 'publish') {
        const r = await companyApi.publishAssessment(id);
        setItems(c => c.map(a => (a.id === id ? { ...a, ...r.assessment } : a)));
      } else {
        await companyApi.closeAssessment(id);
        setItems(c => c.map(a => (a.id === id ? { ...a, status: 'CLOSED' } : a)));
      }
      setToast(action === 'publish' ? 'Assessment published.' : 'Assessment closed.');
    } catch (e) {
      if (e.status === 401) return go('/login');
      setRowError(c => ({ ...c, [id]: errMsg(e) }));
    } finally { setBusy(false); setConfirm(null); }
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!items) return <Skeleton />;

  if (!items.length) {
    return (
      <div className="cp-card"><div className="cp-empty-state">
        <strong>No skill assessments yet</strong>
        <p>Verify what candidates actually know with a short multiple-choice test.</p>
        <button className="btn btn-primary btn-sm" onClick={() => go('/dashboard/skills/new')}>Create your first skill assessment</button>
      </div></div>
    );
  }

  const count = f => (f === 'All' ? items.length : items.filter(a => a.status === f.toUpperCase()).length);
  const visible = filter === 'All' ? items : items.filter(a => a.status === filter.toUpperCase());

  return (
    <div>
      <div className="challenge-filter-tabs">
        {FILTERS.map(f => (
          <button key={f} className={`challenge-filter-tab ${filter === f ? 'active' : ''}`} onClick={() => setFilter(f)}>
            {f} <span>{count(f)}</span>
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="cp-card"><div className="cp-empty-state"><strong>No {filter.toLowerCase()} assessments</strong><p>Pick another tab to see your other assessments.</p></div></div>
      ) : (
        <div className="cp-skill-list">
          {visible.map(a => (
            <div key={a.id} className="cp-card cp-skill-row">
              <div className="cp-skill-main">
                <h3 className="cp-skill-title">{a.title}</h3>
                <div className="cp-skill-meta tabular-nums">
                  <span className={`status-pill ${pill(a.status)}`}>{a.status}</span>
                  <span>{a.questions.length} questions</span>
                  <span>{duration(a.durationMinutes)}</span>
                  <span>{a.attemptCount} attempts</span>
                  <span>Created {fmtDate(a.createdAt)}</span>
                </div>
                {rowError[a.id] && <div className="cp-alert cp-alert-error" style={{ marginTop: 12, marginBottom: 0 }}>{rowError[a.id]}</div>}
              </div>
              <div className="cp-button-row">
                {a.status === 'DRAFT' && <button className="btn btn-outline btn-sm" onClick={() => go(`/dashboard/skills/${encodeURIComponent(a.id)}/edit`)}>Edit</button>}
                {a.status === 'DRAFT' && (
                  <button className="btn btn-outline btn-sm" disabled={!!publishBlocker(a.questions)} title={publishBlocker(a.questions) || undefined}
                    onClick={() => setConfirm({ id: a.id, action: 'publish' })}>Publish</button>
                )}
                {a.status === 'PUBLISHED' && <button className="btn btn-outline btn-sm" onClick={() => setConfirm({ id: a.id, action: 'close' })}>Close</button>}
                <button className="btn btn-outline btn-sm" onClick={() => go(`/dashboard/skills/${encodeURIComponent(a.id)}/attempts`)}>View attempts</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.action === 'publish' ? 'Publish this assessment?' : 'Close this assessment?'}
          text={confirm.action === 'publish' ? PUBLISH_TEXT : CLOSE_TEXT}
          confirmLabel={confirm.action === 'publish' ? 'Publish assessment' : 'Close assessment'}
          busy={busy} onConfirm={run} onCancel={() => setConfirm(null)} />
      )}
      {toast && <div className="toast-container"><div className="toast toast-success" role="status">{toast}</div></div>}
    </div>
  );
}
