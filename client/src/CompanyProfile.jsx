import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { citiesForState, INDIAN_STATES, validateIndiaFields } from './india.js';

const toForm = profile => ({
  company: profile?.company || '', pan: profile?.pan || '', msme: profile?.msme || '',
  address1: profile?.address1 || '', address2: profile?.address2 || '', state: profile?.state || '',
  city: profile?.city || '', postal: profile?.postal || '', contact: profile?.contact || '',
  email: profile?.email || '', phone: profile?.phone || '',
});
const toApiProfile = (form, email) => ({
  companyName: form.company, pan: form.pan, msme: form.msme, address1: form.address1,
  address2: form.address2, state: form.state, city: form.city, postal: form.postal,
  contactName: form.contact, email, phone: form.phone,
});

export default function CompanyProfile({ profile, onSaved, readOnly = false }) {
  const legacyProfile = profile?.country !== 'India' || profile?.countryCode !== 'IN';
  const canEdit = !readOnly && !legacyProfile;
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => toForm(profile));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [cityOptions, setCityOptions] = useState([]);
  const [citiesLoading, setCitiesLoading] = useState(false);

  useEffect(() => { setForm(toForm(profile)); }, [profile]);
  useEffect(() => { let active = true; if (!form.state) { setCityOptions([]); setCitiesLoading(false); return () => { active = false; }; } setCityOptions([]); setCitiesLoading(true); citiesForState(form.state).then(cities => { if (active) setCityOptions(cities); }).finally(() => { if (active) setCitiesLoading(false); }); return () => { active = false; }; }, [form.state]);
  const update = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setErrors(current => ({ ...current, [key]: '' }));
    setFeedback('');
  };
  const cancel = () => {
    setForm(toForm(profile));
    setErrors({});
    setFeedback('');
    setEditing(false);
  };
  async function save() {
    const nextErrors = validateIndiaFields(form, cityOptions);
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;
    setSaving(true);
    setFeedback('');
    try {
      const result = await api.updateProfile(toApiProfile(form, profile.email));
      const saved = toForm({
        company: result.company.companyName, pan: result.company.pan, msme: result.company.msme,
        address1: result.company.address1, address2: result.company.address2, state: result.company.state,
        city: result.company.city, postal: result.company.postal, contact: result.company.contactName,
        email: result.company.email, phone: result.company.phone,
      });
      setForm(saved);
      setEditing(false);
      setFeedback(result.message || 'Company profile updated.');
      onSaved?.(result.company);
    } catch (error) {
      setFeedback(error.message || 'The profile could not be saved. Your changes are still here.');
    } finally {
      setSaving(false);
    }
  }

  const Field = ({ name, label, hint, children }) => <label className={`field ${errors[name] ? 'has-error' : ''}`}>
    <span className="field-label">{label}{!['pan', 'msme', 'phone', 'address2'].includes(name) && <i aria-hidden="true"> *</i>}</span>
    {children}{errors[name] ? <span className="field-error" role="alert">{errors[name]}</span> : hint ? <span className="field-hint">{hint}</span> : null}
  </label>;

  return <section className="dash-card detail-card company-profile-panel" aria-labelledby="company-details-heading">
    <div className="profile-heading-row"><div><h3 id="company-details-heading">Company details</h3><p className="detail-sub">Information provided during registration</p></div>
      {canEdit && !editing && <button className="btn btn-outline profile-edit" onClick={() => { setFeedback(''); setEditing(true); }}>Edit profile</button>}
    </div>
    {legacyProfile && <div className="soft-alert" role="status">This historical profile is shown as stored and is read-only while its India location details are reviewed.</div>}
    {editing ? <div className="profile-edit-form" aria-busy={saving}>
      <div className="field-grid">
        <Field name="company" label="Company name"><input value={form.company} onChange={event => update('company', event.target.value)}/></Field>
        <Field name="pan" label="PAN" hint="Optional · 10-character Indian PAN"><input maxLength={10} value={form.pan} onChange={event => update('pan', event.target.value.toUpperCase())}/></Field>
        <Field name="msme" label="MSME registration" hint="Optional"><input value={form.msme} onChange={event => update('msme', event.target.value.toUpperCase())}/></Field>
        <Field name="address1" label="Address line 1"><input value={form.address1} onChange={event => update('address1', event.target.value)}/></Field>
        <Field name="address2" label="Address line 2"><input value={form.address2} onChange={event => update('address2', event.target.value)}/></Field>
        <Field name="state" label="State / Union Territory"><select value={form.state} onChange={event => { setForm(current => ({ ...current, state: event.target.value, city: '' })); setErrors(current => ({ ...current, state: '', city: '' })); }}>
          <option value="">Select state or Union Territory</option>{INDIAN_STATES.map(state => <option key={state.isoCode} value={state.name}>{state.name}</option>)}
        </select></Field>
        <Field name="city" label="City"><select value={form.city} disabled={!form.state || citiesLoading} onChange={event => update('city', event.target.value)}>
          <option value="">{citiesLoading ? 'Loading cities…' : 'Select city'}</option>{cityOptions.map((city, index) => <option key={`${city}-${index}`} value={city}>{city}</option>)}
        </select></Field>
        <Field name="postal" label="PIN Code" hint="Exactly 6 digits"><input inputMode="numeric" maxLength={6} value={form.postal} onChange={event => update('postal', event.target.value)}/></Field>
        <Field name="contact" label="Contact person"><input value={form.contact} onChange={event => update('contact', event.target.value)}/></Field>
        <Field name="phone" label="Indian phone number" hint="Optional"><div className="phone-row profile-phone"><span className="dial-code">+91</span><input type="tel" inputMode="tel" autoComplete="tel-national" value={form.phone} placeholder="10-digit Indian number" onChange={event => update('phone', event.target.value)}/></div></Field>
      </div>
      <div className="verified-email-note"><span>Verified company email</span><strong>{profile.email || '—'}</strong><small>Email changes require a separate verification process.</small></div>
      {feedback && <div className="soft-alert" role="status">{feedback}</div>}
      <div className="profile-actions"><button className="btn btn-outline" disabled={saving} onClick={cancel}>Cancel</button><button className="btn btn-primary" disabled={saving} onClick={save}>{saving ? <><span className="loading-spinner small"/>Saving…</> : 'Save changes'}</button></div>
    </div> : <>
      {feedback && <div className="soft-alert" role="status">{feedback}</div>}
      <div className="detail-grid">
        <ProfileRow label="Company name" value={profile.company}/>
        {profile.pan && <ProfileRow label="PAN" value={profile.pan}/>}
        {profile.msme && <ProfileRow label="MSME registration" value={profile.msme}/>}
        <ProfileRow label="Company email · verified" value={profile.email}/>
        {legacyProfile && <ProfileRow label="Country / region" value={profile.country}/>}
        <ProfileRow label="Address" value={[profile.address1, profile.address2].filter(Boolean).join(', ')}/>
        <ProfileRow label="State" value={profile.state}/><ProfileRow label="City" value={profile.city}/>
        <ProfileRow label="PIN Code" value={profile.postal}/><ProfileRow label="Contact person" value={profile.contact}/>
        {profile.phone && <ProfileRow label="Phone" value={profile.phone}/>}
      </div>
    </>}
  </section>;
}

function ProfileRow({ label, value }) { return <div className="data-row"><span>{label}</span><strong>{value || '—'}</strong></div>; }
