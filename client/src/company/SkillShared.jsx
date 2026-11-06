import React, { useEffect, useRef } from 'react';
import './skills.css';

export const fmtDate = iso => {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)); } catch { return '—'; }
};
export const errMsg = e => e?.message || 'The request could not be completed.';
export const OPTION_KEYS = ['A', 'B', 'C', 'D'];

export function Skeleton() {
  return <div className="cp-card"><div className="skeleton-rows"><div className="skeleton-row" /><div className="skeleton-row" /><div className="skeleton-row" /></div></div>;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="cp-card"><div className="cp-empty-state">
      <strong>{message}</strong>
      <button className="btn btn-outline btn-sm" onClick={onRetry} style={{ marginTop: 16 }}>Retry</button>
    </div></div>
  );
}

export function ConfirmDialog({ title, text, confirmLabel, busy, onConfirm, onCancel }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.focus();
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="confirm-dialog-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <div className="confirm-dialog">
        <strong>{title}</strong>
        <p>{text}</p>
        <div className="confirm-dialog-actions">
          <button className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
          <button ref={ref} className="btn btn-primary btn-sm" onClick={onConfirm} disabled={busy}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

export const PUBLISH_TEXT = 'Publishing makes this assessment available to every student immediately and locks it: title, duration and questions can no longer be edited.';
export const CLOSE_TEXT = 'Closing stops new attempts right away. Students who already started can still finish and submit, and you can still review all attempts.';

export function publishBlocker(questions) {
  if (!questions.length) return 'Add at least one question before publishing.';
  if (questions.some(q => !OPTION_KEYS.includes(q.correctAnswer))) return 'Every question needs a correct answer marked.';
  return '';
}
