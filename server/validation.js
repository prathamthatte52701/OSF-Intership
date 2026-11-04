import { parsePhoneNumberFromString } from 'libphonenumber-js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const companyPattern = /^[\p{L}\p{N}&.,'()\- ]{2,150}$/u;
const namePattern = /^[\p{L}][\p{L} .'-]{1,99}$/u;
const indianPanPattern = /^[A-Z]{3}[ABCFGHJLPT][A-Z]\d{4}[A-Z]$/;
const usPostalPattern = /^\d{5}(-\d{4})?$/;
const ukPostalPattern = /^[A-Z]{1,2}\d[A-Z\d]?\s?\d[A-Z]{2}$/i;

export class InputError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

const clean = (value, max = 200) => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').slice(0, max) : '';

export function validateRegistration(input = {}) {
  const data = {
    companyName: clean(input.companyName, 150), pan: clean(input.pan, 20).toUpperCase(), msme: clean(input.msme, 100).toUpperCase(),
    address1: clean(input.address1, 250), address2: clean(input.address2, 250), country: clean(input.country, 100),
    countryCode: clean(input.countryCode, 2).toUpperCase(), state: clean(input.state, 120), city: clean(input.city, 120),
    postal: clean(input.postal, 30), contactName: clean(input.contactName, 100), email: clean(input.email, 254).toLowerCase(),
    phone: clean(input.phone, 40),
  };
  if (!companyPattern.test(data.companyName)) throw new InputError('Enter a valid company name.');
  if (!data.address1 || !data.country || !/^[A-Z]{2}$/.test(data.countryCode) || !data.city) throw new InputError('Complete the required company location fields.');
  if (!data.contactName || !namePattern.test(data.contactName)) throw new InputError('Enter a valid contact name.');
  if (!emailPattern.test(data.email)) throw new InputError('Enter a valid email address.');
  if (data.countryCode === 'IN' && !indianPanPattern.test(data.pan)) throw new InputError('Enter a valid Indian PAN.');
  if (data.countryCode === 'IN' && !/^\d{6}$/.test(data.postal)) throw new InputError('Enter a six-digit Indian PIN code.');
  if (data.countryCode === 'US' && data.postal && !usPostalPattern.test(data.postal)) throw new InputError('Enter a valid US ZIP code.');
  if (data.countryCode === 'GB' && data.postal && !ukPostalPattern.test(data.postal)) throw new InputError('Enter a valid UK postcode.');
  if (data.phone) {
    const phone = parsePhoneNumberFromString(data.phone);
    if (!phone?.isValid()) throw new InputError('Enter a valid international phone number.');
    data.phone = phone.number;
  }
  return data;
}
