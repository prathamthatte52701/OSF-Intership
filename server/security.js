import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import argon2 from 'argon2';

export const newId = () => randomBytes(16).toString('hex');
export const newOtp = () => String(randomInt(100000, 1000000));
export const newUserId = () => `OSF-${randomInt(100000, 1000000)}`;
export const newSecret = (bytes = 32) => randomBytes(bytes).toString('base64url');
export const sha256 = value => createHash('sha256').update(value).digest('hex');

export function hashOtp(otp) {
  const pepper = process.env.OTP_HMAC_SECRET;
  if (!pepper) throw new Error('OTP_HMAC_SECRET is required');
  return createHmac('sha256', pepper).update(otp).digest();
}

export function otpMatches(candidate, expectedHex) {
  const expected = Buffer.from(expectedHex, 'hex');
  const actual = hashOtp(candidate);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export const hashPassword = password => argon2.hash(password, { type: argon2.argon2id });
export const verifyPassword = (hash, password) => argon2.verify(hash, password);

export function validatePassword(password) {
  return typeof password === 'string'
    && password.length >= 12
    && /[A-Z]/.test(password)
    && /[a-z]/.test(password)
    && /\d/.test(password)
    && /[^A-Za-z0-9]/.test(password);
}
