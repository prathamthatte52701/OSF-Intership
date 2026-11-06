import React, { useEffect, useMemo, useState } from 'react';
import { companyApi } from './companyApi.js';

const LIMITS = {
  roleTitle: 150,
  taskDescription: 12000,
  skillCount: 40,
  skillLength: 60,
  reference: 300,
  language: 100,
  extraInformation: 5000,
  compensationDetails: 500,
};

const DURATION_PRESETS = [1, 2, 3, 5, 7, 10, 14, 21, 30];
const CANDIDATE_PRESETS = [10, 25, 50, 100];
const CLOSE_PRESETS = [
  { value: '7', label: '7 days after opening', days: 7 },
  { value: '14', label: '14 days after opening', days: 14 },
  { value: '21', label: '21 days after opening', days: 21 },
  { value: '30', label: '30 days after opening', days: 30 },
];

function errorMessage(error) {
  return error?.message || 'The request could not be completed.';
}

function pad(n) { return String(n).padStart(2, '0'); }

function toDateInputFromDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toDateInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : toDateInputFromDate(date);
}

function startOfDayIso(dateInput) {
  if (!dateInput) return null;
  const [y, m, d] = dateInput.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, 0, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? null : date;
}

function endOfDayIso(dateInput) {
  if (!dateInput) return null;
  const [y, m, d] = dateInput.split('-').map(Number);
  const date = new Date(y, (m || 1) - 1, d || 1, 23, 59, 59, 999);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function fmtShort(date) {
  return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short' }).format(date);
}

function fmtFull(iso) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function statusPillClass(status) {
  return status === 'PUBLISHED' ? 'success' : 'neutral';
}

function emptyForm() {
  return {
    roleTitle: '', taskDescription: '', requiredSkills: [], reference: '', language: '',
    extraInformation: '', isPaid: false, compensationDetails: '',
    opensMode: '', opensDate: '',
    closesMode: '', closesDate: '',
    durationMode: '', durationCustom: '',
    candidatesMode: '', candidatesCustom: '',
  };
}

function matchPreset(value, presets) {
  return value != null && presets.includes(value) ? String(value) : null;
}

function fromChallenge(challenge) {
  const durationPreset = matchPreset(challenge.individualTaskDurationDays, DURATION_PRESETS);
  const candidateCount = challenge.candidateCount;
  const candidatePreset = candidateCount == null ? 'nolimit' : matchPreset(candidateCount, CANDIDATE_PRESETS);
  return {
    roleTitle: challenge.roleTitle || '',
    taskDescription: challenge.taskDescription || '',
    requiredSkills: challenge.requiredSkills || [],
    reference: challenge.reference || '',
    language: challenge.language || '',
    extraInformation: challenge.extraInformation || '',
    isPaid: Boolean(challenge.isPaid),
    compensationDetails: challenge.compensationDetails || '',
    opensMode: 'specific',
    opensDate: toDateInput(challenge.applicationOpensAt),
    closesMode: 'specific',
    closesDate: toDateInput(challenge.applicationClosesAt),
    durationMode: durationPreset || 'custom',
    durationCustom: durationPreset ? '' : String(challenge.individualTaskDurationDays || ''),
    candidatesMode: candidatePreset || (candidateCount == null ? 'nolimit' : 'custom'),
    candidatesCustom: (candidatePreset || candidateCount == null) ? '' : String(candidateCount),
  };
}

function resolvedDuration(form) {
  if (form.durationMode === 'custom') return Number(form.durationCustom);
  return Number(form.durationMode);
}

function resolvedCandidateCount(form) {
  if (form.candidatesMode === 'nolimit') return null;
  if (form.candidatesMode === 'custom') return form.candidatesCustom === '' ? null : Number(form.candidatesCustom);
  return Number(form.candidatesMode);
}

function resolvedWindow(form) {
  const opens = form.opensMode === 'immediately' ? new Date() : startOfDayIso(form.opensDate);
  if (!opens) return { opens: null, closes: null };
  let closes = null;
  const preset = CLOSE_PRESETS.find(item => item.value === form.closesMode);
  if (preset) closes = endOfDayIso(toDateInputFromDate(addDays(opens, preset.days)));
  else if (form.closesMode === 'specific') closes = endOfDayIso(form.closesDate);
  return { opens, closes };
}

function validate(form) {
  const errors = {};
  const title = form.roleTitle.trim();
  if (!title) errors.roleTitle = 'Role or title is required.';
  else if (title.length > LIMITS.roleTitle) errors.roleTitle = `Role or title must be ${LIMITS.roleTitle} characters or fewer.`;

  const description = form.taskDescription.trim();
  if (!description) errors.taskDescription = 'Task description is required.';
  else if (description.length > LIMITS.taskDescription) errors.taskDescription = `Task description must be ${LIMITS.taskDescription} characters or fewer.`;

  if (!form.requiredSkills.length) errors.requiredSkills = 'Add at least one required skill.';
  else if (form.requiredSkills.length > LIMITS.skillCount) errors.requiredSkills = `Up to ${LIMITS.skillCount} skills allowed.`;

  if (form.reference && form.reference.length > LIMITS.reference) errors.reference = `Reference must be ${LIMITS.reference} characters or fewer.`;
  if (form.language && form.language.length > LIMITS.language) errors.language = `Language must be ${LIMITS.language} characters or fewer.`;
  if (form.extraInformation && form.extraInformation.length > LIMITS.extraInformation) errors.extraInformation = `Extra information must be ${LIMITS.extraInformation} characters or fewer.`;
  if (form.isPaid && form.compensationDetails && form.compensationDetails.length > LIMITS.compensationDetails) errors.compensationDetails = `Compensation details must be ${LIMITS.compensationDetails} characters or fewer.`;

  if (!form.opensMode) errors.opensMode = 'Choose when applications open.';
  if (form.opensMode === 'specific' && !form.opensDate) errors.opensDate = 'Choose an opening date.';
  if (!form.closesMode) errors.closesMode = 'Choose when applications close.';
  if (form.closesMode === 'specific' && !form.closesDate) errors.closesDate = 'Choose a closing date.';

  const { opens, closes } = resolvedWindow(form);
  if (form.opensMode && form.closesMode && opens && closes && closes.getTime() < opens.getTime()) {
    errors.closesMode = 'Closing date must not be before the opening date.';
  }

  if (!form.durationMode) errors.durationMode = 'Choose a task duration.';
  if (form.durationMode === 'custom') {
    const duration = Number(form.durationCustom);
    if (!form.durationCustom || !Number.isInteger(duration) || duration < 1 || duration > 365) {
      errors.durationCustom = 'Enter a whole number of days between 1 and 365.';
    }
  }

  if (!form.candidatesMode) errors.candidatesMode = 'Choose how many candidates you need.';
  if (form.candidatesMode === 'custom') {
    const count = Number(form.candidatesCustom);
    if (form.candidatesCustom === '' || !Number.isInteger(count) || count < 0) {
      errors.candidatesCustom = 'Enter a non-negative whole number.';
    }
  }

  return errors;
}

function buildPayload(form) {
  const { opens, closes } = resolvedWindow(form);
  return {
    roleTitle: form.roleTitle.trim(),
    taskDescription: form.taskDescription.trim(),
    requiredSkills: form.requiredSkills,
    reference: form.reference.trim() || null,
    language: form.language.trim() || null,
    extraInformation: form.extraInformation.trim() || null,
    isPaid: form.isPaid,
    compensationDetails: form.isPaid ? (form.compensationDetails.trim() || null) : null,
    candidateCount: resolvedCandidateCount(form),
    applicationOpensAt: opens ? opens.toISOString() : null,
    applicationClosesAt: closes ? closes.toISOString() : null,
    individualTaskDurationDays: resolvedDuration(form),
  };
}

function Field({ label, error, hint, children, htmlFor }) {
  const Wrapper = htmlFor ? 'div' : 'label';
  return (
    <Wrapper className="cp-field">
      {htmlFor ? <label htmlFor={htmlFor}><span>{label}</span></label> : <span>{label}</span>}
      {children}
      {hint && !error && <small>{hint}</small>}
      {error && <small className="cp-field-error">{error}</small>}
    </Wrapper>
  );
}

export default function ChallengeFormPage({ go, challengeId }) {
  const [loading, setLoading] = useState(Boolean(challengeId));
  const [loadError, setLoadError] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [initialForm, setInitialForm] = useState(null);
  const [savedId, setSavedId] = useState(challengeId || null);
  const [errors, setErrors] = useState({});
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skillInput, setSkillInput] = useState('');

  useEffect(() => {
    if (!challengeId) { setInitialForm(emptyForm()); return; }
    setLoading(true);
    companyApi.challenges()
      .then(result => {
        const found = result.challenges.find(item => item.id === challengeId);
        if (!found) { setLoadError('not-found'); return; }
        setChallenge(found);
        if (found.status === 'DRAFT') {
          const next = fromChallenge(found);
          setForm(next);
          setInitialForm(next);
        }
      })
      .catch(err => {
        if (err.status === 401) { go('/login'); return; }
        setLoadError(errorMessage(err));
      })
      .finally(() => setLoading(false));
  }, [challengeId]);

  const dirty = useMemo(() => initialForm && JSON.stringify(form) !== JSON.stringify(initialForm), [form, initialForm]);

  const windowSummary = useMemo(() => {
    const { opens, closes } = resolvedWindow(form);
    if (!opens || !closes) return '';
    return `Applications open ${fmtShort(opens)}, close ${fmtShort(closes)}.`;
  }, [form.opensMode, form.opensDate, form.closesMode, form.closesDate]);

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
  }

  function markTouched(key) {
    setTouched(current => ({ ...current, [key]: true }));
  }

  function showError(key) {
    return (touched[key] || submitted) ? errors[key] : '';
  }

  useEffect(() => { setErrors(validate(form)); }, [form]);

  function addSkill() {
    const value = skillInput.trim();
    if (!value) return;
    if (form.requiredSkills.length >= LIMITS.skillCount) { setSkillInput(''); return; }
    if (form.requiredSkills.some(skill => skill.toLowerCase() === value.toLowerCase())) { setSkillInput(''); return; }
    update('requiredSkills', [...form.requiredSkills, value.slice(0, LIMITS.skillLength)]);
    setSkillInput('');
  }

  function removeSkill(skill) {
    update('requiredSkills', form.requiredSkills.filter(item => item !== skill));
  }

  function handleSkillKeyDown(event) {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      addSkill();
    }
  }

  async function saveDraft() {
    setSubmitted(true);
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length) return null;
    setBusy(true);
    setServerError('');
    try {
      const payload = buildPayload(form);
      const result = savedId
        ? await companyApi.updateChallenge(savedId, payload)
        : await companyApi.createChallenge(payload);
      if (!savedId) {
        setSavedId(result.challenge.id);
        history.replaceState(history.state, '', `/dashboard/challenges/${result.challenge.id}/edit`);
      }
      return result.challenge;
    } catch (err) {
      if (err.status === 401) { go('/login'); return null; }
      setServerError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveDraft() {
    const saved = await saveDraft();
    if (saved) go('/dashboard/challenges');
  }

  async function handlePublish() {
    const saved = await saveDraft();
    if (!saved) return;
    setBusy(true);
    try {
      await companyApi.publishChallenge(saved.id);
      go('/dashboard/challenges');
    } catch (err) {
      if (err.status === 401) { go('/login'); return; }
      setServerError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  function handleCancel() {
    if (dirty && !window.confirm('Discard unsaved changes?')) return;
    go('/dashboard/challenges');
  }

  if (loading) {
    return (
      <div className="cp-card">
        <div className="skeleton-rows">
          <div className="skeleton-row" />
          <div className="skeleton-row" />
          <div className="skeleton-row" />
        </div>
      </div>
    );
  }

  if (loadError === 'not-found') {
    return (
      <div className="cp-card">
        <div className="empty-state-box">
          <strong>Challenge not found</strong>
          <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')} style={{ marginTop: '12px' }}>Back</button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="cp-card">
        <div className="empty-state-box">
          <strong>{loadError}</strong>
          <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')} style={{ marginTop: '12px' }}>Back</button>
        </div>
      </div>
    );
  }

  if (challengeId && challenge && challenge.status !== 'DRAFT') {
    return (
      <div className="cp-card">
        <div className="cp-page-header">
          <div>
            <h3>{challenge.roleTitle}</h3>
            <p>{challenge.status === 'PUBLISHED' ? 'Visible to students. Editing is locked once a challenge is published.' : 'This challenge is closed and no longer accepting applications.'}</p>
          </div>
          <span className={`status-pill ${statusPillClass(challenge.status)}`}>{challenge.status}</span>
        </div>

        <div className="cp-view-rows">
          <div className="cp-view-row">
            <span>Task description</span>
            <p>{challenge.taskDescription}</p>
          </div>
          {challenge.requiredSkills?.length > 0 && (
            <div className="cp-view-row">
              <span>Required skills</span>
              <div className="cp-chip-input" style={{ border: 'none', padding: 0 }}>
                {challenge.requiredSkills.map(skill => <span key={skill} className="chip">{skill}</span>)}
              </div>
            </div>
          )}
          <div className="cp-view-row">
            <span>Application window</span>
            <p className="tabular-nums">{fmtFull(challenge.applicationOpensAt)} → {fmtFull(challenge.applicationClosesAt)}</p>
          </div>
          <div className="cp-view-row">
            <span>Task duration</span>
            <p className="tabular-nums">{challenge.individualTaskDurationDays} day{challenge.individualTaskDurationDays === 1 ? '' : 's'} per student, from the moment they apply</p>
          </div>
          <div className="cp-view-row">
            <span>Candidates needed</span>
            <p className="tabular-nums">{challenge.candidateCount == null ? 'No limit' : challenge.candidateCount}</p>
          </div>
          <div className="cp-view-row">
            <span>Applicants so far</span>
            <p className="tabular-nums">{challenge.applicationCount ?? 0}</p>
          </div>
          <div className="cp-view-row">
            <span>Compensation</span>
            <p>{challenge.isPaid ? (challenge.compensationDetails || 'Paid — no further details given') : 'Unpaid'}</p>
          </div>
          {challenge.reference && (
            <div className="cp-view-row">
              <span>Reference</span>
              <p>{challenge.reference}</p>
            </div>
          )}
          {challenge.language && (
            <div className="cp-view-row">
              <span>Language</span>
              <p>{challenge.language}</p>
            </div>
          )}
          {challenge.extraInformation && (
            <div className="cp-view-row">
              <span>Extra information</span>
              <p>{challenge.extraInformation}</p>
            </div>
          )}
        </div>

        <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')} style={{ marginTop: '20px' }}>Back to Live Challenge</button>
      </div>
    );
  }

  return (
    <div className="cp-challenge-form">
      <div className="cp-page-header">
        <div>
          <h2>{savedId ? 'Edit challenge' : 'New challenge'}</h2>
          <p>Draft the role details before publishing to students.</p>
        </div>
      </div>

      {serverError && <div className="cp-alert cp-alert-error" role="alert">{serverError}</div>}

      <div className="cp-form-grid">
        <section className="cp-card cp-card-basics">
          <h3 className="cp-card-title">Basics</h3>

          <Field label="Role or title" error={showError('roleTitle')}>
            <input
              value={form.roleTitle}
              onChange={e => update('roleTitle', e.target.value)}
              onBlur={() => markTouched('roleTitle')}
              maxLength={LIMITS.roleTitle}
              placeholder="e.g. Frontend Engineering Intern"
            />
          </Field>

          <Field
            label="Task description"
            error={showError('taskDescription')}
            hint={`${form.taskDescription.length} / ${LIMITS.taskDescription} characters`}
          >
            <textarea
              rows={6}
              value={form.taskDescription}
              onChange={e => update('taskDescription', e.target.value)}
              onBlur={() => markTouched('taskDescription')}
              maxLength={LIMITS.taskDescription}
            />
          </Field>

          <Field label="Required skills" htmlFor="cp-skill-input" error={showError('requiredSkills')} hint={`${form.requiredSkills.length} / ${LIMITS.skillCount} skills`}>
            <div className="cp-chip-input">
              {form.requiredSkills.map(skill => (
                <span key={skill} className="chip chip-removable">
                  {skill}
                  <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}>×</button>
                </span>
              ))}
              <input
                id="cp-skill-input"
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={handleSkillKeyDown}
                onBlur={() => { addSkill(); markTouched('requiredSkills'); }}
                placeholder="Add a skill and press Enter"
                maxLength={LIMITS.skillLength}
              />
            </div>
          </Field>
        </section>

        <section className="cp-card cp-card-timeline">
          <h3 className="cp-card-title">Timeline</h3>

          <Field label="Application opens" error={showError('opensMode')}>
            <select value={form.opensMode} onChange={e => update('opensMode', e.target.value)} onBlur={() => markTouched('opensMode')}>
              <option value="" disabled>Select…</option>
              <option value="immediately">Immediately when published</option>
              <option value="specific">On a specific date</option>
            </select>
          </Field>

          {form.opensMode === 'specific' && (
            <Field label="Opening date" error={showError('opensDate')}>
              <input type="date" value={form.opensDate} onChange={e => update('opensDate', e.target.value)} onBlur={() => markTouched('opensDate')} />
            </Field>
          )}

          <Field label="Application closes" error={showError('closesMode')}>
            <select value={form.closesMode} onChange={e => update('closesMode', e.target.value)} onBlur={() => markTouched('closesMode')}>
              <option value="" disabled>Select…</option>
              {CLOSE_PRESETS.map(preset => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
              <option value="specific">On a specific date</option>
            </select>
          </Field>

          {form.closesMode === 'specific' && (
            <Field label="Closing date" error={showError('closesDate')}>
              <input type="date" value={form.closesDate} onChange={e => update('closesDate', e.target.value)} onBlur={() => markTouched('closesDate')} />
            </Field>
          )}

          {windowSummary && <p className="cp-window-summary">{windowSummary}</p>}

          <Field label="Task duration" error={showError('durationMode')} hint="Each student gets this many days from the moment they apply.">
            <select value={form.durationMode} onChange={e => update('durationMode', e.target.value)} onBlur={() => markTouched('durationMode')}>
              <option value="" disabled>Select…</option>
              {DURATION_PRESETS.map(days => <option key={days} value={days}>{days} day{days > 1 ? 's' : ''}</option>)}
              <option value="custom">Custom</option>
            </select>
          </Field>

          {form.durationMode === 'custom' && (
            <Field label="Custom duration (days)" error={showError('durationCustom')}>
              <input type="number" min="1" max="365" value={form.durationCustom} onChange={e => update('durationCustom', e.target.value)} onBlur={() => markTouched('durationCustom')} />
            </Field>
          )}

          <Field label="Candidates needed" error={showError('candidatesMode')}>
            <select value={form.candidatesMode} onChange={e => update('candidatesMode', e.target.value)} onBlur={() => markTouched('candidatesMode')}>
              <option value="" disabled>Select…</option>
              <option value="nolimit">No limit</option>
              {CANDIDATE_PRESETS.map(count => <option key={count} value={count}>{count}</option>)}
              <option value="custom">Custom</option>
            </select>
          </Field>

          {form.candidatesMode === 'custom' && (
            <Field label="Custom candidate count" error={showError('candidatesCustom')}>
              <input type="number" min="0" value={form.candidatesCustom} onChange={e => update('candidatesCustom', e.target.value)} onBlur={() => markTouched('candidatesCustom')} />
            </Field>
          )}
        </section>

        <section className="cp-card cp-card-more">
          <h3 className="cp-card-title">More details</h3>

          <Field label="Reference link" error={showError('reference')}>
            <input value={form.reference} onChange={e => update('reference', e.target.value)} onBlur={() => markTouched('reference')} maxLength={LIMITS.reference} placeholder="https://…" />
          </Field>

          <Field label="Language" error={showError('language')}>
            <input value={form.language} onChange={e => update('language', e.target.value)} onBlur={() => markTouched('language')} maxLength={LIMITS.language} />
          </Field>

          <label className="cp-field cp-field-checkbox">
            <input type="checkbox" checked={form.isPaid} onChange={e => update('isPaid', e.target.checked)} />
            <span>Paid opportunity</span>
          </label>

          {form.isPaid && (
            <Field label="Compensation details" error={showError('compensationDetails')}>
              <input value={form.compensationDetails} onChange={e => update('compensationDetails', e.target.value)} onBlur={() => markTouched('compensationDetails')} maxLength={LIMITS.compensationDetails} />
            </Field>
          )}

          <Field label="Extra information" error={showError('extraInformation')} hint={`${form.extraInformation.length} / ${LIMITS.extraInformation} characters`}>
            <textarea rows={3} value={form.extraInformation} onChange={e => update('extraInformation', e.target.value)} onBlur={() => markTouched('extraInformation')} maxLength={LIMITS.extraInformation} />
          </Field>
        </section>
      </div>

      <div className="cp-action-bar">
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={handleCancel}>Cancel</button>
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={handleSaveDraft}>Save draft</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={handlePublish}>Publish</button>
      </div>
    </div>
  );
}
