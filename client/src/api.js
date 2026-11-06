async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const retryAfter = Number(response.headers.get('Retry-After')) || 0;
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    const error = new Error(response.status === 429
      ? `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`
      : result.error || 'The request could not be completed.');
    error.status = response.status;
    error.retryAfter = retryAfter;
    if (response.status === 401) handleUnauthorized('company', path);
    throw error;
  }
  return result;
}

/* Global 401 hook: a stale session anywhere in a portal sends the user to that portal's login with a return path.
   Auth endpoints are skipped (a wrong password is also a 401). A full navigation also drops all in-memory session state. */
export function handleUnauthorized(kind, apiPath) {
  if (/^\/(student\/)?auth\//.test(apiPath) || apiPath.startsWith('/registrations')) return;
  const loginPath = kind === 'student' ? '/student/login' : '/login';
  if (location.pathname === loginPath) return;
  const here = location.pathname + location.search;
  location.assign(`${loginPath}?next=${encodeURIComponent(here)}`);
}

/* Returns the ?next= return path only when it stays inside the given portal prefix. */
export function returnPath(prefix) {
  const next = new URLSearchParams(location.search).get('next') || '';
  return next.startsWith(prefix) && !next.startsWith('//') && !next.includes('\\') ? next : null;
}

const post = (path, body) => request(path, { method: 'POST', body: JSON.stringify(body) });

export const api = {
  register: body => post('/registrations', body),
  resendOtp: id => post(`/registrations/${encodeURIComponent(id)}/resend-otp`, {}),
  verifyEmail: (id, otp) => post(`/registrations/${encodeURIComponent(id)}/verify-email`, { otp }),
  resendSetup: id => post(`/registrations/${encodeURIComponent(id)}/resend-setup`, {}),
  resendPasswordSetup: email => post('/auth/resend-password-setup', { email }),
  setupPassword: (token, password, confirmation) => post('/auth/setup-password', { token, password, confirmation }),
  login: (userId, password) => post('/auth/login', { userId, password }),
  session: () => request('/auth/session'),
  logout: () => post('/auth/logout', {}),
  profile: () => request('/company/profile'),
  updateProfile: body => post('/company/profile', body),
  changePassword: body => post('/auth/change-password', body),
};
