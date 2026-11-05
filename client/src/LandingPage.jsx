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
  trophy: ['M8 21h8', 'M12 17v4', 'M7 4h10v5a5 5 0 0 1-10 0V4Z', 'M7 6H4v3a4 4 0 0 0 4 4', 'M17 6h3v3a4 4 0 0 1-4 4'],
  star: ['m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z'],
  rocket: ['M4.5 16.5c-1.5 1.3-2 4.5-2 4.5s3.2-.5 4.5-2', 'M12 15l-3-3a22 22 0 0 1 2-3c3-3 7-4 10-4 0 3-1 7-4 10a22 22 0 0 1-3 2l-2-2Z', 'M9 12H5l-2 3h5', 'M12 15v4l3 2 2-4', 'M16 8h.01'],
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
  ['01', 'Learn', 'Build skills with expert resources.', 'graduation'],
  ['02', 'Test', 'Take real-world challenges.', 'code'],
  ['03', 'Verify', 'Showcase your capabilities.', 'check'],
  ['04', 'Compete', 'Participate in exciting events.', 'trophy'],
  ['05', 'Get Discovered', 'Be noticed by top companies.', 'star'],
  ['06', 'Work', 'Grab opportunities that matter.', 'rocket'],
];

const ecosystem = [
  { icon: 'trophy', title: 'Hackathons & Innovation', text: 'Participate in hackathons and innovation challenges.', link: '#hackathon', action: 'Explore Events' },
  { icon: 'briefcase', title: 'Freelance Ecosystem', text: 'Find real projects and grow your freelance portfolio.', link: '#opportunities', action: 'Start Freelancing' },
  { icon: 'people', title: 'Startup Collaboration', text: 'Collaborate with startups and turn ideas into impact.', link: '#business', action: 'Partner With Us' },
  { icon: 'graduation', title: 'Student Opportunities', text: 'Discover jobs, internships and more.', link: '#opportunities', action: 'Explore Opportunities' },
];

const opportunities = [
  { icon: 'briefcase', tone: 'blue', title: 'Full-Time Jobs', text: 'Kickstart your career with opportunities from companies.' },
  { icon: 'graduation', tone: 'purple', title: 'Paid Internships', text: 'Gain hands-on experience and grow your skills.' },
  { icon: 'rocket', tone: 'orange', title: 'Freelance Projects', text: 'Work on real projects and build your portfolio.' },
];

const reasons = [
  { icon: 'code', title: 'Build Real Products' },
  { icon: 'people', title: 'Meet Recruiters' },
  { icon: 'trophy', title: 'Showcase Your Skills' },
  { icon: 'briefcase', title: 'Explore Internships' },
  { icon: 'globe', title: 'Network with Innovators' },
];

const process = [
  { icon: 'compass', title: 'Learn & Verify', text: 'Complete skills assessments.' },
  { icon: 'trophy', title: 'Find Opportunities', text: 'Explore pathways that fit your skills.' },
  { icon: 'check', title: 'Build Experience', text: 'Take part in practical work.' },
];

