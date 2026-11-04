async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    credentials: 'include',
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'The request could not be completed.');
    error.status = response.status;
    error.retryAfter = Number(response.headers.get('Retry-After')) || 0;
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
  changePassword: body => post('/auth/change-password', body),
};
