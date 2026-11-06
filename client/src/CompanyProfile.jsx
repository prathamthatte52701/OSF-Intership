import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { citiesForState, INDIAN_STATES, validateIndiaFields } from './india.js';

function Icon({ name, size = 16, ...props }) {
  const iconPaths = {
    Building2: 'M3 21h18 M5 21V7l8-4v18 M19 21V11l-6-4 M9 9v.01 M9 12v.01 M9 15v.01 M9 18v.01 M14 9v.01 M14 12v.01',
    MapPin: 'M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z M12 10a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z',
    UserRound: 'M20 21a8 8 0 0 0-16 0 M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z',
    ShieldCheck: 'M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z M9 12l2 2 4-4',
    CheckCircle2: 'M22 11.08V12a10 10 0 1 1-5.93-9.14 M22 4 12 14.01l-3-3',
    Lock: 'M7 11V7a5 5 0 0 1 10 0v4 M4 11h16v10H4z',
    AlertCircle: 'M12 8v4 M12 16h.01 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
    Edit3: 'M12 20h9 M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z',
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>
      {(iconPaths[name] || '').split(' M').map((d, i) => (
        <path key={i} d={(i ? 'M' : '') + d} />
      ))}
    </svg>
  );
}

const toForm = profile => ({
  company: profile?.company || '',
  pan: profile?.pan || '',
  msme: profile?.msme || '',
  address1: profile?.address1 || '',
  address2: profile?.address2 || '',
  state: profile?.state || '',
  city: profile?.city || '',
  postal: profile?.postal || '',
  contact: profile?.contact || '',
  email: profile?.email || '',
  phone: profile?.phone || '',
});

const toApiProfile = (form, email) => ({
  companyName: form.company,
  pan: form.pan,
  msme: form.msme,
  address1: form.address1,
  address2: form.address2,
  state: form.state,
  city: form.city,
  postal: form.postal,
  contactName: form.contact,
  email,
  phone: form.phone,
});

