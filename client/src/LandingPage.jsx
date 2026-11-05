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
  check: ['m5 12 4 4L19 6'],
  shield: ['M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z', 'm9 12 2 2 4-4'],
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
  ['Pricing', '/contact'],
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
  { icon: 'rocket', title: 'Hackathons & Innovation', text: 'Organizing large-scale innovation events connecting students with real-world opportunities.', link: '#hackathon', action: 'Learn more' },
  { icon: 'briefcase', title: 'Freelance Ecosystem', text: 'Helping verified freelancers and creators connect with startups and businesses.', link: '#opportunities', action: 'Learn more' },
  { icon: 'building', title: 'Startup Collaboration', text: 'Enabling startups to hire, build, scale and innovate faster.', link: '#business', action: 'Learn more' },
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
  { icon: 'briefcase', title: 'Full-Time Jobs', text: ['Direct hiring by participating companies', 'Roles across tech, design, marketing & more', 'No placement agent fees — ever'] },
  { icon: 'graduation', title: 'Paid Internships', text: ['3 to 6 month structured internships', 'From startups to large organisations', 'Stipend + certificate + mentorship'] },
  { icon: 'rocket', title: 'Freelance Projects', text: ['Short-term gigs with direct client access', 'AI-verified work — instant UPI payouts', 'Build your portfolio while still studying'] },
];

const hackathonBenefits = [
  ['code', 'Build Real Products', 'Go beyond theoretical coding and build dynamic, functional MVPs that tackle actual workspace and domain issues.'],
  ['people', 'Meet Recruiters', 'Pitch your design skills and engineering talent directly to high-growth startups and standard hiring partners.'],
  ['trophy', 'Win Cash Prizes', 'Compete for national level recognition, certificates, and exciting cash prizes from our stellar reward pool.'],
  ['graduation', 'Get Internship Opportunities', 'Get evaluated by partner organizations for paid engineering internships and part-time freelance projects.'],
  ['spark', 'Startup Exposure', 'Present high-grade prototypes to incubator cells, angel networks, and veteran venture builders.'],
  ['globe', 'Network With Developers', 'Team up and exchange insights with hundreds of exceptional developers, computer science majors, and designers.'],
];

const communities = [
  ['code', 'Coding Clubs', 'Empowering college coding standard groups to build tomorrow’s software.'],
  ['spark', 'Startup Communities', 'Nurturing early-stage networks of student founders and startup builders.'],
  ['people', 'Student Ambassadors', 'OSF campus leaders driving awareness across universities and technical engineering colleges.'],
  ['building', 'College Innovation Cells', 'Colleges providing incubation support, technical guidance, and administrative cells.'],
  ['shield', 'Developer Communities', 'Uniting passionate open-source coders, web builders, cybersecurity pros, and AI engineers.'],
];

const businessFeatures = [
  ['shield', 'GST Invoicing', 'Hassle-free business billing. Claim input tax credits with automated INR invoices natively.'],
  ['check', 'Vetted On-Tap', 'Access talent vetted by proctored exams, cutting your hiring cycle from weeks to minutes.'],
  ['people', 'Safety First', 'Secure escrow means you only pay when the work matches your high professional standards.'],
];

