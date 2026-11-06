import { handleUnauthorized } from '../api.js';

const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const headers = { ...(options.body && typeof options.body === 'string' ? jsonHeaders : {}), ...options.headers };
  const response = await fetch(`/api${path}`, { credentials: 'include', ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
    if (response.status === 401) handleUnauthorized('company', path);
    error.retryAfter = Number(response.headers.get('Retry-After')) || 0;
    throw error;
  }
  return result;
}

const post = (path, body) => request(path, { method: 'POST', ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });
const del = path => request(path, { method: 'DELETE' });
const enc = encodeURIComponent;

export const companyApi = {
  challenges: () => request('/company/challenges'),
  createChallenge: body => post('/company/challenges', body),
  updateChallenge: (id, body) => put(`/company/challenges/${encodeURIComponent(id)}`, body),
  publishChallenge: id => post(`/company/challenges/${encodeURIComponent(id)}/publish`),
  applicants: id => request(`/company/challenges/${encodeURIComponent(id)}/applications`),
  application: id => request(`/company/applications/${encodeURIComponent(id)}`),
  applicationStudent: id => request(`/company/applications/${encodeURIComponent(id)}/student`),
  submission: id => request(`/company/applications/${encodeURIComponent(id)}/submission`),
  evaluate: (id, body) => put(`/company/applications/${encodeURIComponent(id)}/evaluation`, body),
  talentProfile: id => request(`/company/talent/${encodeURIComponent(id)}`),
  savedStudents: () => request('/company/saved-students'),
  unsaveStudent: id => request(`/company/saved-students/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  closeChallenge: id => post(`/company/challenges/${encodeURIComponent(id)}/close`),
  assessments: () => request('/company/assessments'),
  createAssessment: body => post('/company/assessments', body),
  updateAssessment: (id, body) => put(`/company/assessments/${enc(id)}`, body),
  addQuestion: (id, body) => post(`/company/assessments/${enc(id)}/questions`, body),
  updateQuestion: (id, qid, body) => put(`/company/assessments/${enc(id)}/questions/${enc(qid)}`, body),
  deleteQuestion: (id, qid) => del(`/company/assessments/${enc(id)}/questions/${enc(qid)}`),
  publishAssessment: id => post(`/company/assessments/${enc(id)}/publish`),
  closeAssessment: id => post(`/company/assessments/${enc(id)}/close`),
  assessmentAttempts: id => request(`/company/assessments/${enc(id)}/attempts`),
  assessmentAttempt: id => request(`/company/assessment-attempts/${enc(id)}`),
  evaluateAttempt: (id, body) => put(`/company/assessment-attempts/${enc(id)}/evaluation`, body),
  talent: query => request(`/company/talent?${query}`),
  saveStudent: (id, note) => post(`/company/saved-students/${encodeURIComponent(id)}`, { note: note || null }),
};