export default function CompanyProfile({ profile, onSaved, readOnly = false }) {
  const legacyProfile = profile?.country !== 'India' || profile?.countryCode !== 'IN';
  const canEdit = !readOnly && !legacyProfile;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState({ type: '', text: '' });
  const [cityOptions, setCityOptions] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  useEffect(() => {
    setForm(toForm(profile));
  }, [profile]);

  useEffect(() => {
    let active = true;
    if (!form.state) {
      setCityOptions([]);
      setCitiesLoading(false);
      return () => { active = false; };
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
    return () => { active = false; };
  }, [form.state]);

  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
    setFeedback({ type: '', text: '' });
  };

  const cancel = () => {
    setForm(toForm(profile));
    setErrors({});
    setFeedback({ type: '', text: '' });
    setEditing(false);
  };

  async function save() {
    const nextErrors = validateIndiaFields(form, cityOptions);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSaving(true);
    setFeedback({ type: '', text: '' });

    try {
      const result = await api.updateProfile(toApiProfile(form, profile.email));
      const saved = toForm({
        company: result.company.companyName,
        pan: result.company.pan,
        msme: result.company.msme,
        address1: result.company.address1,
        address2: result.company.address2,
        state: result.company.state,
        city: result.company.city,
        postal: result.company.postal,
        contact: result.company.contactName,
        email: result.company.email,
        phone: result.company.phone,
      });
      setForm(saved);
      setEditing(false);
      setFeedback({ type: 'success', text: result.message || 'Company profile successfully updated.' });
      onSaved?.(result.company);
    } catch (error) {
      setFeedback({ type: 'danger', text: error.message || 'Unable to update profile. Your changes have been preserved.' });
    } finally {
      setSaving(false);
    }
  }

  const Field = ({ id, label, required, hint, error, wide, children }) => (
    <div className={`cp-field${wide ? ' cp-span-2' : ''}`}>
      <label htmlFor={id}>{label}{required && <> <span className="required-star" aria-hidden="true">*</span></>}</label>
      {children}
      {hint && <small>{hint}</small>}
      {error && <span className="cp-field-error">{error}</span>}
    </div>
  );
  const View = ({ label, wide, children }) => (
    <div className={`cp-view-row${wide ? ' cp-span-2' : ''}`}>
      <span>{label}</span>
      <p>{children}</p>
    </div>
  );
  const address = [profile?.address1, profile?.address2].filter(Boolean).join(', ') || '—';

  return (
    <div className="cp-profile">
      <div className="cp-page-header">
        <div>
          <h2>{editing ? 'Edit Company Profile' : 'Company Profile'}</h2>
          <p>{editing ? 'Update your registered enterprise details' : 'Official enterprise registration records on OSF'}</p>
        </div>
        {editing ? (
          <div className="cp-button-row">
            <button className="btn btn-outline" disabled={saving} onClick={cancel}>Cancel</button>
            <button className="btn btn-primary" disabled={saving} onClick={save}>
              {saving ? (<><span className="loading-spinner" /><span>Saving Changes…</span></>) : 'Save'}
            </button>
          </div>
        ) : canEdit && (
          <button className="btn btn-primary" onClick={() => setEditing(true)}>
            <Icon name="Edit3" size={14} />
            <span>Edit</span>
          </button>
        )}
      </div>

      {feedback.text && (
        <div className={`alert alert-${feedback.type}`} role="status">
          {feedback.type === 'success' ? <Icon name="CheckCircle2" size={18} /> : <Icon name="AlertCircle" size={18} />}
          <span>{feedback.text}</span>
        </div>
      )}

      {legacyProfile && (
        <div className="alert alert-warning" role="status">
          <Icon name="AlertCircle" size={18} />
          <span>This profile was created under legacy location rules and is read-only while India compliance details are verified.</span>
        </div>
      )}

      {editing ? (
        <div className="cp-card" aria-busy={saving}>
          <div className="cp-form-cols">
            <Field id="edit-company" label="Company Name" required wide error={errors.company}>
              <input id="edit-company" value={form.company} maxLength={150} placeholder="e.g. Northstar Technologies Pvt Ltd" onChange={e => update('company', e.target.value)} />
            </Field>
            <Field id="edit-pan" label="Company PAN ID" hint="Optional · 10-character Indian PAN" error={errors.pan}>
              <input id="edit-pan" value={form.pan} maxLength={10} placeholder="ABCDE1234F" onChange={e => update('pan', e.target.value.toUpperCase())} />
            </Field>
            <Field id="edit-msme" label="MSME Registration" hint="Optional">
              <input id="edit-msme" value={form.msme} placeholder="e.g. UDYAM-XX-00-0000000" onChange={e => update('msme', e.target.value.toUpperCase())} />
            </Field>
            <Field id="edit-address1" label="Registered Address Line 1" required wide error={errors.address1}>
              <input id="edit-address1" value={form.address1} placeholder="Street address, building name, suite" onChange={e => update('address1', e.target.value)} />
            </Field>
            <Field id="edit-address2" label="Address Line 2" wide>
              <input id="edit-address2" value={form.address2} placeholder="Floor, landmark, area (optional)" onChange={e => update('address2', e.target.value)} />
            </Field>
            <Field id="edit-state" label="State / Union Territory" required error={errors.state}>
              <select
                id="edit-state"
                value={form.state}
                onChange={e => {
                  setForm(c => ({ ...c, state: e.target.value, city: '' }));
                  setErrors(c => ({ ...c, state: '', city: '' }));
                }}
              >
                <option value="">Select State / UT</option>
                {INDIAN_STATES.map(s => (
                  <option key={s.isoCode} value={s.name}>{s.name}</option>
                ))}
              </select>
            </Field>
            <Field id="edit-city" label="City" required error={errors.city}>
              <select id="edit-city" value={form.city} disabled={!form.state || citiesLoading} onChange={e => update('city', e.target.value)}>
                <option value="">{citiesLoading ? 'Loading cities…' : 'Select City'}</option>
                {cityOptions.map((c, i) => (
                  <option key={`${c}-${i}`} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field id="edit-postal" label="PIN Code" required error={errors.postal}>
              <input id="edit-postal" inputMode="numeric" maxLength={6} value={form.postal} placeholder="6-digit PIN code" onChange={e => update('postal', e.target.value)} />
            </Field>
            <Field id="edit-country" label="Country">
              <input id="edit-country" value="India" readOnly aria-readonly="true" />
            </Field>
            <Field id="edit-contact" label="Contact Person Full Name" required error={errors.contact}>
              <input id="edit-contact" value={form.contact} placeholder="Full name" onChange={e => update('contact', e.target.value)} />
            </Field>
            <Field id="edit-phone" label="Phone Number" hint="Optional · Indian phone numbers only" error={errors.phone}>
              <div className="phone-input-group">
                <span className="phone-prefix">+91</span>
                <input id="edit-phone" type="tel" inputMode="tel" value={form.phone} placeholder="10-digit mobile number" onChange={e => update('phone', e.target.value)} />
              </div>
            </Field>
          </div>

          <div className="alert alert-info">
            <Icon name="Lock" size={16} />
            <div>
              <strong>Company Email: {profile.email || '—'}</strong>
              <div className="cp-helper">Email modification is restricted to preserve account security.</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="cp-profile-stack">
          <div className="cp-card">
            <div className="cp-section-head">
              <h3 className="cp-card-title">Company details</h3>
              <Icon name="Building2" size={16} />
            </div>
            <div className="cp-view-grid">
              <View label="Legal Company Name">{profile?.company || '—'}</View>
              <View label="Company PAN ID">{profile?.pan || 'Not provided'}</View>
              <View label="MSME Registration">{profile?.msme || 'Not provided'}</View>
              <View label="Country Jurisdiction">India (IN)</View>
            </div>
          </div>

          <div className="cp-card">
            <div className="cp-section-head">
              <h3 className="cp-card-title">Contact</h3>
              <Icon name="UserRound" size={16} />
            </div>
            <div className="cp-view-grid">
              <View label="Contact Person Name">{profile?.contact || '—'}</View>
              <View label="Phone Number">{profile?.phone || 'Not provided'}</View>
              <View label="Email" wide>{profile?.email || '—'}</View>
            </div>
          </div>

          <div className="cp-card">
            <div className="cp-section-head">
              <h3 className="cp-card-title">Registered address</h3>
              <Icon name="MapPin" size={16} />
            </div>
            <div className="cp-view-grid">
              <View label="Address" wide>{address}</View>
              <View label="State / Union Territory">{profile?.state || '—'}</View>
              <View label="City">{profile?.city || '—'}</View>
              <View label="PIN Code">{profile?.postal || '—'}</View>
              <View label="Country">{profile?.country || 'India'}</View>
            </div>
          </div>

          <div className="cp-card">
            <div className="cp-section-head">
              <h3 className="cp-card-title">Verification</h3>
              <Icon name="ShieldCheck" size={16} />
            </div>
            <div className="cp-view-grid">
              <View label="Email verification">
                <span className={`status-pill ${profile?.emailVerified ? 'success' : 'warning'}`}>
                  {profile?.emailVerified ? 'Email verified' : 'Email not verified'}
                </span>
              </View>
              <View label="Company verification">Not available</View>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
