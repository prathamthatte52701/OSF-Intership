import React, { useEffect, useState } from 'react';
import './landing.css';

const iconPaths = {
  spark: ['M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z', 'M19 3v4', 'M17 5h4'],
  briefcase: ['M3 8h18v12H3z', 'M8 8V5h8v3', 'M3 13h18', 'M10 13v2h4v-2'],
  building: ['M4 21V5l8-3 8 3v16', 'M2 21h20', 'M8 9v1', 'M12 9v1', 'M16 9v1', 'M8 13v1', 'M12 13v1', 'M16 13v1', 'M10 21v-4h4v4'],
  graduation: ['M2 10l10-5 10 5-10 5L2 10Z', 'M6 12v5c3 2.5 9 2.5 12 0v-5', 'M22 10v6'],
  code: ['m8 8-4 4 4 4', 'm16 8 4 4-4 4', 'm14 5-4 14'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M20 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  compass: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'm16.2 7.8-2.7 5.7-5.7 2.7 2.7-5.7 5.7-2.7Z'],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
  check: ['m5 12 4 4L19 6'],
};

function LandingIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(iconPaths[name] || iconPaths.spark).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const journey = [
  ['01', 'Learn', 'Build knowledge at your own pace.'],
  ['02', 'Test', 'Put ideas into practical work.'],
  ['03', 'Verify', 'Show the skills behind your work.'],
  ['04', 'Compete', 'Take part in themed challenges.'],
  ['05', 'Get discovered', 'Make your projects easier to find.'],
  ['06', 'Work', 'Explore roles and project opportunities.'],
];

const ecosystem = [
  { icon: 'spark', title: 'Hackathons & innovation', text: 'Practice solving real-world problems through focused events and collaborative challenges.' },
  { icon: 'briefcase', title: 'Freelance ecosystem', text: 'Explore independent projects, develop a portfolio, and connect with businesses looking for specific skills.' },
  { icon: 'building', title: 'Startup collaboration', text: 'Bring early-stage teams and emerging talent into the same conversation around ideas and execution.' },
  { icon: 'graduation', title: 'Student opportunities', text: 'Find pathways to internships, mentorship, campus communities, and career exploration.' },
];

const opportunities = [
  { icon: 'briefcase', tone: 'blue', title: 'Full-time roles', text: 'Explore early-career roles shared by organizations looking for emerging talent. Openings and requirements vary by employer.' },
  { icon: 'graduation', tone: 'purple', title: 'Paid internships', text: 'Build practical experience through internships with a defined scope, timeline, and expectations.' },
  { icon: 'spark', tone: 'orange', title: 'Freelance projects', text: 'Find scoped assignments where creators can contribute, learn, and add meaningful work to a portfolio.' },
];

const process = [
  { icon: 'compass', title: 'Explore a pathway', text: 'Find a community, event, project, or opportunity that fits where you are today.' },
  { icon: 'code', title: 'Build with purpose', text: 'Use practical work to develop skills and make your contribution visible.' },
  { icon: 'people', title: 'Make a connection', text: 'Bring your work into conversations with peers, startups, and businesses.' },
];

const communities = [
  { icon: 'code', title: 'Coding clubs', text: 'Student-led groups building technical skills and sharing what they learn.' },
  { icon: 'spark', title: 'Startup communities', text: 'Founder networks for exchanging ideas, feedback, and early-stage experience.' },
  { icon: 'people', title: 'Student ambassadors', text: 'Campus voices who help peers discover programs and opportunities.' },
  { icon: 'building', title: 'College innovation cells', text: 'Campus teams connecting student ideas with guidance and resources.' },
  { icon: 'globe', title: 'Developer communities', text: 'People collaborating across open source, design, security, and emerging technology.' },
];

const nav = [
  ['For talent', '#opportunities'],
  ['Hackathon', '#hackathon'],
  ['Communities', '#community'],
  ['For businesses', '#business'],
  ['Contact', '/contact'],
];

