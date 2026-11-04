import React from 'react';
const contactOptions = [
  { label: 'Email', mark: '@' },
  { label: 'Phone', mark: '+91' },
  { label: 'Office address', mark: 'OSF' },
];

export default function ContactUs({ onBack }) {
  return <section className="form-wrap contact-page">
    <div className="eyebrow">OSF SUPPORT</div>
    <h2>Contact Us</h2>
    <p className="page-lead">We’re preparing the right support channels for company registration enquiries.</p>
    <div className="demo-notice contact-demo-notice"><span className="demo-dot"/><div><strong>Demo contact details</strong><p>Verified OSF contact information has not been configured in this portal yet. These placeholders are not contact details.</p></div></div>
    <div className="contact-options">{contactOptions.map(({ label, mark }) => <article className="dash-card contact-option" key={label}><span aria-hidden="true">{mark}</span><div><small>{label}</small><strong>Not configured</strong></div></article>)}</div>
    <p className="contact-footnote">No message is being sent from this page. Add verified support details before launch.</p>
    {onBack && <button className="btn btn-outline contact-back" onClick={onBack}>Back to dashboard</button>}
  </section>;
}
