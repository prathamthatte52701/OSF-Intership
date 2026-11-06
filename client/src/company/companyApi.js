const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const headers = { ...(options.body && typeof options.body === 'string' ? jsonHeaders : {}), ...options.headers };
  const response = await fetch(`/api${path}`, { credentials: 'include', ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
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
  closeChallenge: id => post(`/company/challenges/${encodeURIComponent(id)}/close`),
  assessments: () => request('/company/assessments'),
  createAssessment: body => post('/company/assessments', body),
  updateAssessment: (id, body) => put(`/company/assessments/${encodeURIComponent(id)}`, body),
  addQuestion: (id, body) => post(`/company/assessments/${encodeURIComponent(id)}/questions`, body),
  updateQuestion: (id, qid, body) => put(`/company/assessments/${encodeURIComponent(id)}/questions/${encodeURIComponent(qid)}`, body),
  deleteQuestion: (id, qid) => request(`/company/assessments/${encodeURIComponent(id)}/questions/${encodeURIComponent(qid)}`, { method: 'DELETE' }),
  publishAssessment: id => post(`/company/assessments/${encodeURIComponent(id)}/publish`),
  closeAssessment: id => post(`/company/assessments/${encodeURIComponent(id)}/close`),
  assessmentAttempts: id => request(`/company/assessments/${encodeURIComponent(id)}/attempts`),
  assessmentAttempt: id => request(`/company/assessment-attempts/${encodeURIComponent(id)}`),
  evaluateAttempt: (id, body) => put(`/company/assessment-attempts/${encodeURIComponent(id)}/evaluation`, body),
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
};
