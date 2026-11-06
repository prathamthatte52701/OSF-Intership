import React, { useEffect, useState } from 'react';
import { companyApi } from './companyApi.js';
import { Crumbs, Skeleton, LoadError, StatusPill, fmtDate, loadFailure } from './applicantsShared.jsx';

function UnsaveConfirm({ name, onConfirm, onCancel, busy }) {
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);
  return (
    <div className="confirm-dialog-overlay" role="dialog" aria-modal="true">
      <div className="confirm-dialog">
        <p>Remove {name} from your saved students? Your note about them will be deleted. You can save them again later.</p>
        <div className="confirm-dialog-actions">
          <button type="button" className="btn btn-outline btn-sm" onClick={onCancel}>Cancel</button>
          <button type="button" autoFocus className="btn btn-primary btn-sm" disabled={busy} onClick={onConfirm}>Remove student</button>
        </div>
      </div>
    </div>
  );
}

/* Self-contained: pass studentId, go, and optionally crumbs (array of {label,to}) for the trail leading here. */
export default function CompanyStudentProfilePage({ go, studentId, crumbs, backTo = '/dashboard/challenges', backLabel = 'Back to challenges' }) {
  const [profile, setProfile] = useState(null);
  const [applications, setApplications] = useState([]);
  const [saved, setSaved] = useState(null); // null | { note }
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({ kind: '', text: '' });
  const [confirming, setConfirming] = useState(false);

  function load() {
    setError(''); setProfile(null);
    Promise.all([companyApi.talentProfile(studentId), companyApi.savedStudents(), companyApi.challenges()])
      .then(async ([p, s, c]) => {
        const mine = s.students.find(item => item.id === studentId);
        setSaved(mine ? { note: mine.note || '' } : null); setNote(mine?.note || '');
        const lists = await Promise.all(c.challenges.map(ch => companyApi.applicants(ch.id).then(r => r.applications.filter(a => a.studentId === studentId).map(a => ({ ...a, challenge: ch }))).catch(() => [])));
        const flat = lists.flat();
        setApplications(flat);
        // contact email is only exposed through an application this company owns
        const contact = flat.length ? await companyApi.applicationStudent(flat[0].id).then(r => r.student.contactEmail).catch(() => null) : null;
        setProfile({ ...p.profile, contactEmail: contact });
      })
      .catch(err => loadFailure(err, go, setError));
  }
  useEffect(load, [studentId]);

  const trail = [...(crumbs || [{ label: 'Live Challenge', to: '/dashboard/challenges' }]), { label: profile?.fullName || 'Student' }];
  if (error) return <div><Crumbs items={trail} go={go} /><LoadError message={error} onRetry={load} go={go} backTo={backTo} backLabel={backLabel} /></div>;
  if (!profile) return <div><Crumbs items={trail} go={go} /><Skeleton /></div>;

  async function run(fn, okText) {
    setBusy(true); setMsg({ kind: '', text: '' });
    try { await fn(); setMsg({ kind: 'ok', text: okText }); }
    catch (err) { if (err.status === 401) { go('/login'); return; } setMsg({ kind: 'error', text: err.message }); }
    finally { setBusy(false); setConfirming(false); }
  }
  const save = () => run(async () => { await companyApi.saveStudent(studentId, note); setSaved({ note }); }, 'Student saved.');
  const unsave = () => run(async () => { await companyApi.unsaveStudent(studentId); setSaved(null); setNote(''); }, 'Student removed from saved.');

  const links = [['GitHub', profile.githubUrl], ['LinkedIn', profile.linkedinUrl], ['Portfolio', profile.portfolioUrl]].filter(([, url]) => url);

  return (
    <div>
      <Crumbs items={trail} go={go} />
      <div className="ap-head">
        <h2 className="ap-title">{profile.fullName}</h2>
        <p className="ap-sub">{[profile.degree, profile.college, profile.graduationYear, profile.location].filter(Boolean).join(' · ') || 'No academic details added yet.'}</p>
      </div>

      <div className="ap-grid">
        <div className="ap-stack">
          <section className="cp-card"><h3 className="cp-card-title">About</h3>
            <p className="ap-text">{profile.about || 'This student has not written an introduction yet.'}</p>
            {profile.contactEmail && <p className="ap-sub" style={{ marginTop: 12 }}>Contact: <a href={`mailto:${profile.contactEmail}`}>{profile.contactEmail}</a></p>}
          </section>

          <section className="cp-card"><h3 className="cp-card-title">Skills and links</h3>
            <div className="challenge-skills-chips" style={{ maxWidth: 'none', marginBottom: 16 }}>
              {profile.skills.length ? profile.skills.map(s => <span key={s} className="chip">{s}</span>) : <span className="ap-sub">No skills listed.</span>}
            </div>
            <div className="ap-links">{links.length ? links.map(([label, url]) => <a key={label} href={url} target="_blank" rel="noopener noreferrer">{label}</a>) : <span className="ap-sub">No links added.</span>}</div>
          </section>

          <section className="cp-card"><h3 className="cp-card-title">Projects</h3>
            {profile.projects.length === 0 ? <p className="ap-sub">No projects added yet.</p> : profile.projects.map(p => (
              <div key={p.id} className="ap-project">
                <h4>{p.title}</h4>
                {p.description && <p className="ap-text">{p.description}</p>}
                {p.projectUrl && <a href={p.projectUrl} target="_blank" rel="noopener noreferrer">View project</a>}
              </div>
            ))}
          </section>

          <section className="cp-card"><h3 className="cp-card-title">Applications to your challenges</h3>
            {applications.length === 0 ? <p className="ap-sub">This student has not applied to any of your challenges.</p> : (
              <table className="cp-table">
                <thead><tr><th>Challenge</th><th>Status</th><th>Applied</th><th /></tr></thead>
                <tbody>{applications.map(a => (
                  <tr key={a.id}>
                    <td>{a.challenge.roleTitle}</td><td><StatusPill status={a.status} /></td><td className="tabular-nums">{fmtDate(a.appliedAt)}</td>
                    <td><button type="button" className="btn btn-outline btn-sm" onClick={() => go(`/dashboard/applications/${encodeURIComponent(a.id)}`)}>Open</button></td>
                  </tr>))}</tbody>
              </table>
            )}
          </section>
        </div>

        <aside className="cp-card">
          <h3 className="cp-card-title">{saved ? 'Saved student' : 'Save student'}</h3>
          {msg.kind === 'error' && <div className="cp-alert cp-alert-error" role="alert">{msg.text}</div>}
          <label className="cp-field"><span>Private note</span>
            <textarea rows={4} maxLength={1000} value={note} disabled={busy} onChange={e => setNote(e.target.value)} placeholder="Why this student stood out" />
            <small className="tabular-nums">{note.length} / 1000</small>
          </label>
          <div className="cp-button-row" style={{ alignItems: 'center' }}>
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={save}>{saved ? 'Update note' : 'Save student'}</button>
            {saved && <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => setConfirming(true)}>Unsave</button>}
            <button type="button" className="btn btn-outline btn-sm" onClick={() => go(backTo)}>{backLabel}</button>
          </div>
          {msg.kind === 'ok' && <p className="ap-saved-note" role="status" style={{ marginTop: 12 }}>{msg.text}</p>}
        </aside>
      </div>
      {confirming && <UnsaveConfirm name={profile.fullName} busy={busy} onCancel={() => setConfirming(false)} onConfirm={unsave} />}
    </div>
  );
}
