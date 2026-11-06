import React, { useEffect, useRef, useState } from 'react';
import { studentApi } from './studentApi.js';
import { errorMessage, formatDate, PageTitle, StudentIcon } from './StudentUI.jsx';
import './student-settings.css';

// Same rule the server enforces (validatePassword) and sign-up shows.
export const passwordRule = 'Use at least 12 characters with uppercase, lowercase, a number and a special character.';
export const passwordValid = value => value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value);

export function PasswordStrength({ value }) {
  const score = [value.length >= 12, /[A-Z]/.test(value), /[a-z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length;
  const label = !value ? '' : score <= 2 ? 'Weak' : score < 5 ? 'Getting there' : 'Strong';
  return <div className="ss-strength" aria-live="polite">
    <div className="ss-strength-track"><span className={`ss-strength-bar ss-strength-${score <= 2 ? 'weak' : score < 5 ? 'mid' : 'strong'}`} style={{ transform: `scaleX(${value ? score / 5 : 0})` }} /></div>
    <small>{label ? `Strength: ${label}. ` : ''}{passwordRule}</small>
  </div>;
}

// Mirrors the Overview completion calculation (10 profile fields).
const completionOf = profile => profile
  ? Math.round([profile.fullName, profile.college, profile.degree, profile.graduationYear, profile.about, profile.location, profile.skills?.length, profile.githubUrl, profile.linkedinUrl, profile.portfolioUrl].filter(Boolean).length / 10 * 100)
  : 0;

function ConfirmDialog({ open, title, confirmLabel, busy, onConfirm, onCancel, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="ss-dialog" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }} aria-labelledby="ss-dialog-title">
    <h2 id="ss-dialog-title">{title}</h2>
    <p>{children}</p>
    <div className="ss-dialog-actions">
      <button type="button" className="sp-button sp-button-secondary" onClick={onCancel} disabled={busy}>Cancel</button>
      <button type="button" className="sp-button ss-button-danger" onClick={onConfirm} disabled={busy}>{busy ? 'Signing out…' : confirmLabel}</button>
    </div>
  </dialog>;
}

export function StudentSettingsPage({ session, profile, onLogout, onProfileSaved, notify }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmation: '' });
  const [passwordError, setPasswordError] = useState('');
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [confirmAll, setConfirmAll] = useState(false);
  const [allBusy, setAllBusy] = useState(false);
  const [visibleBusy, setVisibleBusy] = useState(false);
  const set = key => event => setForm(current => ({ ...current, [key]: event.target.value }));
  const completion = completionOf(profile);

  async function changePassword(event) {
    event.preventDefault(); setPasswordError('');
    if (!form.currentPassword) return setPasswordError('Enter your current password.');
    if (!passwordValid(form.newPassword)) return setPasswordError(passwordRule);
    if (form.newPassword !== form.confirmation) return setPasswordError('The new passwords do not match.');
    setPasswordBusy(true);
    try {
      await studentApi.changePassword({ currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirmation: '' });
      notify('success', 'Password changed. Your other devices were signed out.');
    } catch (error) { setPasswordError(errorMessage(error)); }
    finally { setPasswordBusy(false); }
  }

  async function signOutEverywhere() {
    setAllBusy(true);
    try { await studentApi.logoutAll(); await onLogout(); }
    catch (error) { notify('error', errorMessage(error)); setConfirmAll(false); }
    finally { setAllBusy(false); }
  }

  async function toggleVisibility(event) {
    const profileVisible = event.target.checked;
    setVisibleBusy(true);
    try {
      const result = await studentApi.updateProfile({ ...profile, skills: profile.skills || [], profileVisible });
      onProfileSaved(result.profile);
      notify('success', profileVisible ? 'Companies can find you in Talent Discovery.' : 'You are hidden from Talent Discovery.');
    } catch (error) { notify('error', errorMessage(error)); }
    finally { setVisibleBusy(false); }
  }

  return <div className="ss-page">
    <PageTitle eyebrow="ACCOUNT & SESSION" title="Settings" description="Manage your sign-in, devices and how companies can find you." />

    <section className="ss-card" aria-labelledby="ss-account">
      <h2 id="ss-account">Account details</h2>
      <dl className="ss-details">
        <div><dt>Email</dt><dd>{session.email}</dd></div>
        <div><dt>Email status</dt><dd>Verified</dd></div>
        <div><dt>Member since</dt><dd>{profile?.createdAt ? formatDate(profile.createdAt) : 'Not yet — create your profile'}</dd></div>
        <div><dt>Profile completion</dt><dd>{completion}%</dd></div>
      </dl>
    </section>

    <section className="ss-card" aria-labelledby="ss-password">
      <h2 id="ss-password">Change password</h2>
      <p className="ss-help">Changing it signs you out of every other device.</p>
      <form className="ss-form" onSubmit={changePassword} noValidate>
        <label className="ss-field"><span>Current password</span><input type="password" autoComplete="current-password" value={form.currentPassword} onChange={set('currentPassword')} maxLength={128} /></label>
        <label className="ss-field"><span>New password</span><input type="password" autoComplete="new-password" value={form.newPassword} onChange={set('newPassword')} maxLength={128} /></label>
        <PasswordStrength value={form.newPassword} />
        <label className="ss-field"><span>Confirm new password</span><input type="password" autoComplete="new-password" value={form.confirmation} onChange={set('confirmation')} maxLength={128} /></label>
        {passwordError && <div className="student-alert student-alert-error" role="alert">{passwordError}</div>}
        <div><button className="sp-button sp-button-primary" type="submit" disabled={passwordBusy}>{passwordBusy ? 'Updating…' : 'Update password'}</button></div>
      </form>
    </section>

    <section className="ss-card" aria-labelledby="ss-visibility">
      <h2 id="ss-visibility">Talent Discovery</h2>
      <label className="ss-switch-row">
        <span><strong>Show me in company Talent Discovery</strong><small>{profile ? 'When off, companies cannot find your profile in talent search.' : 'Create your profile first to control this setting.'}</small></span>
        <input type="checkbox" role="switch" className="ss-switch" checked={profile ? profile.profileVisible !== false : false} onChange={toggleVisibility} disabled={!profile || visibleBusy} />
      </label>
    </section>

    <section className="ss-card" aria-labelledby="ss-sessions">
      <h2 id="ss-sessions">Sessions</h2>
      <div className="ss-row">
        <div><strong>Sign out of all devices</strong><small>Ends every session on every device, including this one.</small></div>
        <button className="sp-button ss-button-danger-outline" onClick={() => setConfirmAll(true)}>Sign out everywhere</button>
      </div>
      <div className="ss-row">
        <div><strong>Sign out of this device</strong><small>Other devices stay signed in.</small></div>
        <button className="sp-button sp-button-secondary" onClick={onLogout}><StudentIcon name="logout" size={16} /> Sign out</button>
      </div>
    </section>

    <ConfirmDialog open={confirmAll} title="Sign out of all devices?" confirmLabel="Sign out everywhere" busy={allBusy} onConfirm={signOutEverywhere} onCancel={() => setConfirmAll(false)}>
      This ends every active session, including this one, on every device you have signed in on. You will need to sign in again here too.
    </ConfirmDialog>
  </div>;
}
