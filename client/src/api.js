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
    throw error;
  }
  return result;
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
