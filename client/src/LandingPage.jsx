import React, { useEffect, useState } from 'react';
import './landing.css';

const iconPaths = {
  spark: ['M12 3l1.8 6.2L20 11l-6.2 1.8L12 19l-1.8-6.2L4 11l6.2-1.8L12 3Z', 'M19 3v4', 'M17 5h4'],
  briefcase: ['M3 8h18v12H3z', 'M8 8V5h8v3', 'M3 13h18', 'M10 13v2h4v-2'],
  building: ['M4 21V5l8-3 8 3v16', 'M2 21h20', 'M8 9v1', 'M12 9v1', 'M16 9v1', 'M8 13v1', 'M12 13v1', 'M16 13v1', 'M10 21v-4h4v4'],
  graduation: ['M2 10l10-5 10 5-10 5L2 10Z', 'M6 12v5c3 2.5 9 2.5 12 0v-5', 'M22 10v6'],
  code: ['m8 8-4 4 4 4', 'm16 8 4 4-4 4', 'm14 5-4 14'],
  globe: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M2 12h20', 'M12 2a15 15 0 0 1 0 20', 'M12 2a15 15 0 0 0 0 20'],
  moon: ['M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z'],
  people: ['M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2', 'M10 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M20 21v-2a4 4 0 0 0-3-3.87', 'M16 3.13a4 4 0 0 1 0 7.75'],
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4Z', 'M7 6H4v3a4 4 0 0 0 4 4', 'M17 6h3v3a4 4 0 0 1-4 4'],
  star: ['m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z'],
  rocket: ['M4.5 16.5c-1.5 1.3-2 4.5-2 4.5s3.2-.5 4.5-2', 'M12 15l-3-3a22 22 0 0 1 2-3c3-3 7-4 10-4 0 3-1 7-4 10a22 22 0 0 1-3 2l-2-2Z', 'M9 12H5l-2 3h5', 'M12 15v4l3 2 2-4', 'M16 8h.01'],
  compass: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'm16.2 7.8-2.7 5.7-5.7 2.7 2.7-5.7 5.7-2.7Z'],
  check: ['m5 12 4 4L19 6'],
  shield: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', 'm9 12 2 2 4-4'],
  sun: ['M12 2v2', 'M12 20v2', 'm4.93 4.93 1.42 1.42', 'm17.65 17.65 1.42 1.42', 'M2 12h2', 'M20 12h2', 'm4.93 19.07 1.42-1.42', 'm17.65 6.35 1.42-1.42', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z'],
  payment: ['M3 6h18v12H3z', 'M3 10h18', 'M7 15h3'],
  arrow: ['M5 12h14', 'm12 5 7 7-7 7'],
};

