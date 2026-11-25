// Safe local-only preflight. Explicitly not a live spending verification.
import { assessBudget } from './pilot-policy.mjs';
const result = assessBudget({
  recordedApiUsd: Number.NaN,
  pendingApiUsd: Number.NaN,
  estimatedRunUsd: 5,
  verifiedAt: Number.NaN,
});
if (result.allowed) throw new Error('Unverified pilot must never pass');
console.log('Pilot blocked (expected): ' + result.reason);
console.log('No OpenAI request, GitHub write, or deployment performed.');
