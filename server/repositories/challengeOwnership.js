import { InputError } from '../validation.js';

// Ownership check for any route acting on a company's challenge (applicants, evaluations...).
// `challenges` is the challenges repository. Returns the row (with requiredSkills) or throws the routes' 404.
export async function challengeOwnedByCompany(challenges, challengeId, companyId) {
  const challenge = await challenges.getOwned(challengeId, companyId);
  if (!challenge) throw new InputError('Challenge not found.', 404);
  return challenge;
}
