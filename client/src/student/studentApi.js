const jsonHeaders = { 'Content-Type': 'application/json' };

async function request(path, options = {}) {
  const headers = { ...(options.body && typeof options.body === 'string' ? jsonHeaders : {}), ...options.headers };
  const response = await fetch(`/api${path}`, { credentials: 'include', ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || 0;
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    const error = new Error(response.status === 429
      ? `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      : result.error || 'The request could not be completed.');
    error.status = response.status;
    error.retryAfter = retryAfter;
    throw error;
  }
  return result;
}

const post = (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) });
const put = (path, body) => request(path, { method: 'PUT', body: JSON.stringify(body) });

export const studentApi = {
  register: ({ email, password }) => post('/student/auth/register', { email, password }),
  verifyEmail: (email, otp) => post('/student/auth/verify-email', { email, otp }),
  resendOtp: email => post('/student/auth/resend-otp', { email }),
  login: ({ email, password }) => post('/student/auth/login', { email, password }),
  session: () => request('/student/auth/session'),
  logout: () => post('/student/auth/logout'),
  profile: () => request('/student/profile'),
  updateProfile: profile => put('/student/profile', profile),
  createProject: project => post('/student/projects', project),
  updateProject: (id, project) => put(`/student/projects/${encodeURIComponent(id)}`, project),
  deleteProject: id => request(`/student/projects/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  challenges: ({ skills = '' } = {}) => request(`/challenges${skills ? `?${new URLSearchParams({ skills })}` : ''}`),
  challenge: id => request(`/challenges/${encodeURIComponent(id)}`),
  applications: () => request('/student/applications'),
  apply: challengeId => post(`/student/challenges/${encodeURIComponent(challengeId)}/applications`),
  startApplication: id => post(`/student/applications/${encodeURIComponent(id)}/start`),
  submission: id => request(`/student/applications/${encodeURIComponent(id)}/submission`),
  downloadFile: async id => {
    const response = await fetch(`/api/student/applications/${encodeURIComponent(id)}/file`, { credentials: 'include' });
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.error || 'The file could not be downloaded.');
      error.status = response.status;
      throw error;
    }
    const disposition = response.headers.get('Content-Disposition') || '';
    const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    const basicName = disposition.match(/filename="?([^";]+)"?/i)?.[1];
    let filename = 'submission-file';
    try { filename = encodedName ? decodeURIComponent(encodedName) : basicName || filename; } catch { filename = basicName || filename; }
    return { blob: await response.blob(), filename };
  },
  uploadFile: async (applicationId, file) => {
    const types = { '.pdf': 'application/pdf', '.txt': 'text/plain', '.zip': 'application/zip', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg' };
    const extension = `.${file.name.split('.').pop()?.toLowerCase() || ''}`;
    const mimeType = file.type || types[extension] || '';
    const safeName = file.name.replace(/[^\x20-\x7e]/g, '_').slice(0, 180);
    return request(`/student/applications/${encodeURIComponent(applicationId)}/file`, {
      method: 'PUT', body: file, headers: { 'Content-Type': mimeType || 'application/octet-stream', 'X-File-Name': safeName, 'X-File-Mime': mimeType },
    });
  },
  submitWork: (id, submission) => put(`/student/applications/${encodeURIComponent(id)}/submission`, submission),
  assessments: () => request('/student/assessments'),
  assessment: id => request(`/student/assessments/${encodeURIComponent(id)}`),
  attempts: () => request('/student/assessment-attempts'),
  attempt: id => request(`/student/assessment-attempts/${encodeURIComponent(id)}`),
  startAttempt: assessmentId => post(`/student/assessments/${encodeURIComponent(assessmentId)}/attempts`),
  saveAnswers: (attemptId, answers) => put(`/student/assessment-attempts/${encodeURIComponent(attemptId)}/answers`, { answers, finalize: false }),
  submitAnswers: (attemptId, answers) => put(`/student/assessment-attempts/${encodeURIComponent(attemptId)}/answers`, { answers, finalize: true }),
};
