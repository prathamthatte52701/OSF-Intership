import React from 'react';
import './applicants.css';

export const STATUS = {
  APPLIED: { label: 'Applied', tone: 'neutral' },
  IN_PROGRESS: { label: 'In progress', tone: 'warning' },
  SUBMITTED: { label: 'Submitted', tone: 'success' },
  EXPIRED: { label: 'Expired', tone: 'neutral' },
};

export function StatusPill({ status }) {
  const s = STATUS[status] || { label: status, tone: 'neutral' };
  return <span className={`status-pill ${s.tone}`}>{s.label}</span>;
}

export function fmtDate(iso, withTime = false) {
  if (!iso) return '—';
  try {
    return new Intl.DateTimeFormat('en-IN', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }).format(new Date(iso));
  } catch { return '—'; }
}

export function Crumbs({ items, go }) {
  return (
    <nav className="ap-crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {item.to ? <button type="button" onClick={() => go(item.to)}>{item.label}</button> : <span aria-current="page">{item.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Skeleton() {
  return (
    <div className="cp-card" aria-busy="true"><div className="skeleton-rows"><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /></div></div>
  );
}

export function LoadError({ message, onRetry, go, backTo, backLabel }) {
  return (
    <div className="cp-card"><div className="cp-empty-state">
      <strong>{message}</strong>
      <div className="cp-button-row" style={{ marginTop: 16 }}>
        {onRetry && <button type="button" className="btn btn-primary btn-sm" onClick={onRetry}>Retry</button>}
        <button type="button" className="btn btn-outline btn-sm" onClick={() => go(backTo)}>{backLabel}</button>
      </div>
    </div></div>
  );
}

export function loadFailure(err, go, setError) {
  if (err.status === 401) { go('/login'); return; }
  setError(err.status === 404 ? 'This item could not be found. It may have been removed.' : (err.message || 'The request could not be completed.'));
}
