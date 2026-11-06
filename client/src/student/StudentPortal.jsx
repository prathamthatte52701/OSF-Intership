import React, { useEffect, useState } from 'react';
import { studentApi } from './studentApi.js';
import { errorMessage, LoadingState, StudentIcon } from './StudentUI.jsx';
import {
  ApplicationDetailsPage, ExploreChallengesPage, SkillVerificationPage,
  AssessmentPage, MyApplicationsPage, StudentOverviewPage, StudentProfilePage, StudentSettingsPage,
} from './StudentPages.jsx';
import StudentChallengeDetail from './StudentChallengeDetail.jsx';
import './student.css';
import './student-auth.css';

const menu = [
  { label: 'Overview', path: '/student/dashboard', icon: 'dashboard' },
  { label: 'My profile', path: '/student/profile', icon: 'user' },
  { label: 'Explore challenges', path: '/student/challenges', icon: 'search' },
  { label: 'My applications', path: '/student/applications', icon: 'briefcase' },
  { label: 'Skill verification', path: '/student/skills', icon: 'medal' },
  { label: 'Settings', path: '/student/settings', icon: 'settings' },
];

const authPaths = new Set(['/student/login', '/student/register', '/student/verify-email']);

export default function StudentPortal({ path, go }) {
  const [session, setSession] = useState(null);
  const [pendingEmail, setPendingEmail] = useState('');
  const [sessionLoading, setSessionLoading] = useState(true);
  const [sessionError, setSessionError] = useState('');
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    let active = true;
    studentApi.session()
      .then(result => { if (active) { setSession(result); setSessionError(''); } })
      .catch(error => { if (active && error.status !== 401) setSessionError(errorMessage(error)); })
      .finally(() => { if (active) setSessionLoading(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (sessionLoading || sessionError) return;
    if (session && authPaths.has(path)) { go('/student/dashboard'); return; }
    if (!session && !authPaths.has(path)) { go('/student/login'); return; }
    if (!authPaths.has(path) && path !== '/student' && path !== '/student/dashboard'
      && !/^\/student\/(profile|challenges|applications|skills|settings)(\/|$)/.test(path)
      && !/^\/student\/assessments\/[^/]+$/.test(path)) go('/student/dashboard');
  }, [path, session, sessionLoading, sessionError]);

  useEffect(() => {
    if (!session) { setProfile(null); return undefined; }
    let active = true;
    setProfileLoading(true); setProfileError('');
    studentApi.profile()
      .then(result => { if (active) setProfile(result.profile); })
      .catch(error => { if (active) setProfileError(errorMessage(error)); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [session?.email]);

  const notify = (tone, message) => {
    setNotice({ tone, message });
    window.setTimeout(() => setNotice(current => current?.message === message ? null : current), 4200);
  };

  async function logout() {
    try {
      await studentApi.logout();
      setSession(null); setProfile(null); go('/student/login');
    } catch (error) {
      notify('error', errorMessage(error));
    }
  }

  if (sessionLoading) return <div className="student-root"><LoadingState label="Checking your student session…" /></div>;
  if (sessionError) return <div className="student-root"><div className="student-auth-wrap"><div className="student-auth-card"><img className="student-auth-logo" src="/landing/osf-brand.png" alt="Our Startup Freelancer" /><h1>Student Portal</h1><p className="student-muted">We couldn’t check your session right now.</p><div className="student-alert student-alert-error" role="alert">{sessionError}</div><button className="sp-button sp-button-primary sp-button-wide" onClick={() => { setSessionError(''); setSessionLoading(true); studentApi.session().then(setSession).catch(error => { if (error.status !== 401) setSessionError(errorMessage(error)); }).finally(() => setSessionLoading(false)); }}>Try again</button></div></div></div>;

  if (!session) {
    return <AuthPage path={path} go={go} onLogin={setSession} notify={notify} pendingEmail={pendingEmail} setPendingEmail={setPendingEmail} />;
  }

  if (profileLoading && !profile && !profileError) return <div className="student-root"><LoadingState label="Loading your profile…" /></div>;

  const updateProfile = nextProfile => { setProfile(nextProfile); setProfileError(''); };
  const refreshProfile = async () => {
    const result = await studentApi.profile();
    setProfile(result.profile); setProfileError('');
    return result.profile;
  };
  const activeLabel = menu.find(item => path === item.path || (path.startsWith(item.path + '/') && item.path !== '/student/dashboard'))?.label
    || (path.startsWith('/student/challenges/') ? 'Explore challenges' : path.startsWith('/student/applications/') ? 'My applications' : path.startsWith('/student/assessments/') ? 'Skill verification' : 'Overview');

  return (
    <div className="student-root">
      <div className="student-shell">
        <aside className="student-sidebar">
          <a className="student-brand" href="/" onClick={event => { event.preventDefault(); go('/'); }} aria-label="OSF home"><img src="/landing/osf-brand.png" alt="Our Startup Freelancer" /></a>
          <div className="student-nav-caption">STUDENT WORKSPACE</div>
          <nav className="student-nav" aria-label="Student portal navigation">
            {menu.map(item => <button key={item.path} className={`student-nav-item ${activeLabel === item.label ? 'is-active' : ''}`} onClick={() => go(item.path)}><StudentIcon name={item.icon} /><span>{item.label}</span></button>)}
          </nav>
          <div className="student-sidebar-bottom">
            <button className="student-account-badge" aria-label="Open my profile" onClick={() => go('/student/profile')}><span className="student-avatar">{(profile?.fullName || session.email || 'S').charAt(0).toUpperCase()}</span><span className="student-account-copy"><strong>{profile?.fullName || 'Student account'}</strong><small>{session.email}</small></span><StudentIcon name="chevron" size={16} /></button>
            <button className="student-signout" onClick={logout}><StudentIcon name="logout" size={17} /> Sign out</button>
          </div>
        </aside>

        <div className="student-main">
          <header className="student-topbar"><div><span className="student-topbar-kicker">OSF · STUDENT PORTAL</span><strong>{activeLabel}</strong></div><div className="student-topbar-right"><span className="student-session-email">{session.email}</span><button className="student-mobile-signout" onClick={logout} aria-label="Sign out"><StudentIcon name="logout" /></button></div></header>
          <nav className="student-mobile-nav" aria-label="Student portal navigation">
            {menu.map(item => <button key={item.path} title={item.label} aria-label={item.label} className={activeLabel === item.label ? 'is-active' : ''} onClick={() => go(item.path)}><StudentIcon name={item.icon} size={19} /><span>{item.label}</span></button>)}
          </nav>
          <main className="student-content">
            {profileError && <div className="student-alert student-alert-error" role="alert">{profileError} <button onClick={refreshProfile}>Retry</button></div>}
            {path === '/student' || path === '/student/dashboard' ? <StudentOverviewPage profile={profile} session={session} go={go} />
              : path === '/student/profile' ? <StudentProfilePage profile={profile} profileLoading={profileLoading} onSaved={updateProfile} onRefresh={refreshProfile} notify={notify} />
                : path === '/student/challenges' ? <ExploreChallengesPage go={go} />
                  : path.startsWith('/student/challenges/') ? <StudentChallengeDetail challengeId={path.split('/')[3]} go={go} notify={notify} profile={profile} profileLoading={profileLoading} />
                    : path === '/student/applications' ? <MyApplicationsPage go={go} />
                      : path.startsWith('/student/applications/') ? <ApplicationDetailsPage applicationId={path.split('/')[3]} go={go} notify={notify} />
                        : path === '/student/skills' ? <SkillVerificationPage go={go} />
                          : path.startsWith('/student/assessments/') ? <AssessmentPage assessmentId={path.split('/')[3]} go={go} notify={notify} />
                            : <StudentSettingsPage session={session} profile={profile} onLogout={logout} />}
          </main>
          <footer className="student-footer"><span>© {new Date().getFullYear()} Our Startup Freelancer</span><span>Build · Launch · Scale</span></footer>
        </div>
      </div>
      {notice && <div className={`student-toast student-toast-${notice.tone}`} role={notice.tone === 'error' ? 'alert' : 'status'}>{notice.message}</div>}
    </div>
  );
}

function AuthPage({ path, go, onLogin, notify, pendingEmail, setPendingEmail }) {
  const isRegister = path === '/student/register';
  const isVerify = path === '/student/verify-email';
  const [email, setEmail] = useState(() => new URLSearchParams(location.search).get('email') || pendingEmail || '');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [otp, setOtp] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (!cooldown) return undefined;
    const timer = window.setInterval(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function submit(event) {
    event.preventDefault(); setError(''); setMessage('');
    if (isVerify && (!/^\S+@\S+\.\S+$/.test(email.trim()) || !/^\d{6}$/.test(otp))) return setError('Enter your account email and six-digit code.');
    if (isRegister) {
      if (password.length < 12 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) return setError('Use 12 or more characters with uppercase, lowercase, a number, and a special character.');
      if (password !== confirmation) return setError('The passwords do not match.');
    }
    setBusy(true);
    try {
      if (isRegister) {
        const result = await studentApi.register({ email: email.trim(), password });
        setEmail(result.email);
        const note = result.emailDelivery === 'failed' ? 'Your account was created, but the email could not be sent. You can retry verification.' : 'Verification code sent. Check your email.';
        notify(result.emailDelivery === 'failed' ? 'error' : 'success', note);
        setPendingEmail(result.email);
        setEmail(result.email);
        go('/student/verify-email');
      } else if (isVerify) {
        await studentApi.verifyEmail(email.trim(), otp);
        go('/student/login');
        notify('success', 'Email verified. Sign in to continue.');
      } else {
        const result = await studentApi.login({ email: email.trim(), password });
        onLogin(result);
        go('/student/dashboard');
      }
    } catch (submitError) { setError(submitError.message || 'The request could not be completed.'); }
    finally { setBusy(false); }
  }

  async function resend() {
    setError(''); setMessage(''); setBusy(true);
    try {
      await studentApi.resendOtp(email.trim());
      setCooldown(60); setMessage('If the account is eligible, a new verification code will be sent.');
    } catch (resendError) { setError(resendError.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="student-auth-wrap student-auth-split">
      <aside className="sa-brand">
        <img className="sa-brand-logo" src="/landing/osf-brand.png" alt="Our Startup Freelancer" />
        <div className="sa-brand-body">
          <h2>Turn your skills into real startup experience</h2>
          <ul className="sa-benefits">
            <li>Build your profile</li>
            <li>Apply to real company challenges</li>
            <li>Get rated and shortlisted</li>
          </ul>
        </div>
        <div className="sa-preview" aria-hidden="true">
          <div className="sa-preview-head"><span className="sa-preview-dot" /><span className="sa-preview-line sa-w60" /></div>
          <div className="sa-preview-line sa-w90" /><div className="sa-preview-line sa-w40" />
          <div className="sa-preview-row"><span className="sa-preview-chip" /><span className="sa-preview-chip" /><span className="sa-preview-badge" /></div>
        </div>
      </aside>
      <main className="sa-main">
      <a className="student-auth-home" href="/" onClick={event => { event.preventDefault(); go('/'); }}>← OSF home</a>
      <div className="student-auth-card">
        <img className="student-auth-logo" src="/landing/osf-brand.png" alt="Our Startup Freelancer" />
        <span className="sp-eyebrow">STUDENT PORTAL</span>
        <h1>{isRegister ? 'Create your account' : isVerify ? 'Verify your email' : 'Welcome back'}</h1>
        <p className="student-auth-subtitle">{isRegister ? 'Build your profile and find opportunities that match your skills.' : isVerify ? 'Enter the six-digit code sent to your email address.' : 'Sign in to continue to your OSF student workspace.'}</p>
        <form onSubmit={submit} className="student-auth-form">
          <label className="sp-field"><span>Email address</span><input type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} required maxLength={254} disabled={isVerify && Boolean(new URLSearchParams(location.search).get('email'))} /></label>
          {isVerify ? <label className="sp-field"><span>Verification code</span><input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, '').slice(0, 6))} required aria-describedby="student-otp-help" /><small id="student-otp-help">The code expires after five minutes.</small></label>
            : <label className="sp-field"><span>Password</span><input type="password" autoComplete={isRegister ? 'new-password' : 'current-password'} value={password} onChange={event => setPassword(event.target.value)} required minLength={isRegister ? 12 : undefined} maxLength={128} />{isRegister && <small>At least 12 characters, including uppercase, lowercase, number and special character.</small>}{isRegister && <StrengthMeter password={password} />}</label>}
          {isRegister && <label className="sp-field"><span>Confirm password</span><input type="password" autoComplete="new-password" value={confirmation} onChange={event => setConfirmation(event.target.value)} required minLength={12} maxLength={128} /></label>}
          {error && <div className="student-alert student-alert-error" role="alert">{error}</div>}
          {message && <div className="student-alert student-alert-success" role="status">{message}</div>}
          <button className="sp-button sp-button-primary sp-button-wide" type="submit" disabled={busy}>{busy ? <><span className="sa-spinner" aria-hidden="true" />Please wait…</> : isRegister ? 'Create student account' : isVerify ? 'Verify email' : 'Sign in'}</button>
        </form>
        {!isRegister && !isVerify && <a className="sa-forgot" href="/student/forgot-password" onClick={event => { event.preventDefault(); go('/student/forgot-password'); }}>Forgot password?</a>}
        {isVerify && <button className="student-text-button student-resend" onClick={resend} disabled={busy || cooldown > 0}>{cooldown ? `Resend code in ${cooldown}s` : 'Resend verification code'}</button>}
        <div className="student-auth-switch">{isRegister ? <>Already have an account? <button onClick={() => go('/student/login')}>Sign in</button></> : isVerify ? <>Wrong email? <button onClick={() => go('/student/register')}>Start again</button></> : <>New to OSF? <button onClick={() => go('/student/register')}>Create a student account</button></>}</div>
        <a className="student-company-link" href="/login" onClick={event => { event.preventDefault(); go('/login'); }}>Looking for the company portal? Sign in here</a>
      </div>
      <p className="student-auth-legal">Your account is secured with an OSF session cookie. We never store your session token in browser storage.</p>
      </main>
    </div>
  );
}

// Visual only: mirrors the five rules enforced in submit() above.
function StrengthMeter({ password }) {
  const met = [password.length >= 12, /[A-Z]/.test(password), /[a-z]/.test(password), /\d/.test(password), /[^A-Za-z0-9]/.test(password)].filter(Boolean).length;
  const label = !password ? '' : met < 3 ? 'Weak' : met < 5 ? 'Almost there' : 'Meets all requirements';
  return <span className="sa-meter" data-level={password ? met : 0} role="status" aria-live="polite"><span className="sa-meter-bar" aria-hidden="true"><i /><i /><i /><i /><i /></span><span className="sa-meter-label">{label}</span></span>;
}
