import React from 'react';

function ArrowLeft({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      <path d="M19 12H5 M12 19l-7-7 7-7" />
    </svg>
  );
}

const contactChannels = [
  {
    label: 'Enterprise Email Support',
    mark: '@',
    status: 'Channels Under Configuration',
    detail: 'Direct verification desk will be announced prior to production launch.',
  },
  {
    label: 'Dedicated Telephone Helpline',
    mark: '+91',
    status: 'Channels Under Configuration',
    detail: 'Toll-free business assistance desk across Indian timezones.',
  },
  {
    label: 'Corporate Office Address',
    mark: 'OSF',
    status: 'Channels Under Configuration',
    detail: 'Our Startup Freelancer, India.',
  },
];

export default function ContactUs({ onBack }) {
  return (
    <section className="form-wrap wide">
      {onBack && (
        <div style={{ marginBottom: '20px' }}>
          <button className="btn btn-outline btn-sm" onClick={onBack}>
            <ArrowLeft size={15} />
            <span>Back</span>
          </button>
        </div>
      )}

      <div className="eyebrow">OSF SUPPORT & ASSISTANCE</div>
      <h2>Contact Us</h2>
      <p className="page-lead">
        We are preparing official enterprise support channels for company registration and verification enquiries.
      </p>

      <div className="alert alert-info" role="status">
        <div>
          <strong>Support Channels Under Verification</strong>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: 'var(--text-secondary)' }}>
            Official OSF support details will be published here upon final verification. Please note that no automated messages or contact forms are submitted from this page.
          </p>
        </div>
      </div>

      <div className="contact-grid">
        {contactChannels.map(({ label, mark, status, detail }) => (
          <article className="contact-card" key={label}>
            <div className="contact-card-icon" aria-hidden="true">
              {mark}
            </div>
            <div className="contact-card-info">
              <h4>{label}</h4>
              <span className="contact-status-tag">{status}</span>
              <p style={{ margin: '8px 0 0', fontSize: '12.5px', color: 'var(--text-secondary)', lineHeight: '1.45' }}>
                {detail}
              </p>
            </div>
          </article>
        ))}
      </div>

      {onBack && (
        <div style={{ marginTop: '24px' }}>
          <button className="btn btn-outline" onClick={onBack}>
            <ArrowLeft size={16} />
            <span>Back</span>
          </button>
        </div>
      )}
    </section>
  );
}