export default function LandingPage({ go }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const route = path => event => {
    event.preventDefault();
    setMenuOpen(false);
    go(path);
  };
  const closeMenu = () => setMenuOpen(false);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const handleEscape = event => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [menuOpen]);

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/')}>
          <img src="/osf-logo.png" alt="Our Startup Freelancer" />
        </a>
        <button className="landing-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="landing-navigation" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen(open => !open)}>
          <span /><span /><span />
        </button>
        <nav id="landing-navigation" className={'landing-navigation' + (menuOpen ? ' is-open' : '')} aria-label="Main navigation">
          {nav.map(([label, href]) => href.startsWith('#')
            ? <a key={label} href={href} onClick={closeMenu}>{label}</a>
            : <a key={label} href={href} onClick={route(href)}>{label}</a>)}
          <a className="landing-login" href="/login" onClick={route('/login')}>Log in</a>
          <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Company registration <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-grid" aria-hidden="true" />
          <div className="landing-hero-content">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> BUILT IN INDIA <span className="landing-eyebrow-divider">·</span> CONNECTING TALENT</p>
            <p className="landing-kicker">OUR STARTUP FREELANCER · BUILT IN INDIA · GOING GLOBAL</p>
            <h1 id="landing-title">India’s Platform.<br /><span>The World’s Talent.</span></h1>
            <p className="landing-hero-copy">Connecting India’s students, creators, startups, and businesses through practical projects, hackathons, and career opportunities.</p>
            <div className="landing-actions">
              <a className="landing-button" href="#opportunities">Explore opportunities <LandingIcon name="arrow" size={17} /></a>
              <a className="landing-text-link landing-text-link-dark" href="#business">For businesses <span aria-hidden="true">↓</span></a>
            </div>
          </div>
          <div className="landing-hero-visual" role="img" aria-label="OSF connects students, startups, companies, and campuses">
            <div className="landing-hero-connection landing-hero-connection-a" />
            <div className="landing-hero-connection landing-hero-connection-b" />
            <div className="landing-hero-connection landing-hero-connection-c" />
            <div className="landing-hero-hub"><img src="/osf-logo.png" alt="" /><span>Opportunity<br />ecosystem</span></div>
            <div className="landing-hero-node landing-hero-node-students"><LandingIcon name="graduation" /><strong>Students<br />& creators</strong></div>
            <div className="landing-hero-node landing-hero-node-startups"><LandingIcon name="spark" /><strong>Startups</strong></div>
            <div className="landing-hero-node landing-hero-node-business"><LandingIcon name="building" /><strong>Businesses</strong></div>
            <div className="landing-hero-node landing-hero-node-campus"><LandingIcon name="people" /><strong>Campuses</strong></div>
            <span className="landing-hero-caption">Skills · projects · opportunity</span>
          </div>
          <a className="landing-scroll-cue" href="#journey" aria-label="Scroll to the OSF journey">↓</a>
        </section>

        <section className="landing-proof-strip" aria-label="OSF HackOne 2K26 facts">
          <article><strong>48 hours</strong><span>Hackathon build sprint</span></article>
          <article><strong>6 tracks</strong><span>Technology and innovation</span></article>
          <article><strong>Online</strong><span>National-level event</span></article>
          <article><strong>Completed</strong><span>OSF HackOne 2K26</span></article>
        </section>

        <section className="landing-journey landing-section" id="journey" aria-labelledby="journey-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> OSF · WHAT’S NEXT</p>
            <p className="landing-kicker">A PATHWAY FROM LEARNING TO OPPORTUNITY</p>
            <h2 id="journey-title">You won’t just compete.<br /><span>You’ll build what comes next.</span></h2>
            <p>There are many ways to grow into meaningful work. OSF brings skills, communities, and opportunities into one wider journey.</p>
          </div>
          <div className="landing-journey-grid">
            {journey.map(([number, title, text], i) => (
              <article className={'landing-journey-card landing-accent-' + (i + 1)} key={number}>
                <span className="landing-journey-number">{number}</span>
                <span className="landing-journey-mark"><LandingIcon name={['spark', 'check', 'compass', 'code', 'people', 'briefcase'][i]} /></span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <aside className="landing-journey-banner">
            <div>
              <span className="landing-banner-label">WHAT THIS CAN MEAN</span>
              <h3>A student’s work should be seen for the skills it shows.</h3>
              <p>OSF is building more ways for emerging talent and organizations to meet around real work.</p>
            </div>
            <a className="landing-button landing-button-light" href="#opportunities">Explore pathways <LandingIcon name="arrow" size={16} /></a>
          </aside>
        </section>

        <section className="landing-ecosystem landing-section" id="ecosystem" aria-labelledby="ecosystem-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> A CONNECTED STARTUP ECOSYSTEM</p>
            <h2 id="ecosystem-title">Building India’s innovation ecosystem.</h2>
            <p>OSF brings students, creators, startups, and businesses closer through practical work and shared opportunity.</p>
          </div>
          <div className="landing-ecosystem-grid">
            {ecosystem.map((item, i) => (
              <article className={'landing-ecosystem-card landing-ecosystem-tone-' + (i + 1)} key={item.title}>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <a href={i === 0 ? '#hackathon' : i === 3 ? '#opportunities' : '#business'} aria-label={'Explore ' + item.title}>Explore <LandingIcon name="arrow" size={15} /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-workshop landing-section" id="business" aria-labelledby="workshop-title">
          <div className="landing-workshop-copy">
            <p className="landing-eyebrow"><span /> FOR COMPANIES & ORGANIZATIONS</p>
            <p className="landing-kicker">A PRACTICAL WAY TO MEET EMERGING TALENT</p>
            <h2 id="workshop-title">Host your own<br /><span>company workshop.</span></h2>
            <p>Bring a business question, product, or skill area to a focused session. OSF can help shape the format around your objectives and the people you want to reach.</p>
            <div className="landing-feature-list">
              <div><span><LandingIcon name="building" size={18} /></span><p><strong>Start with your organization</strong><small>Set up a company profile in the OSF portal.</small></p></div>
              <div><span><LandingIcon name="spark" size={18} /></span><p><strong>Shape a useful session</strong><small>Build a workshop or challenge around a clear goal.</small></p></div>
              <div><span><LandingIcon name="people" size={18} /></span><p><strong>Connect around real work</strong><small>Make room for practical ideas and direct conversation.</small></p></div>
            </div>
            <div className="landing-actions">
              <a className="landing-button" href="/register" onClick={route('/register')}>Company registration <LandingIcon name="arrow" size={16} /></a>
              <a className="landing-text-link landing-text-link-dark" href="/contact" onClick={route('/contact')}>Talk with OSF</a>
            </div>
          </div>
          <div className="landing-workshop-visual" role="group" aria-label="Illustrative company workshop setup preview">
            <div className="landing-workshop-window">
              <div className="landing-window-top"><span /><span /><span /><b>Company workshop</b></div>
              <div className="landing-workshop-app">
                <div className="landing-workshop-app-head"><span className="landing-app-icon"><LandingIcon name="building" size={16} /></span><div><strong>Workshop workspace</strong><small>Plan an engagement with OSF</small></div><span className="landing-preview-tag">PREVIEW</span></div>
                <div className="landing-workshop-progress"><span>01</span><i /><span>02</span><i /><span>03</span></div>
                <div className="landing-workshop-field"><span>SESSION GOAL</span><strong>What would you like to explore?</strong></div>
                <div className="landing-workshop-fields">
                  <div><span>ORGANIZATION</span><strong>Your company</strong></div>
                  <div><span>FORMAT</span><strong>Workshop or challenge</strong></div>
                </div>
                <div className="landing-workshop-challenge">
                  <span><LandingIcon name="spark" size={17} /></span>
                  <div><strong>Bring a practical question</strong><small>Give participants a clear way to contribute.</small></div>
                </div>
                <div className="landing-workshop-foot"><span>Flexible format · Clear objectives</span><span className="landing-workshop-next">Continue <LandingIcon name="arrow" size={13} /></span></div>
              </div>
            </div>
            <p className="landing-visual-caption">A visual preview of a workshop planning flow.</p>
          </div>
        </section>

        <section className="landing-hackathon landing-section" id="hackathon" aria-labelledby="hackathon-title">
          <div className="landing-hackathon-intro">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> OSF HACKONE 2K26 · EVENT COMPLETED</p>
            <p className="landing-kicker">A 48-HOUR NATIONAL INNOVATION SPRINT</p>
            <h2 id="hackathon-title">Ideas take shape<br />when teams build together.</h2>
            <p>The 2026 OSF HackOne edition has concluded. It brought teams together online for a focused build sprint across six technology and innovation tracks.</p>
            <a className="landing-button" href="https://www.osfhackathon.in/" target="_blank" rel="noreferrer">Visit the official event page <LandingIcon name="arrow" size={16} /></a>
            <p className="landing-fact-note">Visit the official event page for the published edition details.</p>
          </div>
          <div className="landing-hackathon-card">
            <div className="landing-hackathon-card-head"><span>EVENT SNAPSHOT</span><span className="landing-complete-status"><i /> COMPLETED</span></div>
            <div className="landing-event-art" aria-hidden="true">
              <div className="landing-trophy-glow">
                <svg viewBox="0 0 120 120" fill="none">
                  <path d="M34 20h52v17c0 23-11 37-26 37S34 60 34 37V20Z" fill="url(#trophyGold)" />
                  <path d="M34 29H19v10c0 15 9 24 22 25M86 29h15v10c0 15-9 24-22 25" stroke="#f6bd55" strokeWidth="7" strokeLinecap="round" />
                  <path d="M53 74v16H39v10h42V90H67V74" fill="#d68a2a" />
                  <path d="m60 30 3.8 8 8.8 1.3-6.3 6.1 1.5 8.7-7.8-4.1-7.8 4.1 1.5-8.7-6.3-6.1 8.8-1.3L60 30Z" fill="#fff3c2" />
                  <defs><linearGradient id="trophyGold" x1="34" y1="20" x2="88" y2="73" gradientUnits="userSpaceOnUse"><stop stopColor="#ffe79a" /><stop offset=".48" stopColor="#f7b83f" /><stop offset="1" stopColor="#c97518" /></linearGradient></defs>
                </svg>
              </div>
              <div><strong>OSF HackOne 2K26</strong><span>Build · collaborate · create</span></div>
            </div>
            <div className="landing-hackathon-stats">
              <div><strong>48<small>h</small></strong><span>Build sprint</span></div>
              <div><strong>06</strong><span>Innovation tracks</span></div>
            </div>
            <div className="landing-track-list">
              <span>Artificial intelligence</span>
              <span>Sustainability & clean tech</span>
              <span>Health technology</span>
              <span>Smart cities & IoT</span>
              <span>Cybersecurity & blockchain</span>
              <span>Education & social impact</span>
            </div>
            <div className="landing-hackathon-card-foot"><span>OSF HACKONE 2K26</span><span>ONLINE · PAN-INDIA</span></div>
          </div>
        </section>

        <section className="landing-opportunities landing-section" id="opportunities" aria-labelledby="opportunities-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> FOR STUDENTS & CREATORS</p>
            <h2 id="opportunities-title">Real work. Real possibilities.</h2>
            <p>Explore different ways to gain experience, make a contribution, and discover where your skills can take you.</p>
          </div>
          <div className="landing-opportunity-grid">
            {opportunities.map(item => (
              <article className={'landing-opportunity-card landing-opportunity-' + item.tone} key={item.title}>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
                <a href="#how-it-works">See how OSF works <LandingIcon name="arrow" size={15} /></a>
              </article>
            ))}
          </div>
          <p className="landing-availability-note">Opportunities depend on current programs and participating organizations; outcomes are not guaranteed.</p>
        </section>

        <section className="landing-evidence landing-section" aria-labelledby="evidence-title">
          <div className="landing-evidence-copy">
            <p className="landing-eyebrow"><span /> SKILLS IN CONTEXT</p>
            <p className="landing-kicker">WORK SHOULD SAY MORE THAN A BID</p>
            <h2 id="evidence-title">Let the work<br /><span>speak for itself.</span></h2>
            <p>Portfolios, clear project briefs, and practical challenges can make experience easier to understand—so students and organizations have more to discuss than a list of claims.</p>
            <a className="landing-text-link landing-text-link-dark" href="#how-it-works">How OSF works <LandingIcon name="arrow" size={16} /></a>
          </div>
          <div className="landing-evidence-visual" role="group" aria-label="Illustration of a project brief and portfolio">
            <div className="landing-evidence-profile">
              <div className="landing-evidence-profile-top"><span className="landing-profile-avatar">OS</span><span><strong>Creator profile</strong><small>Skills shown through work</small></span><span className="landing-profile-open">PORTFOLIO</span></div>
              <div className="landing-skill-tags"><span>Design</span><span>Research</span><span>Web</span></div>
              <div className="landing-evidence-project"><span className="landing-project-mark"><LandingIcon name="code" /></span><span><strong>Project sample</strong><small>A short description of the work and contribution.</small></span><LandingIcon name="arrow" size={15} /></div>
              <div className="landing-evidence-project"><span className="landing-project-mark landing-project-mark-gold"><LandingIcon name="spark" /></span><span><strong>Challenge response</strong><small>Context, approach, and what was learned.</small></span><LandingIcon name="arrow" size={15} /></div>
              <p className="landing-evidence-note"><LandingIcon name="check" size={14} /> Examples that put skills in context.</p>
            </div>
            <div className="landing-evidence-float"><LandingIcon name="briefcase" size={18} /><span>Project brief</span><strong>Clear scope</strong></div>
          </div>
        </section>

        <section className="landing-process-section landing-section" id="how-it-works" aria-labelledby="process-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> HOW IT WORKS</p>
            <h2 id="process-title">A simple path<br />from curiosity to contribution.</h2>
            <p>Programs differ, but the aim is straightforward: make it easier to find a place to start, build experience, and connect.</p>
          </div>
          <div className="landing-process-grid">
            {process.map((item, i) => (
              <article className="landing-process-card" key={item.title}>
                <span className="landing-process-number">0{i + 1}</span>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-community landing-section" id="community" aria-labelledby="community-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> NATIONAL NETWORK</p>
            <h2 id="community-title">Strong communities<br />make more room to grow.</h2>
            <p>OSF’s ecosystem is shaped around the groups that help students learn, build, and find their next connection.</p>
          </div>
          <div className="landing-community-grid">
            {communities.map(item => (
              <article className="landing-community-card" key={item.title}>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
          <p className="landing-community-note">Each community brings a different perspective to learning, building, and sharing opportunities.</p>
        </section>

        <section className="landing-language landing-section" aria-labelledby="language-title">
          <div className="landing-language-copy">
            <p className="landing-eyebrow"><span /> TRULY INCLUSIVE INDIA</p>
            <p className="landing-kicker">LANGUAGE SHOULD NOT LIMIT OPPORTUNITY</p>
            <h2 id="language-title">Work in your<br /><span>language.</span></h2>
            <p>India’s students and creators bring many languages and perspectives. OSF’s India-first vision includes making information and participation more accessible across them.</p>
            <p className="landing-language-note">Language access remains a priority as OSF continues to develop its platform.</p>
          </div>
          <div className="landing-language-visual" role="group" aria-label="Illustrative language access interface concept">
            <div className="landing-language-interface-head"><span>LANGUAGE ACCESS · CONCEPT PREVIEW</span><span>English <i>→</i> हिन्दी</span></div>
            <div className="landing-language-message landing-language-message-source"><span>YOUR MESSAGE · ENGLISH</span><p>“I’ve finished the project design. Could you review it?”</p><small>Example project update</small></div>
            <div className="landing-language-connector"><span>↓</span><i /></div>
            <div className="landing-language-message landing-language-message-context"><span>HINDI · ILLUSTRATIVE EXAMPLE</span><p lang="hi">“मैंने प्रोजेक्ट डिज़ाइन पूरा कर लिया है। क्या आप इसकी समीक्षा कर सकते हैं?”</p><small>A concept for more accessible collaboration</small></div>
            <div className="landing-language-options"><span>English</span><span>हिन्दी</span><span>தமிழ்</span><span>తెలుగు</span><span>বাংলা</span></div>
          </div>
        </section>

        <section className="landing-india landing-section" aria-labelledby="india-title">
          <div className="landing-india-heading">
            <div>
              <p className="landing-eyebrow"><span /> FOR INDIAN BUSINESSES</p>
              <h2 id="india-title">Built for Indian businesses.<br /><span>Open to wider possibilities.</span></h2>
              <p>Start with a company profile, then talk with OSF about the right way to engage with emerging talent.</p>
            </div>
            <a className="landing-button landing-button-outline-dark" href="/register" onClick={route('/register')}>Explore company registration <LandingIcon name="arrow" size={16} /></a>
          </div>
          <div className="landing-india-grid">
            <article><span className="landing-icon-tile"><LandingIcon name="building" /></span><h3>Company profile</h3><p>Keep your registered organization details in one place in the OSF portal.</p></article>
            <article><span className="landing-icon-tile"><LandingIcon name="spark" /></span><h3>Practical engagement</h3><p>Explore workshops, challenges, and other formats around a clear business goal.</p></article>
            <article><span className="landing-icon-tile"><LandingIcon name="people" /></span><h3>Campus connections</h3><p>Bring student communities and business questions closer through purposeful programs.</p></article>
          </div>
        </section>

        <section className="landing-final landing-section" aria-labelledby="final-title">
          <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> BUILD · LAUNCH · SCALE</p>
          <h2 id="final-title">Ready to find your<br /><span>place in the ecosystem?</span></h2>
          <p>Explore OSF’s pathways for talent, businesses, and campus communities.</p>
          <div className="landing-final-actions">
            <a className="landing-button landing-button-light" href="#opportunities">For students & creators <LandingIcon name="arrow" size={16} /></a>
            <a className="landing-button landing-button-outline-light" href="/register" onClick={route('/register')}>For businesses <LandingIcon name="arrow" size={16} /></a>
            <a className="landing-text-link" href="/contact" onClick={route('/contact')}>Campus & community contact</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/')}><img src="/osf-logo.png" alt="Our Startup Freelancer" /></a>
        <p>Connecting talent, ideas, and opportunity across India.</p>
        <nav aria-label="Footer navigation">
          <a href="#journey">OSF Journey</a>
          <a href="#hackathon">Hackathon</a>
          <a href="#community">Communities</a>
          <a href="#business">For businesses</a>
          <a href="/contact" onClick={route('/contact')}>Contact</a>
          <a href="/login" onClick={route('/login')}>Log in</a>
        </nav>
        <span>© {new Date().getFullYear()} Our Startup Freelancer (OSF). All rights reserved.</span>
      </footer>
    </div>
  );
}
