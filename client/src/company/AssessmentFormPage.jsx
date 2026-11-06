import React, { useEffect, useState } from 'react';
import { companyApi } from './companyApi.js';
import { Skeleton, ErrorState, ConfirmDialog, PUBLISH_TEXT, errMsg, OPTION_KEYS, publishBlocker } from './SkillShared.jsx';

const DURATIONS = [10, 15, 20, 30, 45, 60, 90, 120];
const blankQ = () => ({ id: null, questionText: '', optionA: '', optionB: '', optionC: '', optionD: '', correctAnswer: '' });

function validateQuestion(q) {
  if (!q.questionText.trim()) return 'Enter the question text.';
  if (OPTION_KEYS.some(k => !q[`option${k}`].trim())) return 'Fill in all four answer options.';
  if (!OPTION_KEYS.includes(q.correctAnswer)) return 'Mark the correct answer.';
  return '';
}

function QuestionEditor({ initial, onSave, onCancel }) {
  const [q, setQ] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    const v = validateQuestion(q);
    if (v) return setErr(v);
    setBusy(true); setErr('');
    try { await onSave(q); } catch (e) { setErr(errMsg(e)); setBusy(false); }
  }
  return (
    <div className="cp-card cp-question-editor">
      <label className="cp-field"><span>Question</span>
        <textarea value={q.questionText} maxLength={3000} onChange={e => setQ({ ...q, questionText: e.target.value })} placeholder="e.g. Which keyword declares a block-scoped constant?" />
      </label>
      <fieldset className="cp-options">
        <legend>Answer options. Select the correct one.</legend>
        {OPTION_KEYS.map(k => (
          <div key={k} className="cp-option-row">
            <input type="radio" name="correct" aria-label={`Mark option ${k} as correct`} checked={q.correctAnswer === k} onChange={() => setQ({ ...q, correctAnswer: k })} />
            <input type="text" aria-label={`Option ${k}`} value={q[`option${k}`]} maxLength={1000} placeholder={`Option ${k}`} onChange={e => setQ({ ...q, [`option${k}`]: e.target.value })} />
          </div>
        ))}
      </fieldset>
      {err && <div className="cp-alert cp-alert-error" role="alert">{err}</div>}
      <div className="cp-button-row">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving...' : 'Save question'}</button>
        <button className="btn btn-outline btn-sm" onClick={onCancel} disabled={busy}>Cancel</button>
      </div>
    </div>
  );
}

