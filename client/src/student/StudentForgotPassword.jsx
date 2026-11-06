import React, { useState } from 'react';
import { studentApi } from './studentApi.js';
import { errorMessage } from './StudentUI.jsx';
import { passwordRule, passwordValid, PasswordStrength } from './StudentSettings.jsx';

export default function StudentForgotPasswordPage({ go, notify }) {
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  async function sendCode(event) {
    event.preventDefault(); setError(''); setInfo('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter the email address you signed up with.');
    setBusy(true);
    try {
      const result = await studentApi.forgotPassword(email.trim());
      setInfo(result.message); setStep(2);
    } catch (sendError) { setError(errorMessage(sendError)); }
    finally { setBusy(false); }
  }

  async function reset(event) {
    event.preventDefault(); setError('');
    if (!/^\d{6}$/.test(otp)) return setError('Enter the six-digit code from your email.');
    if (!passwordValid(password)) return setError(passwordRule);
    if (password !== confirmation) return setError('The passwords do not match.');
    setBusy(true);
    try {
      await studentApi.resetPassword({ email: email.trim(), otp, newPassword: password });
      go('/student/login');
      notify('success', 'Password reset. Sign in with your new password.');
    } catch (resetError) { setError(errorMessage(resetError)); }
    finally { setBusy(false); }
  }

  return <div className="student-auth-wrap">
    <a className="student-auth-home" href="/student/login" onClick={event => { event.preventDefault(); go('/student/login'); }}>← Back to sign in</a>
    <div className="student-auth-card">
      <img className="student-auth-logo" src="/landing/osf-brand.png" alt="Our Startup Freelancer" />
      <span className="sp-eyebrow">STUDENT PORTAL</span>
      <h1>{step === 1 ? 'Reset your password' : 'Enter your reset code'}</h1>
      <p className="student-auth-subtitle">{step === 1 ? 'We will email a six-digit code to your account address.' : 'Enter the code we emailed you and choose a new password. The code expires in five minutes.'}</p>
      {step === 1
        ? <form onSubmit={sendCode} className="student-auth-form" noValidate>
          <label className="sp-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} /></label>
          {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}
          <button className="sp-button sp-button-primary sp-button-wide" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send reset code'}</button>
        </form>
        : <form onSubmit={reset} className="student-auth-form" noValidate>
          {info && <div className="student-alert student-alert-success" role="status">{info}</div>}
          <label className="sp-field"><span>Reset code</span><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} /></label>
          <label className="sp-field"><span>New password</span><input type="password" autoComplete="new-password" value={password} onChange={event => setPassword(event.target.value)} maxLength={128} /></label>
          <PasswordStrength value={password} />
          <label className="sp-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={128} /></label>
          {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}
          <button className="sp-button sp-button-primary sp-button-wide" type="submit" disabled={busy}>{busy ? 'Resetting…' : 'Reset password'}</button>
          <button type="button" className="student-text-button" onClick={() => { setStep(1); setError(''); setOtp(''); }}>Use a different email or resend the code</button>
        </form>}
    </div>
  </div>;
}
