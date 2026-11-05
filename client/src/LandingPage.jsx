import React, { useEffect, useState } from 'react';
import './landing.css';

const solutions = [
  { tag: 'TALENT', title: 'Talent Discovery & Hiring', text: 'Connect with emerging professionals and explore candidates for internships, freelance engagements and full-time opportunities.' },
  { tag: 'REAL WORK', title: 'WorkDone Challenges', text: 'Evaluate practical abilities through real-world tasks and project-based challenges.' },
  { tag: 'BRAND', title: 'Branded Challenges', text: 'Engage emerging talent with meaningful brand-led challenges and interactive campaigns.' },
  { tag: 'PRODUCT', title: 'Product Testing Sprints', text: 'Gather structured feedback and fresh perspectives on products, websites and digital experiences.' },
  { tag: 'ASSESSMENT', title: 'Assessment-as-a-Service', text: 'Support candidate evaluation with structured assessments and skill-based interviews.' },
];

const steps = [
  ['01', 'Discover', 'Explore suitable opportunities and talent.'],
  ['02', 'Connect', 'Bring companies and candidates together.'],
  ['03', 'Collaborate', 'Participate in practical work and challenges.'],
  ['04', 'Grow', 'Build skills, gather feedback and create outcomes.'],
];

const nav = [['Solutions', '#solutions'], ['For Companies', '#companies'], ['For Talent', '#talent'], ['How It Works', '#how-it-works'], ['Contact', '/contact']];

