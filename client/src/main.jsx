import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import CompanyProfile from './CompanyProfile.jsx';
import ContactUs from './ContactUs.jsx';
import LandingPage from './LandingPage.jsx';
import { citiesForState, INDIAN_STATES, normalizeIndianPhone } from './india.js';
import { api } from './api.js';
import './styles.css';

/* SVG Icon Component */
const iconPaths = {
  ArrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
  ArrowRight: 'M5 12h14 M12 5l7 7-7 7',
  Building2: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01 M14 9v.01 M14 12v.01',
  Check: 'M20 6 9 17l-5-5',
  CheckCircle2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  ChevronDown: 'm6 9 6 6 6-6',
  CircleHelp: 'M9.09 9a3 3 0 0 1 5.82 1c0 2-3 3-3 3 M12 17h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  Clock3: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  Eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  EyeOff: 'm3 3 18 18 M10.6 10.6a2 2 0 0 0 2.8 2.8 M9.9 5.2A10 10 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3 3.8 M6.6 6.6C3.6 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.8',
  FileCheck2: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13l2 2 4-4',
  Globe2: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M2 12h20 M12 2a15 15 0 0 1 0 20 M12 2a15 15 0 0 0 0 20',
  LayoutDashboard: 'M3 3h8v8H3z M13 3h8v5h-8z M13 10h8v11h-8z M3 13h8v8H3z',
  LogOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  Mail: 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M22 6l-10 7L2 6',
  MapPin: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
  Moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z',
  MoreHorizontal: 'M12 12h.01 M19 12h.01 M5 12h.01',
  Search: 'm21 21-4.3-4.3 M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  ShieldCheck: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z M9 12l2 2 4-4',
  Sun: 'M12 2v2 M12 20v2 M4.93 4.93l1.42 1.42 M17.65 17.65l1.42 1.42 M2 12h2 M20 12h2 M4.93 19.07l1.42-1.42 M17.65 6.35l1.42-1.42 M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z',
  UserRound: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
  X: 'M18 6 6 18 M6 6l12 12',
  AlertCircle: 'M12 8v4 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};

function Icon({ name, size = 18, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {(iconPaths[name] || '').split(' M').map((d, i) => (
        <path key={i} d={(i ? 'M' : '') + d} />
      ))}
    </svg>
  );
}

const EMPTY_FORM = {
  company: '',
  pan: '',
  msme: '',
  address1: '',
  address2: '',
  country: 'India',
  state: '',
  city: '',
  postal: '',
  contact: '',
  email: '',
  phone: '',
};

const PASSWORD_RULES = {
  min: 12,
  upper: /[A-Z]/,
  lower: /[a-z]/,
  number: /\d/,
  special: /[^A-Za-z0-9]/,
};

const apiMode = import.meta.env.VITE_AUTH_MODE !== 'mock';
const startPath = location.pathname;

function tabForPath(path) {
  if (path.endsWith('/company')) return 'Company Profile';
  if (path.endsWith('/account')) return 'Account Information';
  if (path.endsWith('/activity')) return 'Activity';
  return 'Overview';
}

function titleCaseName(value) {
  return value
    .toLocaleLowerCase()
    .split(/([ '\-.])/)
    .map(part => (part && /[\p{L}]/u.test(part) ? part[0].toLocaleUpperCase() + part.slice(1) : part))
    .join('');
}

function maskEmail(email = '') {
  const [u, d = ''] = email.split('@');
  return u ? `${u.slice(0, 2)}${'•'.repeat(Math.max(2, u.length - 2))}@${d}` : 'your email';
}

function toUiProfile(company) {
  if (!company) return EMPTY_FORM;
  return {
    company: company.companyName || '',
    pan: company.pan || '',
    msme: company.msme || '',
    address1: company.address1 || '',
    address2: company.address2 || '',
    country: company.country || 'India',
    countryCode: company.countryCode || 'IN',
    state: company.state || '',
    city: company.city || '',
    postal: company.postal || '',
    contact: company.contactName || '',
    email: company.email || '',
    phone: company.phone || '',
    registeredAt: company.registeredAt || null,
    emailVerified: company.emailVerified === true || company.emailVerified === 1,
  };
}

function App() {
  const [page, setPage] = useState(startPath);
  const [dark, setDark] = useState(() => {
    try {
      const q = new URLSearchParams(location.search).get('theme');
      if (q === 'dark') return true;
      if (q === 'light') return false;
      return localStorage.getItem('osf-theme') === 'dark';
    } catch {
      return false;
    }
  });

  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState({});

  const [account, setAccount] = useState(null);
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(apiMode);

  const [cityOptions, setCityOptions] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  const [pendingRegistration, setPendingRegistration] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('osf-pending-registration') || 'null');
    } catch {
      return null;
    }
  });

  const [emailDeliveryFailed, setEmailDeliveryFailed] = useState(false);
  const [verifiedRegistration, setVerifiedRegistration] = useState(null);

  const [otpInput, setOtpInput] = useState('');
  const [otpExpiry, setOtpExpiry] = useState(0);
  const [cooldown, setCooldown] = useState(0);

  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const [loginId, setLoginId] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const [dashTab, setDashTab] = useState(() => tabForPath(startPath));

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [setupPassword, setSetupPassword] = useState('');
  const [setupConfirmation, setSetupConfirmation] = useState('');
  const [setupEmail, setSetupEmail] = useState('');
  const [showSetupRecovery, setShowSetupRecovery] = useState(false);
  const [setupRecoveryState, setSetupRecoveryState] = useState('idle');
  const [setupRecoveryMessage, setSetupRecoveryMessage] = useState('');
  const [setupRecoveryCooldown, setSetupRecoveryCooldown] = useState(0);
  const [setupLinkError, setSetupLinkError] = useState('');

  /* Sync Theme */
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem('osf-theme', dark ? 'dark' : 'light');
    } catch {}
  }, [dark]);

  /* Persist pending registration */
  useEffect(() => {
    if (pendingRegistration) {
      sessionStorage.setItem('osf-pending-registration', JSON.stringify(pendingRegistration));
    } else {
      sessionStorage.removeItem('osf-pending-registration');
    }
  }, [pendingRegistration]);

  /* Timers */
  useEffect(() => {
    const id = setInterval(() => {
      setCooldown(v => Math.max(0, v - 1));
      setSetupRecoveryCooldown(v => Math.max(0, v - 1));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  /* Toast Notification Auto-dismiss */
  useEffect(() => {
    if (notice) {
      const id = setTimeout(() => setNotice(''), 4500);
      return () => clearTimeout(id);
    }
  }, [notice]);

  /* Restore Session from API on mount */
  useEffect(() => {
    if (!apiMode) return;
    let active = true;
    api.session()
      .then(async result => {
        const profileRes = await api.profile();
        if (!active) return;
        setSession({ userId: result.userId });
        setAccount({
          userId: result.userId,
          profile: toUiProfile(profileRes.company),
        });
      })
      .catch(() => {})
      .finally(() => {
        if (active) setAuthLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const go = path => {
    history.pushState({}, '', path);
    setPage(path);
    setErrors({});
    setNotice('');
    window.scrollTo(0, 0);
  };

  const update = (key, value) => {
    setForm(f => ({ ...f, [key]: value }));
    setErrors(e => ({ ...e, [key]: '' }));
  };

  /* Route Handling & Guards */
  useEffect(() => {
    const handle = () => {
      if (apiMode && authLoading) return;
      let p = location.pathname;

      if (p.startsWith('/dashboard') && !session) {
        p = '/login';
        history.replaceState({}, '', p);
      } else if (p.startsWith('/dashboard') && account?.mustChangePassword) {
        p = '/change-password';
        history.replaceState({}, '', p);
      } else if (p === '/change-password' && !session) {
        p = '/login';
        history.replaceState({}, '', p);
      } else if (p === '/verify-email' && !pendingRegistration) {
        p = '/register';
        history.replaceState({}, '', p);
      }

      setPage(p);
      setDashTab(tabForPath(p));
      setErrors({});
    };

    handle();
    window.addEventListener('popstate', handle);
    return () => window.removeEventListener('popstate', handle);
  }, [session, account, pendingRegistration, authLoading]);

  /* State -> City Dropdown synchronization */
  useEffect(() => {
    let active = true;
    if (!form.state) {
      setCityOptions([]);
      setCitiesLoading(false);
      return () => {
        active = false;
      };
    }
    setCityOptions([]);
    setCitiesLoading(true);
    citiesForState(form.state)
      .then(cities => {
        if (active) setCityOptions(cities);
      })
      .finally(() => {
        if (active) setCitiesLoading(false);
      });
    return () => {
      active = false;
    };
  }, [form.state]);

  const notify = (type, msg) => setNotice(`${type}|${msg}`);

  const stepFields = {
    1: ['company', 'pan'],
    2: ['address1', 'country', 'state', 'city', 'postal'],
    3: ['contact', 'email', 'phone'],
  };

  function validateField(k) {
    const v = (form[k] || '').trim();
    let e = '';

    if (['company', 'address1', 'country', 'city', 'contact', 'email'].includes(k) && !v) {
      e = 'This field is required.';
    }
    if (k === 'company' && v && !/^[\p{L}\p{N}&.,'()\- ]{2,150}$/u.test(v.replace(/\s+/g, ' '))) {
      e = 'Use 2–150 characters, with common business punctuation.';
    }
    if (k === 'pan' && v && !/^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/i.test(v)) {
      e = 'Enter a valid 10-character Indian PAN.';
    }
    if (k === 'state' && !INDIAN_STATES.some(s => s.name === v)) {
      e = 'Select an Indian state or Union Territory.';
    }
    if (k === 'contact' && v && !/^[\p{L}][\p{L} .'-]{1,99}$/u.test(v)) {
      e = 'Enter a valid full name using letters and standard punctuation.';
    }
    if (k === 'email' && v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) {
      e = 'Enter a valid corporate email address.';
    }
    if (k === 'city' && !cityOptions.includes(v)) {
      e = 'Select a valid city in the chosen Indian state or Union Territory.';
    }
    if (k === 'postal' && !/^\d{6}$/.test(v)) {
      e = 'Enter an exact 6-digit PIN Code.';
    }
    if (k === 'phone' && v && !normalizeIndianPhone(v)) {
      e = 'Enter a valid 10-digit Indian phone number.';
    }
    return e;
  }

  function validateStep(n) {
    const next = {};
    for (const k of stepFields[n]) {
      const e = validateField(k);
      if (e) next[k] = e;
    }
    setErrors(old => ({
      ...old,
      ...Object.fromEntries(stepFields[n].map(k => [k, next[k]]).filter(([, val]) => !val)),
      ...next,
    }));
    return Object.keys(next).length === 0;
  }

  function moveStep(dir) {
    if (dir > 0 && !validateStep(step)) return;
    setStep(s => Math.min(3, Math.max(1, s + dir)));
    setErrors({});
  }

  async function startVerify() {
    const normalized = {
      ...form,
      country: 'India',
      company: form.company.trim().replace(/\s+/g, ' '),
      pan: form.pan.trim().toUpperCase(),
      msme: form.msme.trim().toUpperCase(),
      email: form.email.trim().toLowerCase(),
      contact: titleCaseName(form.contact.trim().replace(/\s+/g, ' ')),
      address1: form.address1.trim().replace(/\s+/g, ' '),
      postal: form.postal.trim(),
    };
    normalized.phone = normalized.phone.trim() ? normalizeIndianPhone(normalized.phone) || normalized.phone : '';

    setForm(normalized);
    const allErrors = {};
    for (const n of [1, 2, 3]) {
      for (const k of stepFields[n]) {
        const e = validateField(k);
        if (e) allErrors[k] = e;
      }
    }
    setErrors(allErrors);
    if (Object.keys(allErrors).length) {
      setStep(
        Object.keys(allErrors).some(k => stepFields[1].includes(k))
          ? 1
          : Object.keys(allErrors).some(k => stepFields[2].includes(k))
          ? 2
          : 3
      );
      return;
    }

    setBusy(true);
    try {
      const result = await api.register({
        companyName: normalized.company,
        pan: normalized.pan,
        msme: normalized.msme,
        address1: normalized.address1,
        address2: normalized.address2,
        country: 'India',
        countryCode: 'IN',
        state: normalized.state,
        city: normalized.city,
        postal: normalized.postal,
        contactName: normalized.contact,
        email: normalized.email,
        phone: normalized.phone,
      });

      const pending = { id: result.registrationId, email: normalized.email };
      setPendingRegistration(pending);
      setEmailDeliveryFailed(result.emailDelivery !== 'sent');
      setOtpExpiry(Date.now() + 300000);
      setCooldown(60);
      go('/verify-email');
      if (result.emailDelivery !== 'sent') {
        notify('error', result.message || 'Email delivery failed. Check SMTP configuration.');
      } else {
        notify('success', 'Verification code sent to your email.');
      }
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function resendOtp() {
    if (!pendingRegistration) return notify('error', 'Registration details not found. Please register again.');
    if (cooldown > 0) return notify('error', `Please wait ${cooldown} seconds before requesting another code.`);
    setBusy(true);
    try {
      const result = await api.resendOtp(pendingRegistration.id);
      setCooldown(60);
      setOtpExpiry(Date.now() + 300000);
      setEmailDeliveryFailed(false);
      notify('success', result.message || 'A fresh verification code has been dispatched.');
    } catch (error) {
      setCooldown(60);
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function submitOtp() {
    if (!/^\d{6}$/.test(otpInput)) return notify('error', 'Enter a complete 6-digit verification code.');
    if (!pendingRegistration) return notify('error', 'Registration session expired. Please start again.');

    setBusy(true);
    try {
      const result = await api.verifyEmail(pendingRegistration.id, otpInput);
      setOtpInput('');
      if (result.emailDelivery === 'sent') {
        setPendingRegistration(null);
        setLoginId(result.userId);
        go('/login');
        notify('success', result.message || 'Email verified successfully! Sign in to continue.');
      } else {
        setVerifiedRegistration(result);
        notify('error', result.message || 'Verification complete, but password setup link delivery failed.');
      }
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function login() {
    if (!loginId.trim() || !loginPassword) return notify('error', 'Please enter both your User ID and password.');
    setBusy(true);
    try {
      const result = await api.login(loginId.trim(), loginPassword);
      const profile = await api.profile();
      setSession({ userId: result.userId });
      setAccount({
        userId: result.userId,
        profile: toUiProfile(profile.company),
      });
      go('/dashboard');
      notify('success', 'Welcome back to your workspace.');
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function changePassword() {
    setBusy(true);
    try {
      const result = await api.changePassword({
        currentPassword,
        newPassword,
        confirmation: confirmPassword,
      });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      go('/dashboard');
      notify(
        result.notification === 'sent' ? 'success' : 'error',
        result.notification === 'sent'
          ? 'Password updated. A security notification was emailed.'
          : 'Password updated, but confirmation notification could not be dispatched.'
      );
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function completeSetup() {
    const token = new URLSearchParams(location.search).get('token');
    if (!token) {
      setSetupLinkError('This password setup link is invalid or expired. Request a new setup link from sign-in.');
      return;
    }
    setBusy(true);
    setSetupLinkError('');
    try {
      const result = await api.setupPassword(token, setupPassword, setupConfirmation);
      setSetupPassword('');
      setSetupConfirmation('');
      setLoginId(result.userId);
      setPendingRegistration(null);
      go('/login');
      notify('success', 'Password created successfully! Please sign in with your User ID.');
    } catch (error) {
      if (error.status === 410) {
        setSetupLinkError('This setup link has expired or has already been used. Please request a new setup link.');
      } else {
        notify('error', error.message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function requestSetupRecovery() {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(setupEmail.trim())) {
      setSetupRecoveryState('failure');
      setSetupRecoveryMessage('Please enter a valid registered corporate email address.');
      return;
    }
    if (setupRecoveryCooldown > 0) return;
    setSetupRecoveryState('sending');
    setSetupRecoveryMessage('');
    try {
      const result = await api.resendPasswordSetup(setupEmail.trim());
      setSetupRecoveryState('success');
      setSetupRecoveryMessage(result.message || 'If an active account exists, a setup link has been dispatched.');
      setSetupRecoveryCooldown(60);
    } catch (error) {
      if (error.status === 429) {
        const wait = error.retryAfter || 60;
        setSetupRecoveryState('cooldown');
        setSetupRecoveryCooldown(wait);
        setSetupRecoveryMessage(`Rate limit active. Please wait ${wait} seconds before retrying.`);
      } else {
        setSetupRecoveryState('failure');
        setSetupRecoveryMessage(error.message || 'Unable to process request. Check your connection.');
      }
    }
  }

  async function resendSetup() {
    if (!pendingRegistration) return notify('error', 'Registration details not found.');
    setBusy(true);
    try {
      const result = await api.resendSetup(pendingRegistration.id);
      setVerifiedRegistration(null);
      notify('success', result.message || 'A new password setup link has been sent to your email.');
    } catch (error) {
      notify('error', error.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      await api.logout();
    } catch (error) {
      notify('error', 'Logout request could not be confirmed with server. Please try again.');
      return;
    }
    setAccount(null);
    setSession(null);
    go('/login');
    setLoginPassword('');
    notify('success', 'You have been securely signed out.');
  }

  const fmtDate = d =>
    d
      ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d))
      : '—';

  const isDashboard = page.startsWith('/dashboard');
  const progressLabels = ['Company Details', 'Business Location', 'Contact Information'];

  if (page === '/') return <LandingPage go={go} />;

  return (
    <div className={`app-shell ${isDashboard ? 'dashboard-shell' : ''}`}>
      {/* Desktop Brand Panel for Registration & Auth */}
      {!isDashboard && (
        <aside className="brand-panel">
          <div className="brand-content">
            <div className="brand-logo-frame">
              <img src="/osf-logo.png" alt="Our Startup Freelancer (OSF)" />
            </div>
            <div className="brand-kicker">COMPANY REGISTRATION</div>
            <h1>
              Good things<br />
              start <span>here.</span>
            </h1>
            <p className="brand-desc">
              Join a dedicated enterprise platform built to help ambitious Indian companies register, build, and scale.
            </p>

            <div className="brand-features">
              <div className="brand-feature-item">
                <span className="brand-feature-icon">
                  <Icon name="ShieldCheck" size={17} />
                </span>
                <span>Email-verified business onboarding</span>
              </div>
              <div className="brand-feature-item">
                <span className="brand-feature-icon">
                  <Icon name="Globe2" size={17} />
                </span>
                <span>Dedicated for enterprises across India</span>
              </div>
              <div className="brand-feature-item">
                <span className="brand-feature-icon">
                  <Icon name="Building2" size={17} />
                </span>
                <span>Company profiles & secure session access</span>
              </div>
            </div>
          </div>

          <div className="brand-footer">
            <span>OUR STARTUP FREELANCER</span>
            <span>BUILD · LAUNCH · SCALE</span>
          </div>
        </aside>
      )}

      {/* Main Panel */}
      <main className="main-panel">
        {!isDashboard && (
          <header className="topbar">
            <a
              className="mobile-logo"
              href="/register"
              onClick={e => {
                e.preventDefault();
                go('/register');
              }}
            >
              <img src="/osf-logo.png" alt="OSF Logo" />
            </a>
            <div className="topbar-actions">
              <button className="contact-nav-link" onClick={() => go('/contact')}>
                Contact Us
              </button>
              <button
                className="theme-toggle"
                onClick={() => setDark(v => !v)}
                aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
              >
                {dark ? <Icon name="Sun" size={16} /> : <Icon name="Moon" size={16} />}
                <span>{dark ? 'Light' : 'Dark'} Mode</span>
              </button>
            </div>
          </header>
        )}

        <div className="page-area">
          {/* REGISTRATION PAGE */}
          {page === '/register' && (
            <section className="form-wrap wide">
              <div className="eyebrow">GET STARTED · COMPANY ACCOUNT</div>
              <h2>Create your company account</h2>
              <p className="page-lead">Complete three simple steps to register your business on OSF.</p>

              {/* 3-Step Progress Stepper */}
              <div className="stepper" aria-label="Registration Progress">
                {progressLabels.map((label, i) => (
                  <button
                    key={label}
                    className={`step-node ${step === i + 1 ? 'active' : ''} ${step > i + 1 ? 'done' : ''}`}
                    onClick={() => i + 1 < step && setStep(i + 1)}
                    disabled={i + 1 > step}
                    aria-current={step === i + 1 ? 'step' : undefined}
                  >
                    <span className="step-circle">
                      {step > i + 1 ? <Icon name="Check" size={16} /> : `0${i + 1}`}
                    </span>
                    <span className="step-label">{label}</span>
                  </button>
                ))}
              </div>

              {/* Step 1: Company Details */}
              {step === 1 && (
                <>
                  <div className="section-banner">
                    <span className="section-icon-box">
                      <Icon name="Building2" size={18} />
                    </span>
                    <div>
                      <h3>Company Details</h3>
                      <p>Start with your organization’s legal registered entity details.</p>
                    </div>
                  </div>

                  <div className="field-grid">
                    <div className="field col-span-2">
                      <label className="field-label" htmlFor="reg-company">
                        Company Name <span className="required-star">*</span>
                      </label>
                      <input
                        id="reg-company"
                        value={form.company}
                        maxLength={150}
                        placeholder="e.g. Northstar Technologies Pvt Ltd"
                        onChange={e => update('company', e.target.value)}
                        onBlur={() => setErrors(x => ({ ...x, company: validateField('company') }))}
                      />
                      {errors.company && <span className="field-error">{errors.company}</span>}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-pan">
                        Company PAN ID
                      </label>
                      <input
                        id="reg-pan"
                        value={form.pan}
                        maxLength={10}
                        placeholder="ABCDE1234F"
                        onChange={e => update('pan', e.target.value.toUpperCase())}
                      />
                      <span className="field-hint">Optional · 10-character Indian PAN</span>
                      {errors.pan && <span className="field-error">{errors.pan}</span>}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-msme">
                        MSME Registration
                      </label>
                      <input
                        id="reg-msme"
                        value={form.msme}
                        placeholder="e.g. UDYAM-XX-00-0000000"
                        onChange={e => update('msme', e.target.value.toUpperCase())}
                      />
                      <span className="field-hint">Optional MSME/Udyam certification</span>
                    </div>
                  </div>
                </>
              )}

              {/* Step 2: Business Location */}
              {step === 2 && (
                <>
                  <div className="section-banner">
                    <span className="section-icon-box">
                      <Icon name="MapPin" size={18} />
                    </span>
                    <div>
                      <h3>Business Location</h3>
                      <p>Enter your company's registered Indian operating address.</p>
                    </div>
                  </div>

                  <div className="field-grid">
                    <div className="field col-span-2">
                      <label className="field-label" htmlFor="reg-address1">
                        Address Line 1 <span className="required-star">*</span>
                      </label>
                      <input
                        id="reg-address1"
                        value={form.address1}
                        placeholder="Street address, building, floor or suite"
                        onChange={e => update('address1', e.target.value)}
                      />
                      {errors.address1 && <span className="field-error">{errors.address1}</span>}
                    </div>

                    <div className="field col-span-2">
                      <label className="field-label" htmlFor="reg-address2">
                        Address Line 2
                      </label>
                      <input
                        id="reg-address2"
                        value={form.address2}
                        placeholder="Landmark, area, or campus (optional)"
                        onChange={e => update('address2', e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-country">
                        Country
                      </label>
                      <input id="reg-country" value="India" readOnly aria-readonly="true" />
                      <span className="field-hint">OSF registration is currently restricted to India.</span>
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-state">
                        State / Union Territory <span className="required-star">*</span>
                      </label>
                      <select
                        id="reg-state"
                        value={form.state}
                        onChange={e => {
                          update('state', e.target.value);
                          update('city', '');
                        }}
                      >
                        <option value="">Select State / UT</option>
                        {INDIAN_STATES.map(s => (
                          <option key={s.isoCode} value={s.name}>{s.name}</option>
                        ))}
                      </select>
                      {errors.state && <span className="field-error">{errors.state}</span>}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-city">
                        City <span className="required-star">*</span>
                      </label>
                      <select
                        id="reg-city"
                        value={form.city}
                        disabled={!form.state || citiesLoading}
                        onChange={e => update('city', e.target.value)}
                      >
                        <option value="">{citiesLoading ? 'Loading cities…' : 'Select City'}</option>
                        {cityOptions.map((c, i) => (
                          <option key={`${c}-${i}`} value={c}>{c}</option>
                        ))}
                      </select>
                      {errors.city && <span className="field-error">{errors.city}</span>}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-postal">
                        PIN Code <span className="required-star">*</span>
                      </label>
                      <input
                        id="reg-postal"
                        inputMode="numeric"
                        maxLength={6}
                        value={form.postal}
                        placeholder="6-digit PIN Code"
                        onChange={e => update('postal', e.target.value)}
                      />
                      {errors.postal && <span className="field-error">{errors.postal}</span>}
                    </div>
                  </div>
                </>
              )}

              {/* Step 3: Contact Information */}
              {step === 3 && (
                <>
                  <div className="section-banner">
                    <span className="section-icon-box">
                      <Icon name="UserRound" size={18} />
                    </span>
                    <div>
                      <h3>Contact Information</h3>
                      <p>Designate an authorized representative for this company account.</p>
                    </div>
                  </div>

                  <div className="field-grid">
                    <div className="field col-span-2">
                      <label className="field-label" htmlFor="reg-contact">
                        Contact Person Full Name <span className="required-star">*</span>
                      </label>
                      <input
                        id="reg-contact"
                        value={form.contact}
                        placeholder="e.g. Aanya Sharma"
                        onChange={e => update('contact', e.target.value)}
                      />
                      {errors.contact && <span className="field-error">{errors.contact}</span>}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-email">
                        Company Corporate Email <span className="required-star">*</span>
                      </label>
                      <input
                        id="reg-email"
                        type="email"
                        value={form.email}
                        placeholder="representative@company.com"
                        onChange={e => update('email', e.target.value)}
                      />
                      <span className="field-hint">A one-time verification code will be sent to this email.</span>
                      {errors.email && <span className="field-error">{errors.email}</span>}
                    </div>

                    <div className="field">
                      <label className="field-label" htmlFor="reg-phone">
                        Indian Phone Number
                      </label>
                      <div className="phone-input-group">
                        <span className="phone-prefix">+91</span>
                        <input
                          id="reg-phone"
                          type="tel"
                          inputMode="tel"
                          value={form.phone}
                          placeholder="10-digit mobile number"
                          onChange={e => update('phone', e.target.value)}
                        />
                      </div>
                      <span className="field-hint">Optional · Used for account recovery alerts</span>
                      {errors.phone && <span className="field-error">{errors.phone}</span>}
                    </div>
                  </div>

                  {/* Review Summary Box */}
                  <div className="review-card">
                    <div className="review-card-head">
                      <Icon name="FileCheck2" size={18} />
                      <span>Review Details Prior to Submission</span>
                    </div>
                    <div className="review-rows">
                      <div className="review-row">
                        <span className="review-row-label">Company Name:</span>
                        <span className="review-row-val">{form.company || '—'}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-row-label">PAN & MSME:</span>
                        <span className="review-row-val">{[form.pan, form.msme].filter(Boolean).join(' · ') || 'None provided'}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-row-label">Location:</span>
                        <span className="review-row-val">{[form.city, form.state, 'India'].filter(Boolean).join(', ') || '—'}</span>
                      </div>
                      <div className="review-row">
                        <span className="review-row-label">Representative:</span>
                        <span className="review-row-val">{form.contact || '—'} ({form.email || '—'})</span>
                      </div>
                    </div>
                    <div className="review-footnote">
                      <Icon name="ShieldCheck" size={15} />
                      <span>Your company information is encrypted and secured under OSF Enterprise Terms.</span>
                    </div>
                  </div>
                </>
              )}

              {/* Navigation & Action Bar with clearly visible Back arrow */}
              <div className="form-actions">
                {step > 1 ? (
                  <button className="btn btn-outline" onClick={() => moveStep(-1)}>
                    <Icon name="ArrowLeft" size={16} />
                    <span>Back</span>
                  </button>
                ) : (
                  <button className="btn btn-outline" onClick={() => go('/login')}>
                    <Icon name="ArrowLeft" size={16} />
                    <span>Back to Sign In</span>
                  </button>
                )}

                {step < 3 ? (
                  <button className="btn btn-primary" onClick={() => moveStep(1)}>
                    <span>Continue</span>
                    <Icon name="ArrowRight" size={16} />
                  </button>
                ) : (
                  <button className="btn btn-primary" onClick={startVerify} disabled={busy}>
                    {busy ? (
                      <>
                        <span className="loading-spinner" />
                        <span>Creating Account…</span>
                      </>
                    ) : (
                      <>
                        <span>Submit Registration</span>
                        <Icon name="ArrowRight" size={16} />
                      </>
                    )}
                  </button>
                )}
              </div>

              <div className="form-auth-switch">
                Already registered with OSF? <button onClick={() => go('/login')}>Sign in here</button>
              </div>
            </section>
          )}

          {/* VERIFY EMAIL PAGE */}
          {page === '/verify-email' && (
            <section className="form-wrap narrow auth-card">
              {/* Back navigation to edit registration */}
              <div style={{ marginBottom: '16px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setPendingRegistration(null);
                    go('/register');
                    setStep(3);
                  }}
                >
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Registration</span>
                </button>
              </div>

              <div className="auth-icon-circle">
                <Icon name="Mail" size={24} />
              </div>
              <div className="eyebrow">ONE QUICK CHECK · SECURITY</div>
              <h2>Verify your email</h2>
              <p className="page-lead">
                We’ve sent a 6-digit confirmation code to{' '}
                <strong>{maskEmail(pendingRegistration?.email || form.email)}</strong>.
              </p>

              {emailDeliveryFailed && (
                <div className="alert alert-warning" role="alert">
                  <Icon name="AlertCircle" size={18} />
                  <div>
                    <strong>Email Delivery Notification</strong>
                    <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
                      Automated dispatch could not connect. Check SMTP settings or request a resend below.
                    </div>
                  </div>
                </div>
              )}

              {verifiedRegistration ? (
                <>
                  <div className="alert alert-success" role="status">
                    <Icon name="CheckCircle2" size={18} />
                    <div>
                      <strong>Email verified for User ID {verifiedRegistration.userId}</strong>
                      <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
                        A password setup link is required to complete account initialization.
                      </div>
                    </div>
                  </div>
                  <button
                    className="btn btn-primary full"
                    disabled={busy || cooldown > 0}
                    onClick={resendSetup}
                  >
                    {busy ? (
                      <span className="loading-spinner" />
                    ) : cooldown > 0 ? (
                      `Try again in ${cooldown}s`
                    ) : (
                      <>
                        <span>Send Password Setup Link</span>
                        <Icon name="ArrowRight" size={16} />
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  <div className="field">
                    <label className="field-label" htmlFor="otp-input">
                      6-Digit Verification Code
                    </label>
                    <input
                      id="otp-input"
                      className="otp-input-field"
                      maxLength={6}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={otpInput}
                      placeholder="••••••"
                      onChange={e => setOtpInput(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    />
                  </div>

                  <button className="btn btn-primary full" disabled={busy} onClick={submitOtp} style={{ marginTop: '16px' }}>
                    {busy ? (
                      <>
                        <span className="loading-spinner" />
                        <span>Verifying Code…</span>
                      </>
                    ) : (
                      <>
                        <span>Verify & Continue</span>
                        <Icon name="ArrowRight" size={16} />
                      </>
                    )}
                  </button>

                  <div className="resend-bar">
                    {cooldown > 0 ? (
                      <span>
                        <Icon name="Clock3" size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                        Resend code in {cooldown}s
                      </span>
                    ) : (
                      <button disabled={busy} onClick={resendOtp}>
                        Resend verification code
                      </button>
                    )}

                    <button
                      onClick={() => {
                        setPendingRegistration(null);
                        go('/register');
                        setStep(3);
                      }}
                    >
                      Change email
                    </button>
                  </div>
                </>
              )}

              <div style={{ textAlign: 'center', fontSize: '12px', color: 'var(--text-muted)', marginTop: '24px' }}>
                Codes expire in 5 minutes. Standard cooldown: 60 seconds.
              </div>
            </section>
          )}

          {/* SET PASSWORD PAGE */}
          {page === '/set-password' && (
            <section className="form-wrap narrow auth-card">
              <div style={{ marginBottom: '16px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => go('/login')}>
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Sign In</span>
                </button>
              </div>

              <div className="auth-icon-circle">
                <Icon name="ShieldCheck" size={24} />
              </div>
              <div className="eyebrow">SECURE YOUR ACCOUNT</div>
              <h2>Create your password</h2>
              <p className="page-lead">Set a strong password to complete registration for your OSF company account.</p>

              {(setupLinkError ||
                (!new URLSearchParams(location.search).get('token') &&
                  'This password setup link is invalid or expired.')) && (
                <div className="alert alert-warning" role="alert">
                  <Icon name="AlertCircle" size={18} />
                  <div>
                    <strong>Link Notice</strong>
                    <div style={{ fontSize: '12.5px', marginTop: '2px' }}>
                      {setupLinkError || 'This password setup link is invalid or expired. Request a fresh setup email from sign-in.'}
                    </div>
                  </div>
                </div>
              )}

              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field-label" htmlFor="new-setup-pass">
                  New Password <span className="required-star">*</span>
                </label>
                <div className="password-box">
                  <input
                    id="new-setup-pass"
                    type={showPassword ? 'text' : 'password'}
                    value={setupPassword}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    onChange={e => setSetupPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <Icon name="EyeOff" size={16} /> : <Icon name="Eye" size={16} />}
                  </button>
                </div>
              </div>

              <div className="auth-rules-box">
                Password must contain at least 12 characters, including uppercase and lowercase letters, a number, and a special character.
              </div>

              <div className="field" style={{ marginBottom: '20px' }}>
                <label className="field-label" htmlFor="confirm-setup-pass">
                  Confirm Password <span className="required-star">*</span>
                </label>
                <div className="password-box">
                  <input
                    id="confirm-setup-pass"
                    type={showPassword ? 'text' : 'password'}
                    value={setupConfirmation}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    onChange={e => setSetupConfirmation(e.target.value)}
                  />
                </div>
              </div>

              <button
                className="btn btn-primary full"
                disabled={busy || Boolean(setupLinkError) || !new URLSearchParams(location.search).get('token')}
                onClick={completeSetup}
              >
                {busy ? (
                  <>
                    <span className="loading-spinner" />
                    <span>Saving Password…</span>
                  </>
                ) : (
                  <>
                    <span>Confirm & Finish Setup</span>
                    <Icon name="ArrowRight" size={16} />
                  </>
                )}
              </button>
            </section>
          )}

          {/* SIGN IN / LOGIN PAGE */}
          {page === '/login' && (
            <section className="form-wrap narrow auth-card">
              <div style={{ marginBottom: '16px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => go('/register')}>
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Registration</span>
                </button>
              </div>

              <div className="eyebrow">WELCOME BACK · ENTERPRISE ACCESS</div>
              <h2>Sign in to OSF</h2>
              <p className="page-lead">Enter your assigned OSF User ID and password to access your company workspace.</p>

              <div className="field" style={{ marginBottom: '16px' }}>
                <label className="field-label" htmlFor="login-id">
                  OSF User ID <span className="required-star">*</span>
                </label>
                <input
                  id="login-id"
                  autoComplete="username"
                  value={loginId}
                  placeholder="e.g. OSF-123456"
                  onChange={e => setLoginId(e.target.value)}
                />
              </div>

              <div className="field" style={{ marginBottom: '22px' }}>
                <label className="field-label" htmlFor="login-password">
                  Password <span className="required-star">*</span>
                </label>
                <div className="password-box">
                  <input
                    id="login-password"
                    autoComplete="current-password"
                    type={showPassword ? 'text' : 'password'}
                    value={loginPassword}
                    placeholder="Enter your password"
                    onChange={e => setLoginPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <Icon name="EyeOff" size={16} /> : <Icon name="Eye" size={16} />}
                  </button>
                </div>
              </div>

              <button className="btn btn-primary full" disabled={busy || authLoading} onClick={login}>
                {busy ? (
                  <>
                    <span className="loading-spinner" />
                    <span>Authenticating…</span>
                  </>
                ) : (
                  <>
                    <span>Sign In</span>
                    <Icon name="ArrowRight" size={16} />
                  </>
                )}
              </button>

              <div className="form-auth-switch" style={{ marginTop: '20px' }}>
                New enterprise to OSF? <button onClick={() => go('/register')}>Register your company</button>
              </div>

              {/* Password Setup Recovery Accordion */}
              <div style={{ marginTop: '20px', textAlign: 'center' }}>
                <button
                  type="button"
                  style={{ fontSize: '13px', color: 'var(--text-secondary)', textDecoration: 'underline' }}
                  onClick={() => {
                    setShowSetupRecovery(v => !v);
                    setSetupRecoveryState('idle');
                    setSetupRecoveryMessage('');
                  }}
                >
                  Need to setup or recover your password?
                </button>
              </div>

              {showSetupRecovery && (
                <div className="recovery-card">
                  <h3>Resend Password Setup Email</h3>
                  <p>Provide your registered corporate email to receive a password activation link.</p>

                  <div className="field" style={{ marginBottom: '14px' }}>
                    <label className="field-label" htmlFor="recovery-email">
                      Registered Company Email
                    </label>
                    <input
                      id="recovery-email"
                      type="email"
                      autoComplete="email"
                      value={setupEmail}
                      placeholder="representative@company.com"
                      onChange={e => setSetupEmail(e.target.value)}
                    />
                  </div>

                  <button
                    className="btn btn-outline full"
                    disabled={setupRecoveryState === 'sending' || setupRecoveryCooldown > 0}
                    onClick={requestSetupRecovery}
                  >
                    {setupRecoveryState === 'sending'
                      ? 'Dispatching…'
                      : setupRecoveryCooldown > 0
                      ? `Wait ${setupRecoveryCooldown}s before retrying`
                      : 'Send Activation Link'}
                  </button>

                  {setupRecoveryMessage && (
                    <div
                      className={`alert ${setupRecoveryState === 'failure' ? 'alert-danger' : 'alert-success'}`}
                      style={{ marginTop: '14px', marginBottom: 0 }}
                      role="status"
                    >
                      {setupRecoveryState === 'failure' ? (
                        <Icon name="AlertCircle" size={16} />
                      ) : (
                        <Icon name="CheckCircle2" size={16} />
                      )}
                      <span>{setupRecoveryMessage}</span>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}

          {/* CHANGE PASSWORD PAGE */}
          {page === '/change-password' && (
            <section className="form-wrap narrow auth-card">
              <div style={{ marginBottom: '16px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard')}>
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Workspace</span>
                </button>
              </div>

              <div className="eyebrow">ACCOUNT SECURITY</div>
              <h2>Change your password</h2>
              <p className="page-lead">Update your authentication password for this OSF company account.</p>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field-label" htmlFor="current-pass">
                  Current Password <span className="required-star">*</span>
                </label>
                <div className="password-box">
                  <input
                    id="current-pass"
                    type={showPassword ? 'text' : 'password'}
                    value={currentPassword}
                    autoComplete="current-password"
                    placeholder="Enter current password"
                    onChange={e => setCurrentPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="password-toggle-btn"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    onClick={() => setShowPassword(v => !v)}
                  >
                    {showPassword ? <Icon name="EyeOff" size={16} /> : <Icon name="Eye" size={16} />}
                  </button>
                </div>
              </div>

              <div className="field" style={{ marginBottom: '14px' }}>
                <label className="field-label" htmlFor="new-pass">
                  New Password <span className="required-star">*</span>
                </label>
                <div className="password-box">
                  <input
                    id="new-pass"
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    autoComplete="new-password"
                    placeholder="Enter new password"
                    onChange={e => setNewPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="auth-rules-box">
                Must be at least 12 characters long and include uppercase, lowercase, numbers, and special symbols.
              </div>

              <div className="field" style={{ marginBottom: '22px' }}>
                <label className="field-label" htmlFor="confirm-pass">
                  Confirm New Password <span className="required-star">*</span>
                </label>
                <div className="password-box">
                  <input
                    id="confirm-pass"
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    autoComplete="new-password"
                    placeholder="Repeat new password"
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-actions">
                <button className="btn btn-outline" onClick={() => go('/dashboard')}>
                  <Icon name="ArrowLeft" size={16} />
                  <span>Cancel</span>
                </button>
                <button className="btn btn-primary" disabled={busy} onClick={changePassword}>
                  {busy ? (
                    <>
                      <span className="loading-spinner" />
                      <span>Saving Changes…</span>
                    </>
                  ) : (
                    'Save New Password'
                  )}
                </button>
              </div>
            </section>
          )}

          {/* CONTACT US PAGE */}
          {page === '/contact' && (
            <ContactUs onBack={session ? () => go('/dashboard') : () => go('/register')} />
          )}

          {/* DASHBOARD EXPERIENCE */}
          {page.startsWith('/dashboard') && session && (
            <Dashboard
              account={account}
              tab={dashTab}
              setTab={setDashTab}
              go={go}
              logout={logout}
              onProfileUpdated={company =>
                setAccount(current => ({ ...current, profile: toUiProfile(company) }))
              }
              date={fmtDate}
              dark={dark}
              setDark={setDark}
            />
          )}
        </div>

        {/* Global Footer (Non-dashboard pages) */}
        {!isDashboard && (
          <footer className="main-footer">
            <span>© {new Date().getFullYear()} Our Startup Freelancer (OSF). All rights reserved.</span>
            <span className="footer-muted">India Enterprise Registration Desk</span>
          </footer>
        )}
      </main>

      {/* Floating Toast Notification */}
      {notice && (
        <div className="toast-container">
          <div className={`toast ${notice.startsWith('error') ? 'toast-error' : 'toast-success'}`} role="alert">
            {notice.startsWith('error') ? (
              <Icon name="AlertCircle" size={18} />
            ) : (
              <Icon name="CheckCircle2" size={18} />
            )}
            <span>{notice.split('|')[1]}</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ==========================================================================
   DASHBOARD COMPONENT (ENTERPRISE SIDEBAR + TOPBAR + CONTENT)
   ========================================================================== */

function Dashboard({ account, tab, setTab, go, logout, onProfileUpdated, date, dark, setDark }) {
  const contactName = account?.profile?.contact || 'Representative';
  const companyName = account?.profile?.company || 'Your Registered Enterprise';

  const menu = [
    { name: 'Overview', icon: 'LayoutDashboard', path: '/dashboard' },
    { name: 'Company Profile', icon: 'Building2', path: '/dashboard/company' },
    { name: 'Account Information', icon: 'UserRound', path: '/dashboard/account' },
    { name: 'Activity', icon: 'Clock3', path: '/dashboard/activity' },
  ];

  return (
    <div className="dash-container">
      {/* Desktop Left Sidebar */}
      <aside className="dash-sidebar" aria-label="Company Workspace Navigation">
        <div>
          <div className="dash-sidebar-brand">
            <img src="/osf-logo.png" alt="OSF Logo" />
          </div>

          <div className="dash-nav-section-title">Workspace</div>
          <nav className="dash-sidebar-nav">
            {menu.map(item => (
              <button
                key={item.name}
                className={`dash-sidebar-link ${tab === item.name ? 'active' : ''}`}
                onClick={() => {
                  setTab(item.name);
                  go(item.path);
                }}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="dash-sidebar-footer">
          <div className="sidebar-user-badge">
            <div className="sidebar-user-avatar">
              {contactName.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{contactName}</div>
              <div className="sidebar-user-id">{account?.userId || 'OSF Enterprise'}</div>
            </div>
          </div>

          <button className="sidebar-signout-btn" onClick={logout}>
            <Icon name="LogOut" size={16} />
            <span>Sign Out</span>
          </button>
        </div>
      </aside>

      {/* Main Workspace Area */}
      <div className="dash-main-area">
        {/* Top Header */}
        <header className="dash-header">
          <div className="dash-header-title">
            <h2>{tab}</h2>
            <span className={`status-pill ${account?.profile?.emailVerified ? 'success' : 'warning'}`}>
              {account?.profile?.emailVerified && <Icon name="CheckCircle2" size={12} />} Email {account?.profile?.emailVerified ? 'Verified' : 'Not Verified'}
            </span>
          </div>

          <div className="dash-header-tools">
            <button className="contact-nav-link" onClick={() => go('/contact')}>
              Contact Us
            </button>
            <button
              className="theme-toggle"
              onClick={() => setDark(v => !v)}
              aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
            >
              {dark ? <Icon name="Sun" size={16} /> : <Icon name="Moon" size={16} />}
              <span>{dark ? 'Light' : 'Dark'}</span>
            </button>
            <button className="btn btn-outline btn-sm" onClick={logout}>
              <Icon name="LogOut" size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        </header>

        {/* Mobile Responsive Navigation Strip */}
        <nav className="mobile-dash-nav" aria-label="Mobile workspace navigation">
          {menu.map(item => (
            <button
              key={item.name}
              className={`mobile-dash-tab ${tab === item.name ? 'active' : ''}`}
              onClick={() => {
                setTab(item.name);
                go(item.path);
              }}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        {/* Dashboard Body Area */}
        <div className="dash-body">
          {/* TAB 1: OVERVIEW */}
          {tab === 'Overview' && (
            <>
              <div className="welcome-banner">
                <div>
                  <h1>Welcome back, {contactName.split(' ')[0]}</h1>
                  <p>Here is an authenticated overview of your registered company workspace.</p>
                </div>
                <span className={`status-pill ${account?.profile?.emailVerified ? 'success' : 'warning'}`}>
                  {account?.profile?.emailVerified && <Icon name="CheckCircle2" size={14} />} Email {account?.profile?.emailVerified ? 'Verified' : 'Not Verified'}
                </span>
              </div>

              {/* Company verification status */}
              <div className="dash-status-card">
                <div className="dash-status-icon">
                  <Icon name="Building2" size={20} />
                </div>
                <div className="dash-status-content">
                  <strong>Company verification is not available</strong>
                  <p>
                    Email verification confirms access to the registered email address. It does not verify legal company status or regulatory compliance.
                  </p>
                </div>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setTab('Company Profile');
                    go('/dashboard/company');
                  }}
                >
                  <span>View Profile</span>
                  <Icon name="ArrowRight" size={14} />
                </button>
              </div>

              {/* 2-Column Cards Grid */}
              <div className="dash-cards-grid">
                {/* Company Overview Card */}
                <div className="dash-card">
                  <div className="dash-card-header">
                    <div>
                      <h3>Company Overview</h3>
                      <p>Registered entity profile</p>
                    </div>
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => {
                        setTab('Company Profile');
                        go('/dashboard/company');
                      }}
                    >
                      <Icon name="ArrowRight" size={14} />
                    </button>
                  </div>

                  <div className="company-summary-row">
                    <div className="company-avatar-box">
                      {companyName.charAt(0).toUpperCase()}
                    </div>
                    <div className="company-summary-name">
                      <h4>{companyName}</h4>
                      <span>Incorporated Company Profile</span>
                    </div>
                  </div>

                  <div className="data-table-rows">
                    <div className="data-table-row">
                      <span className="data-table-label">Registered Corporate Email</span>
                      <span className="data-table-value">{account?.profile?.email || '—'}</span>
                    </div>
                    <div className="data-table-row">
                      <span className="data-table-label">Country Jurisdiction</span>
                      <span className="data-table-value">{account?.profile?.country || 'India'}</span>
                    </div>
                    <div className="data-table-row">
                      <span className="data-table-label">Operating State</span>
                      <span className="data-table-value">{account?.profile?.state || '—'}</span>
                    </div>
                    <div className="data-table-row">
                      <span className="data-table-label">Member Since</span>
                      <span className="data-table-value">{account?.profile?.registeredAt ? date(account.profile.registeredAt) : 'Not available'}</span>
                    </div>
                  </div>
                </div>

                {/* Account Security Card */}
                <div className="dash-card">
                  <div className="dash-card-header">
                    <div>
                      <h3>Account & Compliance</h3>
                      <p>Verification integrity</p>
                    </div>
                    <Icon name="ShieldCheck" size={18} style={{ color: 'var(--color-success)' }} />
                  </div>

                  <div className="data-table-rows">
                    <div className="data-table-row">
                      <span className="data-table-label">Email Verification</span>
                      <span className={`status-pill ${account?.profile?.emailVerified ? 'success' : 'warning'}`} style={{ padding: '2px 8px', fontSize: '11px' }}>
                        {account?.profile?.emailVerified && <Icon name="CheckCircle2" size={11} />} {account?.profile?.emailVerified ? 'Email Verified' : 'Not Verified'}
                      </span>
                    </div>
                    <div className="data-table-row">
                      <span className="data-table-label">Account Status</span>
                      <span className="status-pill success" style={{ padding: '2px 8px', fontSize: '11px' }}>
                        Active
                      </span>
                    </div>
                    <div className="data-table-row">
                      <span className="data-table-label">Password Setup</span>
                      <span className="status-pill success" style={{ padding: '2px 8px', fontSize: '11px' }}>
                        Complete
                      </span>
                    </div>
                    <div className="data-table-row">
                      <span className="data-table-label">OSF User ID</span>
                      <span className="data-table-value" style={{ fontFamily: 'var(--font-heading)' }}>
                        {account?.userId || '—'}
                      </span>
                    </div>
                  </div>

                  <div style={{ marginTop: '20px', paddingTop: '14px', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>Security Credentials</span>
                    <button className="btn btn-outline btn-sm" onClick={() => go('/change-password')}>
                      Change Password
                    </button>
                  </div>
                </div>
              </div>

              {/* Recent Activity Section with Polished Empty State */}
              <div className="dash-card">
                <div className="dash-card-header">
                  <div>
                    <h3>Recent Account Activity</h3>
                    <p>Timeline of security and profile events</p>
                  </div>
                </div>

                <div className="empty-state-box">
                  <div className="empty-state-icon">
                    <Icon name="Clock3" size={22} />
                  </div>
                  <strong>Activity tracking is not yet available.</strong>
                </div>
              </div>

              {/* Quick Actions Grid */}
              <div className="quick-actions-grid">
                <button
                  className="quick-action-card"
                  onClick={() => {
                    setTab('Company Profile');
                    go('/dashboard/company');
                  }}
                >
                  <div className="quick-action-icon">
                    <Icon name="Building2" size={20} />
                  </div>
                  <div className="quick-action-text">
                    <strong>Company Profile</strong>
                    <span>Review legal registered details & location</span>
                  </div>
                  <Icon name="ArrowRight" size={16} style={{ color: 'var(--text-muted)' }} />
                </button>

                <button
                  className="quick-action-card"
                  onClick={() => {
                    setTab('Account Information');
                    go('/dashboard/account');
                  }}
                >
                  <div className="quick-action-icon">
                    <Icon name="UserRound" size={20} />
                  </div>
                  <div className="quick-action-text">
                    <strong>Account Information</strong>
                    <span>View designated representative & access credentials</span>
                  </div>
                  <Icon name="ArrowRight" size={16} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
            </>
          )}

          {/* TAB 2: COMPANY PROFILE */}
          {tab === 'Company Profile' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setTab('Overview');
                    go('/dashboard');
                  }}
                >
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Overview</span>
                </button>
              </div>
              <CompanyProfile profile={account?.profile} onSaved={onProfileUpdated} />
            </div>
          )}

          {/* TAB 3: ACCOUNT INFORMATION */}
          {tab === 'Account Information' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setTab('Overview');
                    go('/dashboard');
                  }}
                >
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Overview</span>
                </button>
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <div>
                    <h3>Account & Representative Information</h3>
                    <p>OSF enterprise sign-in credentials and authorized contact</p>
                  </div>
                  <button className="btn btn-outline btn-sm" onClick={() => go('/change-password')}>
                    Change Password
                  </button>
                </div>

                <div className="data-table-rows">
                  <div className="data-table-row">
                    <span className="data-table-label">OSF User ID</span>
                    <span className="data-table-value" style={{ fontFamily: 'var(--font-heading)' }}>
                      {account?.userId || '—'}
                    </span>
                  </div>
                  <div className="data-table-row">
                    <span className="data-table-label">Designated Contact</span>
                    <span className="data-table-value">{contactName}</span>
                  </div>
                  <div className="data-table-row">
                    <span className="data-table-label">Registered Corporate Email</span>
                    <span className="data-table-value">{account?.profile?.email || '—'}</span>
                  </div>
                  <div className="data-table-row">
                    <span className="data-table-label">Email Status</span>
                    <span className={`status-pill ${account?.profile?.emailVerified ? 'success' : 'warning'}`} style={{ padding: '2px 8px', fontSize: '11px' }}>
                      {account?.profile?.emailVerified && <Icon name="CheckCircle2" size={11} />} {account?.profile?.emailVerified ? 'Email Verified' : 'Not Verified'}
                    </span>
                  </div>
                  <div className="data-table-row">
                    <span className="data-table-label">Account Jurisdiction</span>
                    <span className="data-table-value">{account?.profile?.country || 'Not available'}{account?.profile?.countryCode ? ` (${account.profile.countryCode})` : ''}</span>
                  </div>
                  <div className="data-table-row">
                    <span className="data-table-label">Contact Phone</span>
                    <span className="data-table-value">{account?.profile?.phone || 'Not provided'}</span>
                  </div>
                  <div className="data-table-row">
                    <span className="data-table-label">Registration Date</span>
                    <span className="data-table-value">{account?.profile?.registeredAt ? date(account.profile.registeredAt) : 'Not available'}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVITY */}
          {tab === 'Activity' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <button
                  className="btn btn-outline btn-sm"
                  onClick={() => {
                    setTab('Overview');
                    go('/dashboard');
                  }}
                >
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back to Overview</span>
                </button>
              </div>

              <div className="dash-card">
                <div className="dash-card-header">
                  <div>
                    <h3>Security & Account Timeline</h3>
                    <p>Audit trail of actions and verification status changes</p>
                  </div>
                </div>

                <div className="empty-state-box">
                  <div className="empty-state-icon">
                    <Icon name="Clock3" size={22} />
                  </div>
                  <strong>Activity tracking is not yet available.</strong>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
