import React from 'react';
import CompanyProfile from '../CompanyProfile.jsx';
import LiveChallengePage from './LiveChallengePage.jsx';
import TalentDiscoveryPage from './TalentDiscoveryPage.jsx';
import ChallengeFormPage from './ChallengeFormPage.jsx';
import ChallengeApplicantsPage from './ChallengeApplicantsPage.jsx';
import ApplicationDetailPage from './ApplicationDetailPage.jsx';
import CompanyStudentProfilePage from './CompanyStudentProfilePage.jsx';
import SkillVerificationPage from './SkillVerificationPage.jsx';
import AssessmentFormPage from './AssessmentFormPage.jsx';
import { AttemptsList, AttemptDetail } from './AssessmentAttemptsPage.jsx';
import { companyApi } from './companyApi.js';
import './company.css';

/* SVG Icon Component (mirrors main.jsx Icon) */
const iconPaths = {
  ArrowLeft: 'M19 12H5 M12 19l-7-7 7-7',
  ArrowRight: 'M5 12h14 M12 5l7 7-7 7',
  Building2: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01 M14 9v.01 M14 12v.01',
  CheckCircle2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
  Clock3: 'M12 8v4l3 2 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  LogOut: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9',
  Target: 'M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z M12 12h.01',
  ShieldCheck: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z M9 12l2 2 4-4',
  UsersRound: 'M18 21a8 8 0 0 0-16 0 M22 20a6 6 0 0 0-9-5.2 M15 10a4 4 0 1 0-4-4 M21 11a3 3 0 1 0-4-4.3',
  UserRound: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
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

const MODULES = [
  { name: 'Live Challenge', icon: 'Target', path: '/dashboard/challenges' },
  { name: 'Skill Verification', icon: 'ShieldCheck', path: '/dashboard/skills' },
  { name: 'Talent Discovery', icon: 'UsersRound', path: '/dashboard/talent' },
  { name: 'Company Profile', icon: 'Building2', path: '/dashboard/company' },
];

function moduleForPath(path) {
  // applicant review pages live under the Live Challenge module
  if (/^\/dashboard\/(applications|students)\/[^/]+$/.test(path)) return MODULES[0];
  return MODULES.find(item => path === item.path || path.startsWith(`${item.path}/`)) || null;
}

function EmptyModule({ title }) {
  return (
    <div className="empty-state-box">
      <div className="empty-state-icon">
        <Icon name="Clock3" size={22} />
      </div>
      <strong>{title}</strong>
      <p>This module is coming in the next step.</p>
    </div>
  );
}

export default function CompanyPortal({ path, go, account, logout, onProfileUpdated, date }) {
  const contactName = account?.profile?.contact || 'Representative';
  const companyName = account?.profile?.company || contactName;
  const activeModule = moduleForPath(path);
  const [challengeSummary, setChallengeSummary] = React.useState(null);

  React.useEffect(() => {
    const redirectTargets = new Set(['/dashboard', '/dashboard/activity']);
    if (redirectTargets.has(path) || (path.startsWith('/dashboard') && path !== '/dashboard/account' && !path.startsWith('/dashboard/account/') && !activeModule)) {
      history.replaceState(history.state, '', '/dashboard/challenges');
      go('/dashboard/challenges');
    }
  }, [path]);

  React.useEffect(() => {
    if (!path.startsWith('/dashboard/challenges')) return;
    companyApi.challenges()
      .then(result => setChallengeSummary({
        published: result.challenges.filter(c => c.status === 'PUBLISHED').length,
        draft: result.challenges.filter(c => c.status === 'DRAFT').length,
      }))
      .catch(() => {});
  }, [path]);

  const title = path === '/dashboard/account' ? 'Account Information' : activeModule?.name || 'Live Challenge';

  const subtitle = (() => {
    if (path === '/dashboard/account') return 'Sign-in and contact details for your OSF enterprise account.';
    if (!activeModule) return undefined;
    switch (activeModule.name) {
      case 'Live Challenge':
        return challengeSummary
          ? `${companyName} · ${challengeSummary.published} published, ${challengeSummary.draft} draft${challengeSummary.draft === 1 ? '' : 's'}`
          : `${companyName} · the roles you publish for student applicants`;
      case 'Company Profile':
        return 'Keep your enterprise details current so students see an accurate listing.';
      case 'Talent Discovery':
        return 'Find students by skill and college, save the ones worth a conversation.';
      case 'Skill Verification':
        return 'Coming in the next step of the company portal.';
      default:
        return undefined;
    }
  })();

  return (
    <div className="dash-container">
      {/* Desktop Left Sidebar */}
      <aside className="dash-sidebar" aria-label="Company Workspace Navigation">
        <div className="dash-sidebar-top">
          <a className="dash-sidebar-brand" href="/" aria-label="Return to OSF home" onClick={e => { e.preventDefault(); go('/'); }}>
            <img src="/osf-logo.png" alt="OSF Logo" />
          </a>

          <div className="dash-nav-section-title">Workspace</div>
          <nav className="dash-sidebar-nav">
            {MODULES.map(item => (
              <button
                key={item.name}
                className={`dash-sidebar-link ${activeModule?.name === item.name ? 'active' : ''}`}
                onClick={() => go(item.path)}
              >
                <Icon name={item.icon} size={18} />
                <span>{item.name}</span>
              </button>
            ))}
          </nav>
        </div>

        <div className="dash-sidebar-footer">
          <button className="sidebar-user-badge company-account-trigger" onClick={() => go('/dashboard/account')}>
            <div className="sidebar-user-avatar">
              {contactName.charAt(0).toUpperCase()}
            </div>
            <div className="sidebar-user-info">
              <div className="sidebar-user-name">{contactName}</div>
              <div className="sidebar-user-id">{account?.userId || 'OSF Enterprise'}</div>
            </div>
          </button>

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
            <div>
              <h2>{title}</h2>
              {subtitle && <p className="dash-header-subtitle">{subtitle}</p>}
            </div>
            <span className={`status-pill ${account?.profile?.emailVerified ? 'success' : 'warning'}`}>
              {account?.profile?.emailVerified && <Icon name="CheckCircle2" size={12} />} Email {account?.profile?.emailVerified ? 'Verified' : 'Not Verified'}
            </span>
          </div>

          <div className="dash-header-tools">
            <button className="contact-nav-link" onClick={() => go('/contact')}>
              Contact Us
            </button>
            {path === '/dashboard/challenges' && (
              <button className="btn btn-primary btn-sm" onClick={() => go('/dashboard/challenges/new')}>
                New challenge
              </button>
            )}
            {path === '/dashboard/skills' && (
              <button className="btn btn-primary btn-sm" onClick={() => go('/dashboard/skills/new')}>
                New assessment
              </button>
            )}
          </div>
        </header>

        {/* Mobile Responsive Navigation Strip */}
        <nav className="mobile-dash-nav" aria-label="Mobile workspace navigation">
          {MODULES.map(item => (
            <button
              key={item.name}
              className={`mobile-dash-tab ${activeModule?.name === item.name ? 'active' : ''}`}
              onClick={() => go(item.path)}
            >
              <Icon name={item.icon} size={15} />
              <span>{item.name}</span>
            </button>
          ))}
        </nav>

        {/* Dashboard Body Area */}
        <div className="dash-body">
          {path === '/dashboard/challenges' && <LiveChallengePage go={go} />}
          {(path === '/dashboard/challenges/new' || /^\/dashboard\/challenges\/[^/]+\/edit$/.test(path)) && (
            <ChallengeFormPage
              go={go}
              challengeId={/^\/dashboard\/challenges\/([^/]+)\/edit$/.exec(path)?.[1] || null}
            />
          )}

          {/^\/dashboard\/challenges\/[^/]+\/applicants$/.test(path) && (
            <ChallengeApplicantsPage go={go} challengeId={decodeURIComponent(/^\/dashboard\/challenges\/([^/]+)\/applicants$/.exec(path)[1])} />
          )}
          {/^\/dashboard\/applications\/[^/]+$/.test(path) && (
            <ApplicationDetailPage go={go} applicationId={decodeURIComponent(/^\/dashboard\/applications\/([^/]+)$/.exec(path)[1])} />
          )}
          {/^\/dashboard\/students\/[^/]+$/.test(path) && (
            <CompanyStudentProfilePage go={go} studentId={decodeURIComponent(/^\/dashboard\/students\/([^/]+)$/.exec(path)[1])} />
          )}

          {path === '/dashboard/skills' && <SkillVerificationPage go={go} />}
          {path === '/dashboard/skills/new' && <AssessmentFormPage go={go} />}
          {/^\/dashboard\/skills\/[^/]+\/edit$/.test(path) && <AssessmentFormPage key={path} go={go} assessmentId={decodeURIComponent(path.split('/')[3])} />}
          {/^\/dashboard\/skills\/[^/]+\/attempts$/.test(path) && <AttemptsList go={go} assessmentId={decodeURIComponent(path.split('/')[3])} />}
          {/^\/dashboard\/skills\/[^/]+\/attempts\/[^/]+$/.test(path) && <AttemptDetail go={go} assessmentId={decodeURIComponent(path.split('/')[3])} attemptId={decodeURIComponent(path.split('/')[5])} />}
          {path === '/dashboard/talent' && <TalentDiscoveryPage go={go} />}

          {path === '/dashboard/company' && (
            <CompanyProfile profile={account?.profile} onSaved={onProfileUpdated} />
          )}

          {path === '/dashboard/account' && (
            <div>
              <div style={{ marginBottom: '20px' }}>
                <button className="btn btn-outline btn-sm" onClick={() => go('/dashboard/challenges')}>
                  <Icon name="ArrowLeft" size={15} />
                  <span>Back</span>
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
                    <span className={`status-pill ${account?.profile?.emailVerified ? 'success' : 'warning'}`} style={{ padding: '2px 8px', fontSize: '12.1px' }}>
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
        </div>
      </div>
    </div>
  );
}