export default function LandingPage({ go }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const route = path => event => { event.preventDefault(); setMenuOpen(false); go(path); };
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
        <a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/') }>
          <img src="/osf-logo.png" alt="Our Startup Freelancer" />
        </a>
        <button className="landing-menu-toggle" type="button" aria-expanded={menuOpen} aria-controls="landing-navigation" aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'} onClick={() => setMenuOpen(open => !open)}>
          <span /><span /><span />
        </button>
        <nav id="landing-navigation" className={`landing-navigation${menuOpen ? ' is-open' : ''}`} aria-label="Main navigation">
          {nav.map(([label, href]) => href.startsWith('#')
            ? <a key={label} href={href} onClick={closeMenu}>{label}</a>
            : <a key={label} href={href} onClick={route(href)}>{label}</a>)}
          <a className="landing-login" href="/login" onClick={route('/login')}>Login</a>
          <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Partner with OSF <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <main>
        <section className="landing-hero landing-grid" aria-labelledby="landing-title">
          <div className="landing-hero-content">
            <p className="landing-eyebrow"><span /> BUILD · LAUNCH · SCALE</p>
            <h1 id="landing-title">Discover talent.<br />Create opportunities.<br /><span>Build what’s next.</span></h1>
            <p className="landing-hero-copy">Connecting businesses and emerging talent through practical challenges, skill-based opportunities and meaningful collaboration.</p>
            <div className="landing-actions">
              <a className="landing-button" href="/register" onClick={route('/register')}>Partner with OSF <span aria-hidden="true">↗</span></a>
              <a className="landing-text-link" href="#solutions">Explore solutions <span aria-hidden="true">↓</span></a>
            </div>
            <p className="landing-hero-note">A platform for companies and emerging talent</p>
          </div>
          <div className="landing-hero-visual" aria-hidden="true">
            <div className="landing-visual-orbit landing-visual-orbit-one" />
            <div className="landing-visual-orbit landing-visual-orbit-two" />
            <div className="landing-visual-node landing-visual-node-one" />
            <div className="landing-visual-node landing-visual-node-two" />
            <div className="landing-visual-card landing-visual-card-talent">
              <span className="landing-visual-icon">01</span>
              <span className="landing-visual-label">TALENT</span>
              <strong>Talent discovery<br />&amp; hiring</strong>
              <span className="landing-visual-detail"><i /> Internships · Freelance · Full-time</span>
            </div>
            <div className="landing-visual-card landing-visual-card-challenges">
              <span className="landing-visual-icon">02</span>
              <span className="landing-visual-label">REAL WORK</span>
              <strong>WorkDone<br />challenges</strong>
            </div>
            <div className="landing-visual-card landing-visual-card-product">
              <span className="landing-visual-icon">03</span>
              <span className="landing-visual-label">PRODUCT</span>
              <strong>Product testing<br />sprints</strong>
            </div>
            <div className="landing-visual-card landing-visual-card-assessment">
              <span className="landing-visual-label">ASSESSMENT</span>
              <strong>Skill-based review</strong>
            </div>
            <div className="landing-visual-brand">OSF</div>
          </div>
          <a className="landing-scroll-cue" href="#solutions" aria-label="Scroll to solutions">↓</a>
        </section>

        <section className="landing-solutions landing-grid" id="solutions" aria-labelledby="solutions-title">
          <div className="landing-section-heading">
            <p className="landing-eyebrow"><span /> COMPANY SOLUTIONS</p>
            <h2 id="solutions-title">One talent pool.<br />Multiple ways to work together.</h2>
            <p>Practical ways to connect business goals with emerging skills and fresh perspectives.</p>
          </div>
          <div className="landing-solution-grid">
            {solutions.map((item, i) => <article className="landing-solution-card" key={item.title}>
              <span className="landing-card-number">0{i + 1}</span>
              <span className="landing-card-tag">{item.tag}</span>
              <h3>{item.title}</h3>
              <p>{item.text}</p>
            </article>)}
          </div>
        </section>

        <section className="landing-process" id="how-it-works" aria-labelledby="process-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> HOW OSF WORKS</p>
            <h2 id="process-title">From first connection<br />to meaningful outcomes.</h2>
          </div>
          <div className="landing-steps">{steps.map(([n, title, text]) => <article className="landing-step" key={n}>
            <span className="landing-step-number">{n}</span><h3>{title}</h3><p>{text}</p>
          </article>)}</div>
        </section>

        <section className="landing-audiences" aria-label="OSF for companies and talent">
          <article className="landing-audience landing-company" id="companies">
            <p className="landing-eyebrow"><span /> FOR COMPANIES</p>
            <h2>Find the people and perspectives your business needs.</h2>
            <p>Explore talent, practical assessments, product feedback and collaborative opportunities.</p>
            <a className="landing-button" href="/register" onClick={route('/register')}>Partner with OSF <span aria-hidden="true">↗</span></a>
          </article>
          <article className="landing-audience landing-talent" id="talent">
            <p className="landing-eyebrow"><span /> FOR TALENT</p>
            <h2>Turn your abilities into meaningful opportunities.</h2>
            <p>Explore practical challenges, demonstrate your skills and connect with opportunities.</p>
            <a className="landing-button landing-button-outline" href="/contact" onClick={route('/contact')}>Explore with OSF <span aria-hidden="true">↗</span></a>
          </article>
        </section>

        <section className="landing-final landing-grid" aria-labelledby="final-title">
          <p className="landing-eyebrow"><span /> START A CONVERSATION</p>
          <h2 id="final-title">Ready to create something<br />meaningful with OSF?</h2>
          <p>Start a conversation with OSF and explore how we can work together.</p>
          <div className="landing-actions">
            <a className="landing-button" href="/register" onClick={route('/register')}>Partner with OSF <span aria-hidden="true">↗</span></a>
            <a className="landing-text-link" href="/contact" onClick={route('/contact')}>Contact us <span aria-hidden="true">→</span></a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/')}><img src="/osf-logo.png" alt="Our Startup Freelancer" /></a>
        <p>Build · Launch · Scale</p>
        <nav aria-label="Footer navigation">{nav.map(([label, href]) => href.startsWith('#') ? <a key={label} href={href}>{label}</a> : <a key={label} href={href} onClick={route(href)}>{label}</a>)}</nav>
        <span>© {new Date().getFullYear()} Our Startup Freelancer (OSF). All rights reserved.</span>
      </footer>
    </div>
  );
}
