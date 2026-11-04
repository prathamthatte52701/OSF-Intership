import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { City, State } from 'country-state-city';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const companyPattern = /^[\p{L}\p{N}&.,'()\- ]{2,150}$/u;
const namePattern = /^[\p{L}][\p{L} .'-]{1,99}$/u;
const indianPanPattern = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/;
const indiaStates = State.getStatesOfCountry('IN');
const normalizeName = value => String(value).normalize('NFC').trim();
const matchesName = (candidate, value) => normalizeName(candidate).localeCompare(normalizeName(value), 'en-IN', { sensitivity: 'accent' }) === 0;

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const clean = (value, max = 200) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

function validateIndianLocation(stateInput, cityInput) {
  const state = indiaStates.find(item => matchesName(item.name, stateInput));
  if (!state) throw new InputError('Select a valid Indian state or Union Territory.');
  const city = City.getCitiesOfState('IN', state.isoCode).find(item => matchesName(item.name, cityInput));
  if (!city) throw new InputError('Select a city in the chosen Indian state or Union Territory.');
  return { state: state.name, city: city.name };
}

function normalizeIndianFields(input = {}) {
  const suppliedCountry = clean(input.country, 100).toLocaleLowerCase();
  const suppliedCode = clean(input.countryCode, 2).toUpperCase();
  if ((suppliedCountry && suppliedCountry !== 'india') || (suppliedCode && suppliedCode !== 'IN')) {
    throw new InputError('Only companies based in India can register.');
  }

  const data = {
    companyName: clean(input.companyName, 150),
    pan: clean(input.pan, 20).toUpperCase(),
    msme: clean(input.msme, 100).toUpperCase(),
    address1: clean(input.address1, 250),
    address2: clean(input.address2, 250),
    country: 'India',
    countryCode: 'IN',
    state: clean(input.state, 120),
    city: clean(input.city, 120),
    postal: clean(input.postal, 30),
    contactName: clean(input.contactName, 100),
    email: clean(input.email, 254).toLowerCase(),
    phone: clean(input.phone, 40),
  };

  if (!companyPattern.test(data.companyName)) throw new InputError('Enter a valid company name.');
  if (!data.address1) throw new InputError('Enter the company address.');
  if (!namePattern.test(data.contactName)) throw new InputError('Enter a valid contact name.');
  if (!emailPattern.test(data.email)) throw new InputError('Enter a valid email address.');
  if (data.pan && !indianPanPattern.test(data.pan)) throw new InputError('Enter a valid Indian PAN.');
  if (!/^\d{6}$/.test(data.postal)) throw new InputError('Enter a six-digit Indian PIN code.');

  const location = validateIndianLocation(data.state, data.city);
  data.state = location.state;
  data.city = location.city;
  data.pan = data.pan || null;
  data.msme = data.msme || null;
  data.phone = data.phone || null;

  if (data.phone) {
    const phone = parsePhoneNumberFromString(data.phone, 'IN');
    if (!phone?.isValid() || phone.country !== 'IN') throw new InputError('Enter a valid Indian phone number.');
    data.phone = phone.number;
  }
  return data;
}

export function validateRegistration(input = {}) {
  return normalizeIndianFields(input);
}

export function validateCompanyProfile(input = {}, verifiedEmail) {
  return normalizeIndianFields({ ...input, email: verifiedEmail });
}
