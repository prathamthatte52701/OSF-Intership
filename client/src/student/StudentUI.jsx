import React from 'react';

const paths = {
  dashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  user: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  search: 'm21 21-4.3-4.3 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  briefcase: 'M3 8h18v12H3z M8 8V5h8v3 M3 13h18 M10 13v2h4v-2',
  medal: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z M8 14l-1 8 5-3 5 3-1-8',
  settings: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.8 3.1-.2-.1a1.7 1.7 0 0 0-1.9.3l-.1.1h-3.6l-.1-.2a1.7 1.7 0 0 0-1.6-1.1 1.7 1.7 0 0 0-.9.3l-.2.1-3.1-1.8.1-.2a1.7 1.7 0 0 0-.3-1.9l-.1-.1v-3.6l.2-.1a1.7 1.7 0 0 0 1.1-1.6 1.7 1.7 0 0 0-.3-.9l-.1-.2 1.8-3.1.2.1a1.7 1.7 0 0 0 1.9-.3l.1-.1h3.6l.1.2a1.7 1.7 0 0 0 1.6 1.1 1.7 1.7 0 0 0 .9-.3l.2-.1 3.1 1.8-.1.2a1.7 1.7 0 0 0 .3 1.9l.1.1V15Z',
  logout: 'M10 17l5-5-5-5 M15 12H3 M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6',
  arrow: 'M5 12h14 M12 5l7 7-7 7',
  chevron: 'M9 6l6 6-6 6',
  clock: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  file: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h8',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14 M5 12h14',
};

export function StudentIcon({ name, size = 18 }) {
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name] || paths.dashboard} /></svg>;
}

export function PageTitle({ eyebrow, title, description, action }) {
  return <div className="sp-page-title"><div><span className="sp-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action && <div className="sp-title-action">{action}</div>}</div>;
}

export function StateBlock({ title, children, tone = 'muted', action }) {
  return <div className={`sp-state sp-state-${tone}`} role={tone === 'error' ? 'alert' : 'status'}><span className="sp-state-mark">{tone === 'error' ? '!' : '•'}</span><div><strong>{title}</strong>{children && <p>{children}</p>}{action && <div className="sp-state-action">{action}</div>}</div></div>;
}

export function LoadingState({ label = 'Loading your workspace…' }) {
  return <div className="sp-loading" role="status"><span className="sp-spinner" />{label}</div>;
}

export function StatusPill({ children, tone = 'neutral' }) {
  return <span className={`sp-status sp-status-${tone}`}>{children}</span>;
}

export function formatDate(value, withTime = false) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

export function Field({ label, hint, error, className = '', as: Component = 'input', ...props }) {
  const id = props.id || `sp-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return <label className={`sp-field ${className}`} htmlFor={id}><span>{label}</span>{Component === 'textarea' ? <textarea id={id} {...props} /> : Component === 'select' ? <select id={id} {...props} /> : <input id={id} {...props} />}{hint && !error && <small>{hint}</small>}{error && <small className="sp-field-error">{error}</small>}</label>;
}

export function errorMessage(error) {
  if (error?.status === 401) return 'Your session expired. Sign in again to continue.';
  return error?.message || 'Something went wrong. Please try again.';
}
