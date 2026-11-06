import React from 'react';
import { companyApi } from './companyApi.js';
import './talent.css';

const PAGE_SIZE = 24;

function Skeletons() {
  return (
    <div className="td-grid" aria-busy="true" aria-label="Loading students">
      {Array.from({ length: 6 }, (_, i) => <div key={i} className="td-card td-skeleton" />)}
    </div>
  );
}

function ErrorBox({ message, onRetry }) {
  return (
    <div className="cp-alert cp-alert-error td-error" role="alert">
      <span>{message}</span>
      <button type="button" className="btn btn-outline btn-sm" onClick={onRetry}>Try again</button>
    </div>
  );
}

function StudentCard({ student, matched, saved, busy, onOpen, onToggle }) {
  const matchedSet = new Set((matched || []).map(s => s.toLowerCase()));
  return (
    <article className="td-card">
      <div className="td-card-head">
        <div>
          <h3><a href={`/dashboard/students/${student.id}`} onClick={e => { e.preventDefault(); onOpen(student.id); }}>{student.fullName}</a></h3>
          <p className="td-muted">{[student.college, student.degree].filter(Boolean).join(' · ') || 'College not listed'}</p>
        </div>
        <button type="button" className={`btn btn-sm ${saved ? 'btn-outline' : 'btn-primary'}`} disabled={busy} aria-pressed={saved} onClick={() => onToggle(student.id)}>
          {saved ? 'Unsave' : 'Save'}
        </button>
      </div>
      <ul className="td-skills" aria-label="Skills">
        {student.skills.slice(0, 12).map(skill => (
          <li key={skill} className={matchedSet.has(skill.toLowerCase()) ? 'td-skill td-skill-match' : 'td-skill'}>{skill}</li>
        ))}
        {!student.skills.length && <li className="td-muted">No skills listed yet</li>}
      </ul>
      {matched && <p className="td-muted">{student.matchCount} of {matched.requested} requested skill{matched.requested === 1 ? '' : 's'} matched</p>}
    </article>
  );
}

function SavedRow({ student, busy, onOpen, onUnsave, onSaveNote }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(student.note || '');
  return (
    <article className="td-card">
      <div className="td-card-head">
        <div>
          <h3><a href={`/dashboard/students/${student.id}`} onClick={e => { e.preventDefault(); onOpen(student.id); }}>{student.fullName}</a></h3>
          <p className="td-muted">{student.college || 'College not listed'}</p>
        </div>
        <button type="button" className="btn btn-outline btn-sm" disabled={busy} onClick={() => onUnsave(student.id)}>Unsave</button>
      </div>
      {editing ? (
        <div className="cp-field">
          <label htmlFor={`note-${student.id}`}><span>Note</span></label>
          <textarea id={`note-${student.id}`} rows={3} maxLength={1000} value={draft} onChange={e => setDraft(e.target.value)} />
          <div className="cp-button-row">
            <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={async () => { if (await onSaveNote(student.id, draft)) setEditing(false); }}>Save note</button>
            <button type="button" className="btn btn-outline btn-sm" onClick={() => { setDraft(student.note || ''); setEditing(false); }}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="td-note">
          <p className={student.note ? '' : 'td-muted'}>{student.note || 'No note yet.'}</p>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>{student.note ? 'Edit note' : 'Add note'}</button>
        </div>
      )}
    </article>
  );
}