const nav = [
  ['Features', '#ecosystem'],
  ['Events', '#hackathon'],
  ['Opportunities', '#opportunities'],
  ['For Business', '#business'],
  ['Pricing', '/contact'],
  ['About', '#community'],
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
          <img src="/landing/osf-brand.png" alt="Our Startup Freelancer" />
        </a>
        <button className="landing-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="landing-navigation" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen(open => !open)}>
          <span /><span /><span />
        </button>
        <nav id="landing-navigation" className={'landing-navigation' + (menuOpen ? ' is-open' : '')} aria-label="Main navigation">
          {nav.map(([label, href]) => href.startsWith('#')
            ? <a key={label} href={href} onClick={closeMenu}>{label}</a>
            : <a key={label} href={href} onClick={route(href)}>{label}</a>)}
          <a className="landing-login" href="/login" onClick={route('/login')}>Log in</a>
          <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Join Now <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main>
        <section className="landing-hero" aria-labelledby="landing-title">
          <div className="landing-hero-grid" aria-hidden="true" />
          <div className="landing-hero-content">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> India’s Talent. Global Opportunities.</p>
            <h1 id="landing-title">India’s Platform.<br /><span>The World’s Talent.</span></h1>
            <p className="landing-hero-copy">Connect. Collaborate. Grow. — with a platform built for students, creators and businesses.</p>
            <div className="landing-actions">
              <a className="landing-button" href="#opportunities">Explore Opportunities <LandingIcon name="arrow" size={17} /></a>
              <a className="landing-button landing-button-outline-dark" href="#business">For Businesses</a>
            </div>
            <div className="landing-proof-strip" aria-label="OSF HackOne 2K26 facts">
              <article><span className="landing-metric-icon"><LandingIcon name="trophy" size={17} /></span><div><strong>48 Hours</strong><small>Innovation sprint</small></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="building" size={17} /></span><div><strong>6 Tracks</strong><small>Challenge categories</small></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="globe" size={17} /></span><div><strong>Online</strong><small>National event</small></div></article>
            </div>
          </div>
          <div className="landing-hero-visual" role="img" aria-label="OSF connects students, startups, companies, and campuses">
            <img src="/landing/hero-student.webp" alt="Student creator with a laptop" />
            <span className="landing-hero-float landing-hero-float-event"><LandingIcon name="trophy" /> Join<br />Hackathons</span>
            <span className="landing-hero-float landing-hero-float-skills"><LandingIcon name="star" /> Showcase<br />Your Skills</span>
          </div>
          <a className="landing-scroll-cue" href="#journey" aria-label="Scroll to the OSF journey">↓</a>
        </section>

        <section className="landing-journey landing-section" id="journey" aria-labelledby="journey-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> OSF · WHAT’S NEXT</p>
            <h2 id="journey-title">Learn. Build. Get Discovered. <span>Work.</span></h2>
          </div>
          <div className="landing-journey-grid">
            {journey.map(([number, title, text, icon], i) => (
              <article className={'landing-journey-card landing-accent-' + (i + 1)} key={number}>
                <span className="landing-journey-mark"><LandingIcon name={icon} /></span>
                <h3>{number}. {title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
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
                <a href={item.link} aria-label={item.action}>{item.action} <LandingIcon name="arrow" size={15} /></a>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-workshop landing-section" id="business" aria-labelledby="workshop-title">
          <div className="landing-workshop-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> HOST A WORKSHOP</p>
            <h2 id="workshop-title">Host Your Own<br /><span>Company Workshop.</span></h2>
            <p>Bring your expertise to the next generation. Register your workshop, create professional sessions and share valuable knowledge through interactive learning experiences.</p>
            <div className="landing-actions">
              <a className="landing-button" href="/register" onClick={route('/register')}>Register Your Workshop <LandingIcon name="arrow" size={16} /></a>
            </div>
          </div>
          <div className="landing-workshop-visual" role="group" aria-label="Illustrative company workshop setup preview">
            <img src="/landing/workshop-dashboard.webp" alt="Preview of the OSF company workshop dashboard" />
          </div>
        </section>

        <section className="landing-hackathon landing-section" id="hackathon" aria-labelledby="hackathon-title">
          <div className="landing-hackathon-intro">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> OSF HACKATHON 2K26</p>
            <h2 id="hackathon-title">OSF HackOne 2K26</h2>
            <p>A national-level engineering and innovation championship. The completed 48-hour online sprint brought teams together across six innovation tracks.</p>
            <a className="landing-hackathon-link" href="https://www.osfhackathon.in/" target="_blank" rel="noreferrer">View Event Highlights <LandingIcon name="arrow" size={16} /></a>
          </div>
          <div className="landing-hackathon-art" aria-hidden="true"><img src="/landing/hackathon-trophy.webp" alt="" /></div>
          <div className="landing-hackathon-highlights">
            <h3>Event Highlights</h3>
            <div><strong>48<small>h</small></strong><span>Build Sprint</span></div>
            <div><strong>06</strong><span>Tracks</span></div>
            <div><strong><LandingIcon name="check" size={20} /></strong><span>Completed</span></div>
          </div>
        </section>

        <section className="landing-opportunities landing-section" id="opportunities" aria-labelledby="opportunities-title">
          <div className="landing-opportunity-content">
            <div className="landing-section-heading">
              <p className="landing-eyebrow landing-eyebrow-outline"><span /> OPPORTUNITIES</p>
              <h2 id="opportunities-title">Real Work. Real Pay. Real <span>Opportunities.</span></h2>
            </div>
            <div className="landing-opportunity-grid">
              {opportunities.map(item => (
                <article className={'landing-opportunity-card landing-opportunity-' + item.tone} key={item.title}>
                  <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                  <div><h3>{item.title}</h3><p>{item.text}</p></div>
                </article>
              ))}
            </div>
            <p className="landing-availability-note">Opportunities depend on current programs and participating organizations; outcomes are not guaranteed.</p>
          </div>
          <img className="landing-opportunity-art" src="/landing/creator-student.webp" alt="Student creator working on a laptop" />
        </section>

        <section className="landing-why landing-section" aria-labelledby="why-title">
          <div className="landing-why-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> WHY OSF</p>
            <h2 id="why-title">Why OSF Hackathon?</h2>
            <p>Build real products, solve meaningful problems, and open new doors through hands-on work.</p>
            <a className="landing-button landing-button-small" href="https://www.osfhackathon.in/" target="_blank" rel="noreferrer">Know More <LandingIcon name="arrow" size={14} /></a>
          </div>
          <div className="landing-why-grid">
            {reasons.map(item => <article key={item.title}><span><LandingIcon name={item.icon} /></span><strong>{item.title}</strong></article>)}
          </div>
        </section>

        <section className="landing-community-business" id="community" aria-label="Community and business pathways">
          <article className="landing-community-feature">
            <div>
              <p className="landing-eyebrow landing-eyebrow-outline"><span /> JOIN OUR COMMUNITY</p>
              <h2>Connect. Collaborate. Grow.</h2>
              <p>Be part of a vibrant community of students, creators and innovators across India.</p>
              <a className="landing-button landing-button-small" href="/contact" onClick={route('/contact')}>Join Community <LandingIcon name="arrow" size={14} /></a>
            </div>
            <img src="/landing/student-community.webp" alt="Students collaborating in a campus community" />
          </article>
          <article className="landing-business-feature">
            <div>
              <p className="landing-eyebrow landing-eyebrow-outline"><span /> FOR BUSINESSES</p>
              <h2>Built for Indian Businesses.</h2>
              <p>Hire top talent, collaborate on projects and be part of India’s growth story.</p>
              <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Explore Business Solutions <LandingIcon name="arrow" size={14} /></a>
            </div>
            <img src="/landing/business-building.webp" alt="Illustration of an Indian business campus" />
          </article>
        </section>

        <section className="landing-process-section landing-section" id="how-it-works" aria-labelledby="process-title">
          <div className="landing-section-heading landing-centered">
            <h2 id="process-title">How It Works</h2>
            <p>Begin with a skill, find the right opportunity, and build experience through practical work.</p>
          </div>
          <div className="landing-process-grid">
            {process.map((item, i) => (
              <article className="landing-process-card" key={item.title}>
                <span className="landing-process-number">0{i + 1}</span>
                <span className="landing-icon-tile"><LandingIcon name={item.icon} /></span>
                <div><h3>{item.title}</h3><p>{item.text}</p></div>
              </article>
            ))}
          </div>
        </section>

        <section className="landing-language landing-section" aria-labelledby="language-title">
          <div className="landing-language-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> 12. LANGUAGE SUPPORT</p>
            <h2 id="language-title">Work in Your Language.</h2>
            <p>Access opportunities and resources in your preferred language.</p>
          </div>
          <div className="landing-language-widget" role="group" aria-label="Illustrative regional language options">
            <div className="landing-language-symbol" aria-hidden="true"><strong>A</strong><span>文</span></div>
            <div className="landing-language-options"><span>English</span><span>हिन्दी</span><span>தமிழ்</span><span>తెలుగు</span><span>বাংলা</span><span>+ More</span></div>
            <small>Illustrative language options · availability varies by program</small>
          </div>
        </section>

        <section className="landing-business-benefits" aria-labelledby="business-benefits-title">
          <div className="landing-business-benefits-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> 13. BUSINESS BENEFITS</p>
            <h2 id="business-benefits-title">Partner with OSF.</h2>
            <p>Find talent, launch challenges and grow with OSF.</p>
            <ul>
              <li><LandingIcon name="check" size={15} /> Student talent</li>
              <li><LandingIcon name="check" size={15} /> Flexible engagement</li>
              <li><LandingIcon name="check" size={15} /> India-first support</li>
            </ul>
            <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Partner with OSF <LandingIcon name="arrow" size={14} /></a>
          </div>
          <img src="/landing/business-building.webp" alt="Illustration of a modern Indian business campus" />
        </section>

        <section className="landing-final landing-section" aria-labelledby="final-title">
          <h2 id="final-title">Ready to Build the Future?</h2>
          <p>Join OSF today and be part of India’s growing talent ecosystem.</p>
          <div className="landing-final-actions">
            <a className="landing-button landing-button-light" href="#opportunities">Join as Student <LandingIcon name="arrow" size={16} /></a>
            <a className="landing-button landing-button-outline-light" href="/register" onClick={route('/register')}>Partner with OSF <LandingIcon name="arrow" size={16} /></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/')}><img src="/landing/osf-brand-light.png" alt="Our Startup Freelancer" /></a>
        <p>Our Startup Freelancer</p>
        <nav aria-label="Footer navigation">
          <a href="#ecosystem">About</a>
          <a href="#hackathon">Events</a>
          <a href="#opportunities">Opportunities</a>
          <a href="#business">For Business</a>
          <a href="/contact" onClick={route('/contact')}>Contact</a>
          <a href="/login" onClick={route('/login')}>Log in</a>
        </nav>
        <span>© {new Date().getFullYear()} Our Startup Freelancer (OSF). All rights reserved.</span>
      </footer>
    </div>
  );
}
