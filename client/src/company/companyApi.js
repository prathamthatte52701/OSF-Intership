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

export const companyApi = {
  challenges: () => request('/company/challenges'),
  createChallenge: body => post('/company/challenges', body),
  updateChallenge: (id, body) => put(`/company/challenges/${encodeURIComponent(id)}`, body),
  publishChallenge: id => post(`/company/challenges/${encodeURIComponent(id)}/publish`),
  closeChallenge: id => post(`/company/challenges/${encodeURIComponent(id)}/close`),
};