export default function AssessmentFormPage({ go, assessmentId }) {
  const editing = !!assessmentId;
  const [state, setState] = useState(editing ? 'loading' : 'ready');
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState({ title: '', relatedSkill: '', description: '', instructions: '', duration: '' });
  const [questions, setQuestions] = useState([]);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editorQ, setEditorQ] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [notice, setNotice] = useState('');

  function load() {
    setState('loading'); setLoadError('');
    companyApi.assessments().then(r => {
      const a = r.assessments.find(x => x.id === assessmentId);
      if (!a) { setLoadError('Assessment not found.'); return setState('error'); }
      if (a.status !== 'DRAFT') return go(`/dashboard/skills/${encodeURIComponent(a.id)}/attempts`);
      setForm({ title: a.title, relatedSkill: a.relatedSkill, description: a.description || '', instructions: a.instructions || '', duration: a.durationMinutes ? String(a.durationMinutes) : 'none' });
      setQuestions(a.questions); setState('ready');
    }).catch(e => { if (e.status === 401) return go('/login'); setLoadError(errMsg(e)); setState('error'); });
  }
  useEffect(() => { if (editing) load(); }, [assessmentId]);

  if (state === 'loading') return <Skeleton />;
  if (state === 'error') return <ErrorState message={loadError} onRetry={load} />;

  const set = k => e => setForm({ ...form, [k]: e.target.value });

  async function saveDetails() {
    const errs = {};
    if (!form.title.trim()) errs.title = 'Enter a title.';
    if (!form.relatedSkill.trim()) errs.relatedSkill = 'Enter the skill this assessment verifies.';
    if (!form.duration) errs.duration = 'Choose a time limit, or No limit.';
    setFieldErrors(errs); setFormError(''); setNotice('');
    if (Object.keys(errs).length) return;
    const body = { title: form.title.trim(), relatedSkill: form.relatedSkill.trim(), description: form.description.trim(), instructions: form.instructions.trim(),
      durationMinutes: form.duration === 'none' ? null : Number(form.duration) };
    setSaving(true);
    try {
      if (editing) { await companyApi.updateAssessment(assessmentId, body); setNotice('Details saved.'); }
      else { const r = await companyApi.createAssessment(body); go(`/dashboard/skills/${encodeURIComponent(r.assessment.id)}/edit`); return; }
    } catch (e) { if (e.status === 401) return go('/login'); setFormError(errMsg(e)); }
    setSaving(false);
  }

  async function saveQuestion(q) {
    const body = { questionText: q.questionText.trim(), optionA: q.optionA.trim(), optionB: q.optionB.trim(), optionC: q.optionC.trim(), optionD: q.optionD.trim(), correctAnswer: q.correctAnswer };
    const r = q.id ? await companyApi.updateQuestion(assessmentId, q.id, body) : await companyApi.addQuestion(assessmentId, body);
    setQuestions(c => (q.id ? c.map(x => (x.id === q.id ? r.question : x)) : [...c, r.question]));
    setEditorQ(null);
  }
  async function removeQuestion(q) {
    setFormError('');
    try { await companyApi.deleteQuestion(assessmentId, q.id); setQuestions(c => c.filter(x => x.id !== q.id)); }
    catch (e) { setFormError(errMsg(e)); }
  }
  async function publish() {
    setSaving(true);
    try { await companyApi.publishAssessment(assessmentId); go('/dashboard/skills'); }
    catch (e) { setFormError(errMsg(e)); setConfirmPublish(false); setSaving(false); }
  }

  const blocker = publishBlocker(questions);

  return (
    <div className="cp-challenge-form">
      <div className="cp-page-header">
        <div><h2>{editing ? 'Edit assessment' : 'New skill assessment'}</h2>
          <p>{editing ? 'Draft: you can change everything until you publish.' : 'Add the basics first. You will add questions on the next screen.'}</p></div>
        <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/skills')}>Back to assessments</button>
      </div>
      {formError && <div className="cp-alert cp-alert-error" role="alert">{formError}</div>}
      {notice && <div className="cp-alert" role="status">{notice}</div>}

      <div className="cp-card" style={{ marginBottom: 24 }}>
        <h3 className="cp-card-title">Details</h3>
        <div className="cp-form-grid">
          <label className="cp-field"><span>Title</span>
            <input type="text" value={form.title} maxLength={150} onChange={set('title')} aria-invalid={!!fieldErrors.title} />
            {fieldErrors.title && <small className="cp-field-error">{fieldErrors.title}</small>}</label>
          <label className="cp-field"><span>Skill verified</span>
            <input type="text" value={form.relatedSkill} maxLength={80} onChange={set('relatedSkill')} placeholder="e.g. JavaScript" aria-invalid={!!fieldErrors.relatedSkill} />
            {fieldErrors.relatedSkill && <small className="cp-field-error">{fieldErrors.relatedSkill}</small>}</label>
          <label className="cp-field"><span>Time limit</span>
            <select value={form.duration} onChange={set('duration')} aria-invalid={!!fieldErrors.duration}>
              <option value="" disabled>Select...</option>
              <option value="none">No limit</option>
              {DURATIONS.map(m => <option key={m} value={m}>{m} minutes</option>)}
            </select>
            {fieldErrors.duration && <small className="cp-field-error">{fieldErrors.duration}</small>}</label>
          <label className="cp-field"><span>Description (optional)</span>
            <textarea value={form.description} maxLength={3000} onChange={set('description')} /></label>
        </div>
        <label className="cp-field"><span>Instructions for students (optional)</span>
          <textarea value={form.instructions} maxLength={3000} onChange={set('instructions')} /></label>
        <button className="btn btn-primary btn-sm" onClick={saveDetails} disabled={saving}>{saving ? 'Saving...' : editing ? 'Save details' : 'Save and add questions'}</button>
      </div>

      {editing && (
        <div className="cp-card">
          <div className="cp-page-header" style={{ marginBottom: 16 }}>
            <div><h3 className="cp-card-title" style={{ marginBottom: 4 }}>Questions ({questions.length})</h3>
              <p>Each question has four options and exactly one correct answer.</p></div>
            {!editorQ && <button className="btn btn-outline btn-sm" onClick={() => setEditorQ(blankQ())}>Add question</button>}
          </div>
          {questions.length === 0 && !editorQ && <div className="cp-empty-state" style={{ padding: 24 }}><strong>No questions yet</strong><p>Add your first question to continue.</p></div>}
          <ol className="cp-question-list">
            {questions.map(q => (editorQ?.id === q.id
              ? <li key={q.id}><QuestionEditor initial={editorQ} onSave={saveQuestion} onCancel={() => setEditorQ(null)} /></li>
              : (
                <li key={q.id} className="cp-question-item">
                  <p className="cp-question-text">{q.questionText}</p>
                  <ul className="cp-option-list">
                    {OPTION_KEYS.map(k => <li key={k} className={q.correctAnswer === k ? 'correct' : ''}>{k}. {q[`option${k}`]}{q.correctAnswer === k && ' (correct)'}</li>)}
                  </ul>
                  <div className="cp-button-row">
                    <button className="btn btn-outline btn-sm" onClick={() => setEditorQ({ ...q })}>Edit</button>
                    <button className="btn btn-outline btn-sm" onClick={() => removeQuestion(q)}>Delete</button>
                  </div>
                </li>
              )))}
          </ol>
          {editorQ && !editorQ.id && <QuestionEditor initial={editorQ} onSave={saveQuestion} onCancel={() => setEditorQ(null)} />}
        </div>
      )}

      {editing && (
        <div className="cp-action-bar">
          <span className="cp-publish-helper">{blocker || 'Ready to publish.'}</span>
          <button className="btn btn-primary btn-sm" disabled={!!blocker || saving} onClick={() => setConfirmPublish(true)}>Publish</button>
        </div>
      )}
      {confirmPublish && <ConfirmDialog title="Publish this assessment?" text={PUBLISH_TEXT} confirmLabel="Publish assessment" busy={saving} onConfirm={publish} onCancel={() => setConfirmPublish(false)} />}
    </div>
  );
}
