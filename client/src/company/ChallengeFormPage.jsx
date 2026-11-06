import React, { useEffect, useMemo, useState } from 'react';
import { companyApi } from './companyApi.js';

function errorMessage(error) {
  return error?.message || 'The request could not be completed.';
}

function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(localValue) {
  if (!localValue) return null;
  const date = new Date(localValue);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function defaultForm() {
  const now = new Date();
  const closes = new Date(now.getTime() + 20 * 86400000);
  return {
    roleTitle: '', taskDescription: '', requiredSkills: [], reference: '', language: '',
    extraInformation: '', isPaid: false, compensationDetails: '', candidateCount: '',
    applicationOpensAt: toLocalInput(now.toISOString()),
    applicationClosesAt: toLocalInput(closes.toISOString()),
    individualTaskDurationDays: 5,
  };
}

function fromChallenge(challenge) {
  return {
    roleTitle: challenge.roleTitle || '',
    taskDescription: challenge.taskDescription || '',
    requiredSkills: challenge.requiredSkills || [],
    reference: challenge.reference || '',
    language: challenge.language || '',
    extraInformation: challenge.extraInformation || '',
    isPaid: Boolean(challenge.isPaid),
    compensationDetails: challenge.compensationDetails || '',
    candidateCount: challenge.candidateCount == null ? '' : String(challenge.candidateCount),
    applicationOpensAt: toLocalInput(challenge.applicationOpensAt),
    applicationClosesAt: toLocalInput(challenge.applicationClosesAt),
    individualTaskDurationDays: challenge.individualTaskDurationDays || 5,
  };
}

function validate(form) {
  const errors = {};
  const title = form.roleTitle.trim();
  if (!title) errors.roleTitle = 'Role or title is required.';
  else if (title.length > 150) errors.roleTitle = 'Role or title must be 150 characters or fewer.';

  const description = form.taskDescription.trim();
  if (!description) errors.taskDescription = 'Task description is required.';
  else if (description.length > 12000) errors.taskDescription = 'Task description must be 12000 characters or fewer.';

  if (form.requiredSkills.length > 40) errors.requiredSkills = 'Up to 40 skills allowed.';
  if (form.requiredSkills.some(skill => skill.length > 60)) errors.requiredSkills = 'Each skill must be 60 characters or fewer.';

  if (form.reference && form.reference.length > 300) errors.reference = 'Reference must be 300 characters or fewer.';
  if (form.language && form.language.length > 100) errors.language = 'Language must be 100 characters or fewer.';
  if (form.extraInformation && form.extraInformation.length > 5000) errors.extraInformation = 'Extra information must be 5000 characters or fewer.';
  if (form.isPaid && form.compensationDetails && form.compensationDetails.length > 500) errors.compensationDetails = 'Compensation details must be 500 characters or fewer.';

  if (form.candidateCount !== '') {
    const count = Number(form.candidateCount);
    if (!Number.isInteger(count) || count < 0) errors.candidateCount = 'Candidate count must be a non-negative whole number.';
  }

  const opens = toIso(form.applicationOpensAt);
  const closes = toIso(form.applicationClosesAt);
  if (!opens) errors.applicationOpensAt = 'Enter a valid opening date and time.';
  if (!closes) errors.applicationClosesAt = 'Enter a valid closing date and time.';
  if (opens && closes && Date.parse(closes) < Date.parse(opens)) errors.applicationClosesAt = 'Closing date must not be before the opening date.';

  const duration = Number(form.individualTaskDurationDays);
  if (!Number.isInteger(duration) || duration < 1 || duration > 365) errors.individualTaskDurationDays = 'Task duration must be between 1 and 365 days.';

  return errors;
}

function buildPayload(form) {
  return {
    roleTitle: form.roleTitle.trim(),
    taskDescription: form.taskDescription.trim(),
    requiredSkills: form.requiredSkills,
    reference: form.reference.trim() || null,
    language: form.language.trim() || null,
    extraInformation: form.extraInformation.trim() || null,
    isPaid: form.isPaid,
    compensationDetails: form.isPaid ? (form.compensationDetails.trim() || null) : null,
    candidateCount: form.candidateCount === '' ? null : Number(form.candidateCount),
    applicationOpensAt: toIso(form.applicationOpensAt),
    applicationClosesAt: toIso(form.applicationClosesAt),
    individualTaskDurationDays: Number(form.individualTaskDurationDays),
  };
}

export default function ChallengeFormPage({ go, challengeId }) {
  const isEdit = Boolean(challengeId);
  const [loading, setLoading] = useState(isEdit);
  const [loadError, setLoadError] = useState('');
  const [challenge, setChallenge] = useState(null);
  const [form, setForm] = useState(defaultForm);
  const [initialForm, setInitialForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [busy, setBusy] = useState(false);
  const [skillInput, setSkillInput] = useState('');

  useEffect(() => {
    if (!isEdit) { setInitialForm(defaultForm()); return; }
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

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
  }

  function addSkill() {
    const value = skillInput.trim();
    if (!value) return;
    if (form.requiredSkills.some(skill => skill.toLowerCase() === value.toLowerCase())) { setSkillInput(''); return; }
    update('requiredSkills', [...form.requiredSkills, value]);
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
    const validation = validate(form);
    setErrors(validation);
    if (Object.keys(validation).length) return null;
    setBusy(true);
    setServerError('');
    try {
      const payload = buildPayload(form);
      const result = isEdit ? await companyApi.updateChallenge(challengeId, payload) : await companyApi.createChallenge(payload);
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
      <div className="dash-card">
        <div className="empty-state-box">
          <span className="loading-spinner" />
          <strong>Loading challenge…</strong>
        </div>
      </div>
    );
  }

  if (loadError === 'not-found') {
    return (
      <div className="dash-card">
        <div className="empty-state-box">
          <strong>Challenge not found</strong>
          <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')} style={{ marginTop: '12px' }}>Back</button>
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="dash-card">
        <div className="empty-state-box">
          <strong>{loadError}</strong>
          <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')} style={{ marginTop: '12px' }}>Back</button>
        </div>
      </div>
    );
  }

  if (isEdit && challenge && challenge.status !== 'DRAFT') {
    return (
      <div className="dash-card">
        <div className="dash-card-header">
          <div>
            <h3>{challenge.roleTitle}</h3>
            <span className={`status-pill ${challenge.status === 'PUBLISHED' ? 'success' : 'warning'}`}>{challenge.status}</span>
          </div>
        </div>
        <p>Published and closed challenges can't be edited here.</p>
        <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')}>Back</button>
      </div>
    );
  }

  return (
    <div className="dash-card challenge-form">
      <div className="dash-card-header">
        <div>
          <h3>{isEdit ? 'Edit challenge' : 'New challenge'}</h3>
          <p>Draft the role details before publishing to students.</p>
        </div>
      </div>

      {serverError && <div className="student-alert student-alert-error" role="alert">{serverError}</div>}

      <label className="sp-field">
        <span>Role or title</span>
        <input value={form.roleTitle} onChange={e => update('roleTitle', e.target.value)} maxLength={150} />
        {errors.roleTitle && <small className="field-error">{errors.roleTitle}</small>}
      </label>

      <label className="sp-field">
        <span>Task description</span>
        <textarea rows={6} value={form.taskDescription} onChange={e => update('taskDescription', e.target.value)} maxLength={12000} />
        {errors.taskDescription && <small className="field-error">{errors.taskDescription}</small>}
      </label>

      <label className="sp-field">
        <span>Required skills</span>
        <div className="skill-chip-input">
          {form.requiredSkills.map(skill => (
            <span key={skill} className="chip chip-removable">
              {skill}
              <button type="button" onClick={() => removeSkill(skill)} aria-label={`Remove ${skill}`}>×</button>
            </span>
          ))}
          <input
            value={skillInput}
            onChange={e => setSkillInput(e.target.value)}
            onKeyDown={handleSkillKeyDown}
            onBlur={addSkill}
            placeholder="Add a skill and press Enter"
            maxLength={60}
          />
        </div>
        {errors.requiredSkills && <small className="field-error">{errors.requiredSkills}</small>}
      </label>

      <label className="sp-field">
        <span>Reference</span>
        <input value={form.reference} onChange={e => update('reference', e.target.value)} maxLength={300} />
        {errors.reference && <small className="field-error">{errors.reference}</small>}
      </label>

      <label className="sp-field">
        <span>Language</span>
        <input value={form.language} onChange={e => update('language', e.target.value)} maxLength={100} />
        {errors.language && <small className="field-error">{errors.language}</small>}
      </label>

      <label className="sp-field">
        <span>Extra information</span>
        <textarea rows={3} value={form.extraInformation} onChange={e => update('extraInformation', e.target.value)} maxLength={5000} />
        {errors.extraInformation && <small className="field-error">{errors.extraInformation}</small>}
      </label>

      <label className="sp-field sp-field-checkbox">
        <input type="checkbox" checked={form.isPaid} onChange={e => update('isPaid', e.target.checked)} />
        <span>Paid opportunity</span>
      </label>

      {form.isPaid && (
        <label className="sp-field">
          <span>Compensation details</span>
          <input value={form.compensationDetails} onChange={e => update('compensationDetails', e.target.value)} maxLength={500} />
          {errors.compensationDetails && <small className="field-error">{errors.compensationDetails}</small>}
        </label>
      )}

      <label className="sp-field">
        <span>Candidate count</span>
        <input type="number" min="0" value={form.candidateCount} onChange={e => update('candidateCount', e.target.value)} />
        {errors.candidateCount && <small className="field-error">{errors.candidateCount}</small>}
      </label>

      <div className="challenge-form-dates">
        <label className="sp-field">
          <span>Application opens</span>
          <input type="datetime-local" value={form.applicationOpensAt} onChange={e => update('applicationOpensAt', e.target.value)} />
          {errors.applicationOpensAt && <small className="field-error">{errors.applicationOpensAt}</small>}
        </label>
        <label className="sp-field">
          <span>Application closes</span>
          <input type="datetime-local" value={form.applicationClosesAt} onChange={e => update('applicationClosesAt', e.target.value)} />
          {errors.applicationClosesAt && <small className="field-error">{errors.applicationClosesAt}</small>}
        </label>
      </div>

      <label className="sp-field">
        <span>Individual task duration (days)</span>
        <input type="number" min="1" max="365" value={form.individualTaskDurationDays} onChange={e => update('individualTaskDurationDays', e.target.value)} />
        <small>Each student gets this many days from the moment they apply, separate from the application window.</small>
        {errors.individualTaskDurationDays && <small className="field-error">{errors.individualTaskDurationDays}</small>}
      </label>

      <div className="challenge-form-actions">
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={handleCancel}>Cancel</button>
        <button className="btn btn-outline btn-sm" disabled={busy} onClick={handleSaveDraft}>Save draft</button>
        <button className="btn btn-primary btn-sm" disabled={busy} onClick={handlePublish}>Publish</button>
      </div>
    </div>
  );
}