function LandingIcon({ name, size = 20 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {(iconPaths[name] || iconPaths.spark).map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

const nav = [
  ['Features', '#ecosystem'],
  ['Events', '#hackathon'],
  ['Opportunities', '#opportunities'],
  ['For Business', '#business'],
  ['About', '#community'],
];

const journey = [
  ['01', 'Learn', 'Start where you are', 'graduation'],
  ['02', 'Test', 'Prove what you know', 'code'],
  ['03', 'Verify', 'Earn a real credential', 'shield'],
  ['04', 'Compete', 'Challenge the best', 'trophy'],
  ['05', 'Get Discovered', 'Companies find you', 'star'],
  ['06', 'Work', 'Real projects & pay', 'briefcase'],
];

const ecosystem = [
  { icon: 'rocket', title: 'Hackathons & Innovation', text: 'Explore events where students can build projects and connect with others.', link: '#hackathon', action: 'Learn more' },
  { icon: 'briefcase', title: 'Freelance Ecosystem', text: 'Helping verified freelancers and creators connect with startups and businesses.', link: '#opportunities', action: 'Learn more' },
  { icon: 'building', title: 'Startup Collaboration', text: 'Explore ways for startups to connect with talent and ideas.', link: '#business', action: 'Learn more' },
  { icon: 'graduation', title: 'Student Opportunities', text: 'Providing internships, mentorship, networking and career-building opportunities.', link: '#opportunities', action: 'Learn more' },
];

const workshopFeatures = [
  ['building', 'Company Profile', 'Showcase your organisation and brand.'],
  ['spark', 'Create Workshops', 'Publish professional learning sessions.'],
  ['compass', 'Flexible Scheduling', 'Select dates and workshop duration.'],
  ['payment', 'Pricing Control', 'Choose free or paid workshops.'],
];

const tracks = ['Artificial Intelligence / ML', 'Web3 & Blockchain', 'Cybersecurity & Infra', 'Cross-Platform Apps'];

const opportunityTypes = [
  { icon: 'briefcase', title: 'Full-Time Jobs', text: ['Explore roles across tech, design, marketing & more', 'Learn about opportunities shared with OSF'] },
  { icon: 'graduation', title: 'Internships', text: ['Explore internship opportunities', 'Build experience with organisations'] },
  { icon: 'rocket', title: 'Freelance Projects', text: ['Short-term projects with direct client access', 'Build your portfolio while still studying'] },
];

const hackathonBenefits = [
  ['code', 'Build Real Products', 'Go beyond theoretical coding and build dynamic, functional MVPs that tackle actual workspace and domain issues.'],
  ['people', 'Meet Recruiters', 'Pitch your design skills and engineering talent directly to high-growth startups and standard hiring partners.'],
  ['trophy', 'Show Your Work', 'Present a project and share what you learned.'],
  ['graduation', 'Explore Career Paths', 'Use projects and events to explore roles, internships and freelance work.'],
  ['spark', 'Share Your Ideas', 'Present project ideas and connect with other builders.'],
  ['globe', 'Network With Developers', 'Team up and exchange insights with hundreds of exceptional developers, computer science majors, and designers.'],
];

const communities = [
  ['code', 'Coding Clubs', 'Empowering college coding standard groups to build tomorrow’s software.'],
  ['spark', 'Startup Communities', 'Nurturing early-stage networks of student founders and startup builders.'],
  ['people', 'Student Communities', 'Connect with students across universities and technical communities.'],
  ['building', 'College Innovation Cells', 'Colleges providing incubation support, technical guidance, and administrative cells.'],
  ['shield', 'Developer Communities', 'Uniting passionate open-source coders, web builders, cybersecurity pros, and AI engineers.'],
];

const businessFeatures = [
  ['shield', 'Business Billing', 'Manage billing for your organisation in one place.'],
  ['check', 'Talent Discovery', 'Find candidates whose skills align with your hiring needs.'],
  ['people', 'Clear Agreements', 'Set project expectations and payment terms before work begins.'],
];

const indiaFeatures = [
  ['payment', 'India-Ready Payments', 'Payment options designed for work across India.'],
  ['graduation', 'Campus-to-Career', 'Launch your career with paid student internships.'],
  ['people', 'Indore City Clubs', 'Network offline in Madhya Pradesh and beyond.'],
];

export default function LandingPage({ go, dark, onToggleTheme }) {
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
          <img src="/landing/osf-brand.png" alt="Our Startup Freelancer" />
        </a>
        <button className="landing-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="landing-navigation" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen(open => !open)}>
          <span /><span /><span />
        </button>
        <nav id="landing-navigation" className={'landing-navigation' + (menuOpen ? ' is-open' : '')} aria-label="Main navigation">
          {nav.map(([label, href]) => href.startsWith('#')
            ? <a key={label} href={href} onClick={closeMenu}>{label}</a>
            : <a key={label} href={href} onClick={route(href)}>{label}</a>)}
          <button className="landing-theme-toggle" type="button" onClick={onToggleTheme} aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}>
            <LandingIcon name={dark ? 'sun' : 'moon'} size={16} /><span>{dark ? 'Light' : 'Dark'} mode</span>
          </button>
          <a className="landing-login" href="/login" onClick={route('/login')}>Log in</a>
          <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Join Now <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-content">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> India’s Talent. Global Opportunities.</p>
            <p className="landing-kicker">OUR STARTUP FREELANCER · BUILT IN INDIA · GOING GLOBAL</p>
            <h1 id="landing-title">India’s Platform.<br /><span>The World’s Talent.</span></h1>
            <p className="landing-hero-copy">We are building the infrastructure that connects India’s brightest students, developers, and creators with companies and opportunities worldwide — through hackathons, verified freelancing, and national-scale events.</p>
            <div className="landing-actions landing-hero-actions">
              <a className="landing-button" href="#opportunities">Explore Opportunities <LandingIcon name="arrow" size={16} /></a>
              <a className="landing-button landing-button-outline-dark" href="#business">For Businesses</a>
            </div>
            <div className="landing-hero-proof" aria-label="OSF network facts">
              <span>Student opportunities</span><span>OSF Hackathon 2026</span><span>Pan-India network</span><span>Freelance ecosystem</span>
            </div>
            <div className="landing-proof-strip" aria-label="Our Startup Freelancer network facts">
              <article><span className="landing-metric-icon"><LandingIcon name="people" size={18} /></span><div><strong>Pan-India</strong><small>Student opportunities</small><em>Across communities</em></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="building" size={18} /></span><div><strong>Skills</strong><small>Learning &amp; discovery</small><em>Build your profile</em></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="globe" size={18} /></span><div><strong>Work</strong><small>Projects &amp; internships</small><em>Explore opportunities</em></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="star" size={18} /></span><div><strong>Events</strong><small>Hackathons &amp; more</small><em>Join the community</em></div></article>
            </div>
          </div>
        </section>

        <section className="landing-journey landing-section" id="journey" aria-labelledby="journey-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> OSF — WHAT’S NEXT</p>
            <p className="landing-kicker">SOMETHING WE HAVE BEEN BUILDING, QUIETLY.</p>
            <h2 id="journey-title">You will not just compete.<br /><span>You will get discovered.</span></h2>
            <p>India has never had a system that takes a student all the way — from learning a skill to landing real work. We are building exactly that.</p>
          </div>
          <div className="landing-journey-grid">
            {journey.map(([number, title, text, icon]) => (
              <article className="landing-journey-card" key={number}>
                <span className="landing-journey-mark"><LandingIcon name={icon} /></span>
                <h3>{number} <span>{title}</span></h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
          <div className="landing-journey-callout">
            <div><p className="landing-eyebrow">WHAT THIS MEANS FOR YOU</p><p>A student in any city, any college — gets seen by companies that actually need their skills.</p></div>
            <a href="#ecosystem">Explore the OSF ecosystem <LandingIcon name="arrow" size={16} /></a>
          </div>
        </section>

        <section className="landing-ecosystem landing-section" id="ecosystem" aria-labelledby="ecosystem-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> POWERED BY OUR STARTUP FREELANCER</p>
            <h2 id="ecosystem-title">Building India’s Innovation Ecosystem</h2>
            <p>Our Startup Freelancer brings together students, developers, startups and creators through events, freelance work and startup collaboration.</p>
          </div>
          <div className="landing-ecosystem-grid">
            {ecosystem.map((item, i) => (
              <article className={'landing-ecosystem-card landing-ecosystem-tone-' + (i + 1)} key={item.title}>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                <h3>{item.title}</h3><p>{item.text}</p>
                <a href={item.link}>{item.action} <LandingIcon name="arrow" size={15} /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-workshop landing-section" id="company-workshops" aria-labelledby="workshop-title">
          <div className="landing-workshop-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> FOR COMPANIES & ORGANISATIONS</p>
            <h2 id="workshop-title">Host Your Own<br /><span>Company Workshop.</span></h2>
            <p>Bring your expertise to the next generation. Register your organisation, create professional workshops and share valuable knowledge through interactive learning experiences.</p>
            <div className="landing-workshop-features">
              {workshopFeatures.map(([icon, title, text]) => <article key={title}><LandingIcon name={icon} size={17} /><div><strong>{title}</strong><span>{text}</span></div></article>)}
            </div>
            <div className="landing-actions"><a className="landing-button" href="/register" onClick={route('/register')}>Register Your Company <LandingIcon name="arrow" size={16} /></a><span>Simple 4-step registration</span></div>
          </div>
        </section>

        <section className="landing-hackathon landing-section" id="hackathon" aria-labelledby="hackathon-title">
          <div className="landing-hackathon-heading">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> OUR STARTUP FREELANCER PRESENTS OSF HACKATHON</p>
            <h2 id="hackathon-title">OSF Hackathon 2026</h2>
            <h3>National-Level Engineering &amp; Innovation Championship</h3>
            <p>Take part in a technical and innovation event: collaborate with a team, build a project and share your work.</p>
          </div>
          <div className="landing-hackathon-stats" aria-label="OSF Hackathon facts">
            <div><strong>Build</strong><span>Team projects</span></div><div><strong>Learn</strong><span>New skills</span></div><div><strong>Present</strong><span>Share your work</span></div><div><strong>Connect</strong><span>Meet the community</span></div>
          </div>
          <div className="landing-hackathon-panels">
            <article className="landing-track-panel">
              <div className="landing-panel-heading"><h3>Championship Verticals</h3><span>Tracks</span></div>
              <div className="landing-track-list">{tracks.map(track => <span key={track}><i />{track}</span>)}</div>
              <div className="landing-benefit-list">
                {[
                  ['graduation', 'Explore Opportunities', 'Learn about roles, internships and projects shared with the OSF community.'],
                  ['spark', 'Share Your Project', 'Build a prototype and present your idea to other participants.'],
                  ['trophy', 'Take Part', 'Collaborate with a team and learn through the event.'],
                ].map(([icon, title, text]) => <div key={title}><span><LandingIcon name={icon} size={15} /></span><p><strong>{title}</strong><small>{text}</small></p></div>)}
              </div>
              <p className="landing-panel-footnote">Powered by Our Startup Freelancer evaluation systems</p>
            </article>
            <article className="landing-prize-panel">
              <span className="landing-prize-mark"><LandingIcon name="trophy" size={24} /></span>
              <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> FOR PARTICIPANTS</p>
              <h3>Build &amp; Present Your Work</h3>
              <p>Collaborate on a project, share what you build and connect with the OSF community.</p>
              <strong className="landing-rewards-title">What to expect</strong>
              <ul>
                <li><LandingIcon name="check" size={14} /> Work with a team</li>
                <li><LandingIcon name="check" size={14} /> Explore new ideas</li>
                <li><LandingIcon name="check" size={14} /> Present a project</li>
              </ul>
              <a className="landing-button landing-button-dark" href="https://osfhackathon.in/" target="_blank" rel="noreferrer">OSF Hackathon Website <LandingIcon name="arrow" size={15} /></a>
            </article>
          </div>
        </section>

        <section className="landing-event-reveal landing-section" id="event-announcement" aria-labelledby="event-reveal-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> UPCOMING OSF EVENT</p>
            <h2 id="event-reveal-title">Event Details<br /><span>Coming Soon.</span></h2>
            <p>OSF is preparing an event for students and teams. The name, date and venue have not been announced here yet.</p>
          </div>
          <div className="landing-global-phases" aria-label="Event announcement rollout">
            <article><span><LandingIcon name="people" size={19} /></span><strong>For students</strong></article>
            <article><span><LandingIcon name="building" size={19} /></span><strong>For teams</strong></article>
            <article><span><LandingIcon name="globe" size={19} /></span><strong>Across India</strong></article>
          </div>
        </section>

        <section className="landing-opportunities landing-section" id="opportunities" aria-labelledby="opportunities-title">
          <div className="landing-opportunity-content">
            <div className="landing-section-heading">
              <p className="landing-eyebrow landing-eyebrow-outline"><span /> FOR STUDENTS — ALL OVER INDIA</p>
              <h2 id="opportunities-title">Real Work. Real Pay.<br /><span>Real Opportunities.</span></h2>
              <p>Through this event, students from every corner of India get direct access to full-time jobs, internships, and freelance projects from companies actively looking to hire.</p>
            </div>
            <div className="landing-opportunity-grid">
              {opportunityTypes.map((item, i) => <article className={'landing-opportunity-card landing-opportunity-' + (i + 1)} key={item.title}>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span><h3>{item.title}</h3>
                <ul>{item.text.map(line => <li key={line}>{line}</li>)}</ul>
              </article>)}
            </div>
            <div className="landing-opportunity-stats"><div><strong>Jobs</strong><span>Explore roles</span></div><div><strong>Internships</strong><span>Gain experience</span></div><div><strong>Projects</strong><span>Build your portfolio</span></div><div><strong>Events</strong><span>Meet and collaborate</span></div></div>
          </div>
        </section>

        <section className="landing-why landing-section" aria-labelledby="why-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> WHY JOIN THE CHAMPIONSHIP?</p>
            <h2 id="why-title">Why OSF Hackathon?</h2>
            <p>Accelerate your engineering journey under the mentorship of Our Startup Freelancer.</p>
          </div>
          <div className="landing-why-grid">{hackathonBenefits.map(([icon, title, text]) => <article key={title}><span><LandingIcon name={icon} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-trust landing-section" aria-labelledby="trust-title">
          <div className="landing-trust-copy">
            <p className="landing-eyebrow"><span /> BUILT FOR INDIA’S FREELANCERS</p>
            <h2 id="trust-title">Ditch the Bidding Wars.<br /><span>Work Smarter.</span></h2>
            <article><span className="landing-icon-tile"><LandingIcon name="payment" /></span><div><h3>Payment Clarity</h3><p>Agree on payment terms and milestones with clients before a project starts.</p></div></article>
            <article><span className="landing-icon-tile"><LandingIcon name="shield" /></span><div><h3>Showcase Your Skills</h3><p>Build a profile that helps potential clients understand your experience and work.</p></div></article>
          </div>
          <div className="landing-trust-card" aria-label="OSF skill verification product preview">
            <div className="landing-trust-card-top"><span>● ● ●</span><strong>YOUR PROFILE</strong></div>
            <p className="landing-trust-label">Skills and experience</p><h3>Show what you can do</h3>
            <p>Keep your experience and project work together in one place.</p>
            <div className="landing-trust-metrics"><div><small>Skills</small><strong>Profile</strong></div><div><small>Work</small><strong>Projects</strong></div></div>
            <div className="landing-rate"><span>Next step</span><strong>Explore opportunities</strong></div>
          </div>
        </section>

        <section className="landing-process-section landing-section" id="how-it-works" aria-labelledby="process-title">
          <div className="landing-section-heading landing-centered">
            <h2 id="process-title">How It Works</h2>
            <p>Beginners are supported with AI and 1:1 mentorship from day one.</p>
          </div>
          <div className="landing-process-grid">
            {[
              ['Learn & Grow', 'Explore learning resources and build skills for your next opportunity.', 'shield'],
              ['Get AI-Matched', 'Stop wasting time bidding. Our algorithms find the projects where you have the highest chance of winning instantly.', 'spark'],
              ['Work & Grow', 'Take on projects, build experience and grow your professional profile.', 'payment'],
            ].map(([title, text, icon], i) => <article className="landing-process-card" key={title}>
              <span className="landing-process-number">0{i + 1}</span><span className="landing-icon-tile"><LandingIcon name={icon} /></span><div><h3>{title}</h3><p>{text}</p></div>
            </article>)}
          </div>
        </section>

        <section className="landing-communities landing-section" id="community" aria-labelledby="communities-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> NATIONAL NETWORK REACH</p>
            <h2 id="communities-title">Backed By Communities &amp; Student Networks</h2>
            <p>Connecting multiple technology ecosystems, professional networks, and university incubation campuses together under a single innovation roof.</p>
          </div>
          <div className="landing-community-grid">{communities.map(([icon, title, text]) => <article key={title}><span className="landing-icon-tile"><LandingIcon name={icon} /></span><h3>{title}</h3><p>{text}</p><small>Partner entity</small></article>)}</div>
        </section>

        <section className="landing-language landing-section" aria-labelledby="language-title">
          <div className="landing-language-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> TRULY INCLUSIVE INDIA</p>
            <h2 id="language-title">Work in Your Language.</h2>
            <p>OSF aims to make collaboration more accessible across languages, including Hindi and other regional languages.</p>
            <div className="landing-language-support"><article><strong>Regional languages</strong><span>Explore ways to collaborate in your preferred language.</span></article><article><strong>Local context</strong><span>Designed with India’s diverse communities in mind.</span></article></div>
          </div>
          <div className="landing-language-demo" aria-label="Example language translation">
            <div><small>Hindi example</small><p>“मैंने प्रोजेक्ट का डिजाइन पूरा कर लिया है, आप एक बार चेक कर लीजिये।”</p></div><span aria-hidden="true">↓</span><div><small>English example</small><p>“The project designs are finalized. Kindly review the updates at your convenience.”</p></div>
          </div>
        </section>

        <section className="landing-business-section landing-section" id="business" aria-labelledby="business-title">
          <div className="landing-business-intro">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> FOR BUSINESSES</p>
            <h2 id="business-title">Built for Indian Businesses.</h2>
            <p>Discover talent and opportunities for businesses across India.</p>
            <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Explore for Businesses <LandingIcon name="arrow" size={14} /></a>
          </div>
          <div className="landing-business-grid">{businessFeatures.map(([icon, title, text]) => <article key={title}><span className="landing-icon-tile"><LandingIcon name={icon} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-india-first landing-section" aria-labelledby="india-first-title">
          <div className="landing-india-trust">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> GLOBAL STANDARDS</p>
            <h2 id="india-first-title">The India-First Ecosystem</h2>
            <p>High-trust freelancing for the world, from the heart of Indore.</p>
            <article><strong>Your Profile</strong><p>Bring your skills and experience together in one place.</p><div><strong>OSF</strong><span>Talent network</span></div></article>
          </div>
          <div className="landing-india-grid">{indiaFeatures.map(([icon, title, text]) => <article key={title}><span className="landing-icon-tile"><LandingIcon name={icon} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-final landing-section" aria-labelledby="final-title">
          <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> INDIA’S YOUTH INNOVATION CHAMPIONSHIP 2026</p>
          <h2 id="final-title">Ready To Build The Future?</h2>
          <p>Join the OSF community to explore events, build projects and connect with other innovators.</p>
          <div className="landing-final-actions">
            <a className="landing-button landing-button-light" href="https://osfhackathon.in/" target="_blank" rel="noreferrer">Register Now <LandingIcon name="arrow" size={16} /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-brand"><a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/')}><img src="/landing/osf-brand.png" alt="Our Startup Freelancer" /></a><p>India’s first AI-powered ecosystem for freelancers and businesses. Empowering skills, creating opportunities.</p><small>Build · Launch · Scale</small></div>
        <div className="landing-footer-column"><h2>Platform</h2><a href="#opportunities">For Freelancers</a><a href="#business">For Businesses</a><a href="#journey">Verify Skills</a><a href="#ecosystem">AI Features</a></div>
        <div className="landing-footer-column"><h2>Support</h2><a href="#ecosystem">About OSF</a><a href="/contact" onClick={route('/contact')}>Talk to Us</a><a href="#community">Community Hub</a></div>
        <div className="landing-footer-column"><h2>Headquarters</h2><p>Navlakha, Indore,<br />Madhya Pradesh, 452001<br />India</p><a href="mailto:contact@ourstartupfreelancer.com">contact@ourstartupfreelancer.com</a><a href="tel:+919424871885">+91 94248 71885</a></div>
        <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Our Startup Freelancer. Empowering Indian talent.</span><span>Made with <b>♥</b> in Indore.</span></div>
      </footer>
    </div>
  );
}