export default function TalentDiscoveryPage({ go }) {
  const [tab, setTab] = React.useState('discover');
  const [skills, setSkills] = React.useState([]);
  const [skillDraft, setSkillDraft] = React.useState('');
  const [collegeInput, setCollegeInput] = React.useState('');
  const [college, setCollege] = React.useState('');
  const [page, setPage] = React.useState(0);
  const [results, setResults] = React.useState(null);
  const [error, setError] = React.useState('');
  const [reloadKey, setReloadKey] = React.useState(0);
  const [saved, setSaved] = React.useState(null);
  const [savedError, setSavedError] = React.useState('');
  const [busyId, setBusyId] = React.useState('');
  const [actionError, setActionError] = React.useState('');

  React.useEffect(() => {
    const timer = setTimeout(() => { setCollege(collegeInput.trim()); setPage(0); }, 300);
    return () => clearTimeout(timer);
  }, [collegeInput]);

  React.useEffect(() => {
    let live = true;
    setResults(null); setError('');
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(page * PAGE_SIZE) });
    if (skills.length) query.set('skills', skills.join(','));
    if (college) query.set('college', college);
    companyApi.talent(query.toString())
      .then(r => live && setResults(r))
      .catch(e => live && setError(e.message));
    return () => { live = false; };
  }, [skills, college, page, reloadKey]);

  const loadSaved = React.useCallback(() => {
    setSavedError('');
    companyApi.savedStudents().then(r => setSaved(r.students)).catch(e => setSavedError(e.message));
  }, []);
  React.useEffect(loadSaved, [loadSaved]);

  const savedIds = React.useMemo(() => new Set((saved || []).map(s => s.id)), [saved]);
  const open = id => go(`/dashboard/students/${id}`);

  async function act(id, fn) {
    setBusyId(id); setActionError('');
    try { await fn(); loadSaved(); return true; } catch (e) { setActionError(e.message); return false; } finally { setBusyId(''); }
  }
  const toggle = id => act(id, () => (savedIds.has(id) ? companyApi.unsaveStudent(id) : companyApi.saveStudent(id)));

  function addSkill() {
    const value = skillDraft.trim();
    if (value && !skills.some(s => s.toLowerCase() === value.toLowerCase()) && skills.length < 20) { setSkills([...skills, value]); setPage(0); }
    setSkillDraft('');
  }
  const clearFilters = () => { setSkills([]); setCollegeInput(''); setCollege(''); setPage(0); };

  const total = results?.total || 0;
  const filtered = skills.length > 0 || college !== '';

  return (
    <div className="td-page">
      <div className="td-tabs" role="tablist">
        {[['discover', 'Discover'], ['saved', `Saved students${saved ? ` (${saved.length})` : ''}`]].map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id} className={`td-tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>
      {actionError && <div className="cp-alert cp-alert-error" role="alert">{actionError}</div>}

      {tab === 'discover' && (
        <>
          <section className="cp-card td-filters" aria-label="Filters">
            <div className="cp-field">
              <label htmlFor="td-skill"><span>Skills</span></label>
              <div className="cp-chip-input">
                {skills.map(skill => (
                  <span key={skill} className="td-skill td-skill-match td-chip">
                    {skill}
                    <button type="button" aria-label={`Remove ${skill}`} onClick={() => { setSkills(skills.filter(s => s !== skill)); setPage(0); }}>&times;</button>
                  </span>
                ))}
                <input
                  id="td-skill" value={skillDraft} placeholder={skills.length ? 'Add another skill' : 'Type a skill and press Enter'} maxLength={60}
                  onChange={e => setSkillDraft(e.target.value)} onBlur={addSkill}
                  onKeyDown={e => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addSkill(); } else if (e.key === 'Backspace' && !skillDraft && skills.length) setSkills(skills.slice(0, -1)); }}
                />
              </div>
              <small>Students are ranked by how many of these skills they list.</small>
            </div>
            <div className="cp-field">
              <label htmlFor="td-college"><span>College</span></label>
              <input id="td-college" value={collegeInput} maxLength={200} placeholder="e.g. Institute of Technology" onChange={e => setCollegeInput(e.target.value)} />
            </div>
          </section>

          {error && <ErrorBox message={error} onRetry={() => setReloadKey(k => k + 1)} />}
          {!error && !results && <Skeletons />}
          {results && !results.students.length && (
            <div className="cp-empty-state">
              <strong>{filtered ? 'No students match these filters' : 'No students to show yet'}</strong>
              <p>{filtered ? 'Remove a skill or broaden the college to see more students.' : 'Students appear here once they publish their profile.'}</p>
              {filtered && <button type="button" className="btn btn-primary btn-sm" onClick={clearFilters}>Clear filters</button>}
            </div>
          )}
          {results?.students.length > 0 && (
            <>
              <p className="td-muted">Showing {page * PAGE_SIZE + 1}&ndash;{page * PAGE_SIZE + results.students.length} of {total}</p>
              <div className="td-grid">
                {results.students.map(s => (
                  <StudentCard key={s.id} student={s} saved={savedIds.has(s.id)} busy={busyId === s.id} onOpen={open} onToggle={toggle}
                    matched={skills.length ? Object.assign([...s.matchedSkills], { requested: skills.length }) : null} />
                ))}
              </div>
              <div className="td-pager">
                <button type="button" className="btn btn-outline btn-sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage(page + 1)}>Next</button>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'saved' && (
        <>
          {savedError && <ErrorBox message={savedError} onRetry={loadSaved} />}
          {!savedError && !saved && <Skeletons />}
          {saved && !saved.length && (
            <div className="cp-empty-state">
              <strong>No saved students yet</strong>
              <p>Save promising students from Discover to keep notes on them here.</p>
              <button type="button" className="btn btn-primary btn-sm" onClick={() => setTab('discover')}>Go to Discover</button>
            </div>
          )}
          {saved?.length > 0 && (
            <div className="td-grid">
              {saved.map(s => (
                <SavedRow key={s.id} student={s} busy={busyId === s.id} onOpen={open}
                  onUnsave={id => act(id, () => companyApi.unsaveStudent(id))}
                  onSaveNote={(id, note) => act(id, () => companyApi.saveStudent(id, note.trim()))} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