const indiaFeatures = [
  ['payment', 'Instant UPI', 'Payments reach you in seconds—not weeks.'],
  ['graduation', 'Campus-to-Career', 'Launch your career with paid student internships.'],
  ['people', 'Indore City Clubs', 'Network offline in Madhya Pradesh and beyond.'],
  ['code', 'OSF Mobile App', 'Coming early 2025'],
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
              <span>5,000+ students</span><span>OSF Hackathon 2026</span><span>Pan-India network</span><span>Global companies</span><span>Freelance ecosystem</span><span>Verified talent</span>
            </div>
            <div className="landing-proof-strip" aria-label="Our Startup Freelancer network facts">
              <article><span className="landing-metric-icon"><LandingIcon name="people" size={18} /></span><div><strong>5,000+</strong><small>Students network</small><em>Pan-India reach</em></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="building" size={18} /></span><div><strong>100+</strong><small>Colleges</small><em>Tier 1, 2 & 3 cities</em></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="globe" size={18} /></span><div><strong>28</strong><small>States covered</small><em>National-level reach</em></div></article>
              <article><span className="landing-metric-icon"><LandingIcon name="star" size={18} /></span><div><strong>₹0</strong><small>Cost to students</small><em>Always free to join</em></div></article>
            </div>
            <p className="landing-event-proof"><span aria-hidden="true">●</span> We successfully conducted a <a href="#hackathon">National-Level Hackathon</a> — 300+ teams · 28 states · 280 cities <b>OSF HackOne 2K26 verified</b></p>
          </div>
          <div className="landing-hero-visual">
            <span className="landing-hero-glow" aria-hidden="true" />
            <img src="/landing/hero-student.webp" alt="Student creator with a laptop" />
            <span className="landing-hero-float landing-hero-float-jobs"><LandingIcon name="briefcase" /> Find jobs &<br />internships</span>
            <span className="landing-hero-float landing-hero-float-event"><LandingIcon name="trophy" /> Join<br />Hackathons</span>
            <span className="landing-hero-float landing-hero-float-skills"><LandingIcon name="star" /> Showcase<br />your skills</span>
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
            <p>Our Startup Freelancer is building opportunities for students, developers, startups, creators and future founders through hackathons, freelance work, AI-powered hiring and startup collaboration.</p>
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

        <section className="landing-workshop landing-section" id="business" aria-labelledby="workshop-title">
          <div className="landing-workshop-copy">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> FOR COMPANIES & ORGANISATIONS</p>
            <h2 id="workshop-title">Host Your Own<br /><span>Company Workshop.</span></h2>
            <p>Bring your expertise to the next generation. Register your organisation, create professional workshops and share valuable knowledge through interactive learning experiences.</p>
            <div className="landing-workshop-features">
              {workshopFeatures.map(([icon, title, text]) => <article key={title}><LandingIcon name={icon} size={17} /><div><strong>{title}</strong><span>{text}</span></div></article>)}
            </div>
            <div className="landing-actions"><a className="landing-button" href="/register" onClick={route('/register')}>Register Your Company <LandingIcon name="arrow" size={16} /></a><span>Simple 4-step registration</span></div>
          </div>
          <div className="landing-workshop-visual"><img src="/landing/workshop-dashboard.webp" alt="Company workshop registration portal preview" /></div>
        </section>

        <section className="landing-hackathon landing-section" id="hackathon" aria-labelledby="hackathon-title">
          <div className="landing-hackathon-heading">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> OUR STARTUP FREELANCER PRESENTS OSF HACKATHON</p>
            <h2 id="hackathon-title">OSF Hackathon 2026</h2>
            <h3>National-Level Engineering &amp; Innovation Championship</h3>
            <p>Step into India’s premier launchpad for technical brilliance. Design codebases, challenge traditional templates, build industry-grade prototypes, and collaborate under the official vision of Our Startup Freelancer.</p>
          </div>
          <div className="landing-hackathon-stats" aria-label="OSF Hackathon facts">
            <div><strong>5000+</strong><span>Active students</span></div><div><strong>100+</strong><span>Colleges</span></div><div><strong>48 Hours</strong><span>Innovation</span></div><div><strong>₹50k+</strong><span>Rewards</span></div>
          </div>
          <div className="landing-hackathon-panels">
            <article className="landing-track-panel">
              <div className="landing-panel-heading"><h3>Championship Verticals</h3><span>Tracks</span></div>
              <div className="landing-track-list">{tracks.map(track => <span key={track}><i />{track}</span>)}</div>
              <div className="landing-benefit-list">
                {[
                  ['graduation', 'Internship Placements', 'Get fast-track evaluation rounds with elite tech corporations, startup ecosystems, and business founders looking for dynamic coders.'],
                  ['spark', 'Startup Incubation Opportunity', 'Winner ideas get direct support, mentorship support structure, and potential project funding from Our Startup Freelancer angel networks.'],
                  ['trophy', 'National-Level Recognition', 'Acquire official credentials, a digital shareable showcase badge, and a Certificate of Innovation endorsed by national industry leaders.'],
                ].map(([icon, title, text]) => <div key={title}><span><LandingIcon name={icon} size={15} /></span><p><strong>{title}</strong><small>{text}</small></p></div>)}
              </div>
              <p className="landing-panel-footnote">Powered by Our Startup Freelancer evaluation systems</p>
            </article>
            <article className="landing-prize-panel">
              <div className="landing-prize-art"><img src="/landing/hackathon-trophy.webp" alt="OSF Hackathon trophy" /></div>
              <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> GRAND REWARD POOL</p>
              <h3>₹50,000+ Prize Package</h3>
              <p>Alongside direct cash rewards, qualifying participants receive credit assessments, student ambassador invitations, customized swag kits, and premium proctored credentials.</p>
              <strong className="landing-rewards-title">Participation rewards</strong>
              <ul>
                <li><LandingIcon name="check" size={14} /> Official Certificate of Accomplishment</li>
                <li><LandingIcon name="check" size={14} /> Free Entry to OSF Freelance Elite Assessment Club</li>
                <li><LandingIcon name="check" size={14} /> Exclusive Developer Mentorship Sessions Max 48h</li>
                <li><LandingIcon name="check" size={14} /> Access to Verified INR Project Contracts</li>
              </ul>
              <a className="landing-button landing-button-dark" href="https://osfhackathon.in/" target="_blank" rel="noreferrer">Register for OSF Hackathon <LandingIcon name="arrow" size={15} /></a>
              <small className="landing-registration-note">Registration deadline approaching · Open Pan-India</small>
            </article>
          </div>
        </section>

        <section className="landing-event-reveal landing-section" aria-labelledby="event-reveal-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> SOMETHING BIG IS COMING</p>
            <h2 id="event-reveal-title">The Event Name<br /><span>Will Be Revealed Soon.</span></h2>
            <p>Our Startup Freelancer is preparing something India’s student community has never seen before — a national-level event bringing students, global companies, and real opportunities under one roof.</p>
          </div>
          <div className="landing-event-mystery">{['Event name', 'Date', 'Venue', 'Surprise'].map(label => <div key={label}><strong>??</strong><span>{label}</span></div>)}</div>
          <p className="landing-event-note">Stay tuned — announcement dropping soon</p>
        </section>

        <section className="landing-global-reveal landing-section" aria-labelledby="global-reveal-title">
          <div className="landing-section-heading landing-centered">
            <p className="landing-eyebrow"><span /> GLOBAL REVEAL — IN PROGRESS</p>
            <h2 id="global-reveal-title">Being Revealed <span>To The World.</span></h2>
            <p>Our title is launching systematically — city by city, campus by campus. Watch this space.</p>
          </div>
          <div className="landing-global-phases">
            <article className="is-complete"><span>✓</span><small>Phase 01</small><strong>Internal Team Briefing</strong></article>
            <article className="is-active"><span>↻</span><small>Phase 02</small><strong>Campus Ambassador Rollout</strong><em>Live now</em></article>
            <article><span><LandingIcon name="globe" size={19} /></span><small>Phase 03</small><strong>Public Global Announcement</strong></article>
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
            <div className="landing-opportunity-stats"><div><strong>5,000+</strong><span>Students participating</span></div><div><strong>100+</strong><span>Colleges represented</span></div><div><strong>Pan-India</strong><span>Geographic reach</span></div><div><strong>₹0</strong><span>Cost to students</span></div></div>
          </div>
          <img className="landing-opportunity-art" src="/landing/creator-student.webp" alt="Student creator working on a laptop" />
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
            <article><span className="landing-icon-tile"><LandingIcon name="payment" /></span><div><h3>Instant UPI Payouts</h3><p>First payout possible within days. No 14-day hold. Funds hit your bank account as soon as the work is approved. Built for India’s banking speed.</p></div></article>
            <article><span className="landing-icon-tile"><LandingIcon name="shield" /></span><div><h3>AI-Verified Trust Score</h3><p>Verified freelancers are hired 3x faster. Our AI assessments eliminate fake profiles, ensuring you get paid for your real expertise.</p></div></article>
          </div>
          <div className="landing-trust-card" aria-label="OSF skill verification product preview">
            <div className="landing-trust-card-top"><span>● ● ●</span><strong>OSF ENGINE V3.1</strong></div>
            <p className="landing-trust-label">Neural matchmaker</p><h3>High Probability</h3>
            <p>Matching your verified Python skills with active project “NeoFintech”.</p>
            <div className="landing-trust-metrics"><div><small>Skill rating</small><strong>A++ <em>Global</em></strong></div><div><small>Verification</small><strong className="landing-verified">Passed</strong></div></div>
            <div className="landing-rate"><span>AI rate suggestion</span><strong>₹3,500 – ₹5,000 / Hour</strong></div>
          </div>
        </section>

        <section className="landing-process-section landing-section" id="how-it-works" aria-labelledby="process-title">
          <div className="landing-section-heading landing-centered">
            <h2 id="process-title">How It Works</h2>
            <p>Beginners are supported with AI and 1:1 mentorship from day one.</p>
          </div>
          <div className="landing-process-grid">
            {[
              ['Learn & Verify', 'No experience? Take mini-courses and pass our AI-proctored tests to earn your first Verified OSF Badge.', 'shield'],
              ['Get AI-Matched', 'Stop wasting time bidding. Our algorithms find the projects where you have the highest chance of winning instantly.', 'spark'],
              ['Earn via UPI', 'Deliver work via our secure escrow system and withdraw your earnings instantly to your bank account using UPI.', 'payment'],
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
            <p>Break the English barrier. OSF allows freelancers to collaborate in Hindi and regional languages natively. Our AI handles the professional translation for you.</p>
            <div className="landing-language-support"><article><strong>Native job applications</strong><span>Apply in your local language—AI does the rest.</span></article><article><strong>Local support team</strong><span>Talk to humans who understand your context.</span></article></div>
          </div>
          <div className="landing-language-demo" aria-label="Example language translation">
            <div><small>Freelancer input (Hindi)</small><p>“मैंने प्रोजेक्ट का डिजाइन पूरा कर लिया है, आप एक बार चेक कर लीजिये।”</p></div><span aria-hidden="true">↓</span><div><small>AI output (professional English)</small><p>“The project designs are finalized. Kindly review the updates at your convenience.”</p></div>
          </div>
        </section>

        <section className="landing-business-section landing-section" aria-labelledby="business-title">
          <div className="landing-business-intro">
            <p className="landing-eyebrow landing-eyebrow-outline"><span /> FOR BUSINESSES</p>
            <h2 id="business-title">Built for Indian Businesses.</h2>
            <p>The most trust-focused way to hire verified talent in India. GST Invoices Included.</p>
            <a className="landing-button landing-button-small" href="/register" onClick={route('/register')}>Explore for Businesses <LandingIcon name="arrow" size={14} /></a>
          </div>
          <div className="landing-business-grid">{businessFeatures.map(([icon, title, text]) => <article key={title}><span className="landing-icon-tile"><LandingIcon name={icon} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-india-first landing-section" aria-labelledby="india-first-title">
          <div className="landing-india-trust">
            <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> GLOBAL STANDARDS</p>
            <h2 id="india-first-title">The India-First Ecosystem</h2>
            <p>High-trust freelancing for the world, from the heart of Indore.</p>
            <article><strong>Your Trust Score</strong><p>Verified freelancers with scores above 80 get hired 4x faster and earn higher project rates.</p><div><strong>89</strong><span>Elite tier status</span></div></article>
          </div>
          <div className="landing-india-grid">{indiaFeatures.map(([icon, title, text]) => <article key={title}><span className="landing-icon-tile"><LandingIcon name={icon} /></span><h3>{title}</h3><p>{text}</p></article>)}</div>
        </section>

        <section className="landing-final landing-section" aria-labelledby="final-title">
          <p className="landing-eyebrow landing-eyebrow-pill"><span className="landing-eyebrow-dot" /> INDIA’S YOUTH INNOVATION CHAMPIONSHIP 2026</p>
          <h2 id="final-title">Ready To Build The Future?</h2>
          <p>Join OSF Hackathon and become part of India’s next generation of innovators. Showcase your talent to high-growth startups and win ₹50k+ rewards.</p>
          <div className="landing-final-actions">
            <a className="landing-button landing-button-light" href="https://osfhackathon.in/" target="_blank" rel="noreferrer">Register Now <LandingIcon name="arrow" size={16} /></a>
            <a className="landing-button landing-button-outline-light" href="https://osfhackathon.in/campus-ambassador" target="_blank" rel="noreferrer">Become Campus Ambassador</a>
          </div>
        </section>
      </main>

      <footer className="landing-footer">
        <div className="landing-footer-brand"><a className="landing-brand" href="/" aria-label="OSF home" onClick={route('/')}><img src="/landing/osf-brand-light.png" alt="Our Startup Freelancer" /></a><p>India’s first AI-powered ecosystem for freelancers and businesses. Empowering skills, creating opportunities.</p><small>Build · Launch · Scale</small></div>
        <div className="landing-footer-column"><h2>Platform</h2><a href="#opportunities">For Freelancers</a><a href="#business">For Businesses</a><a href="#journey">Verify Skills</a><a href="#ecosystem">AI Features</a><a href="#india-first-title">Mobile App · Soon</a></div>
        <div className="landing-footer-column"><h2>Support</h2><a href="#ecosystem">About OSF</a><a href="/contact" onClick={route('/contact')}>Talk to Us</a><a href="#community">Community Hub</a></div>
        <div className="landing-footer-column"><h2>Headquarters</h2><p>Navlakha, Indore,<br />Madhya Pradesh, 452001<br />India</p><a href="mailto:contact@ourstartupfreelancer.com">contact@ourstartupfreelancer.com</a><a href="tel:+919424871885">+91 94248 71885</a></div>
        <div className="landing-footer-bottom"><span>© {new Date().getFullYear()} Our Startup Freelancer. Empowering Indian talent.</span><span>Made with <b>♥</b> in Indore.</span></div>
      </footer>
    </div>
  );
}
