import State from 'country-state-city/lib/state.js';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

export const INDIAN_STATES = State.getStatesOfCountry('IN');
export async function citiesForState(stateName) {
  const state = INDIAN_STATES.find(item => item.name === stateName);
  if (!state) return [];
  const { default: City } = await import('country-state-city/lib/city.js');
  return City.getCitiesOfState('IN', state.isoCode).map(item => item.name).sort((a, b) => a.localeCompare(b, 'en-IN'));
}

export function validateIndiaFields(values, allowedCities = []) {
  const errors = {};
  if (!values.company?.trim() || !/^[\p{L}\p{N}&.,'()\- ]{2,150}$/u.test(values.company.trim().replace(/\s+/g, ' '))) errors.company = 'Enter a valid company name.';
  if (values.pan?.trim() && !/^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/i.test(values.pan.trim())) errors.pan = 'Enter a valid 10-character Indian PAN.';
  if (!values.address1?.trim()) errors.address1 = 'Enter the company address.';
  if (!INDIAN_STATES.some(item => item.name === values.state)) errors.state = 'Select an Indian state or Union Territory.';
  if (!allowedCities.includes(values.city)) errors.city = 'Select a city in the chosen state or Union Territory.';
  if (!/^\d{6}$/.test(values.postal || '')) errors.postal = 'Enter a six-digit PIN Code.';
  if (!values.contact?.trim() || !/^[\p{L}][\p{L} .'-]{1,99}$/u.test(values.contact.trim())) errors.contact = 'Enter a valid contact person name.';
  if (values.email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) errors.email = 'Enter a valid email address.';
  if (values.phone?.trim()) {
    const phone = parsePhoneNumberFromString(values.phone.trim(), 'IN');
    if (!phone?.isValid() || phone.country !== 'IN') errors.phone = 'Enter a valid Indian phone number.';
  }
  return errors;
}

export function normalizeIndianPhone(value) {
  if (!value?.trim()) return '';
  const phone = parsePhoneNumberFromString(value.trim(), 'IN');
  return phone?.isValid() && phone.country === 'IN' ? phone.number : '';
}
