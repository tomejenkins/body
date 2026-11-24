// Diagnostic budget decision. Never use this alone to authorize paid calls:
// current-day billing is delayed, and no durable atomic ledger exists yet.
import { assessBudget } from './pilot-policy.mjs';
import { pendingUsd, validateLedger } from './reservation-ledger.mjs';
import { BODY_OPENAI_PROJECT_ID } from './budget-config.mjs';

export function evaluateBudgetSnapshot({ projectId, month, reportedUsd, ledger, verifiedAt, now, estimatedRunUsd = 5 }) {
  if (projectId !== BODY_OPENAI_PROJECT_ID) throw Error('Wrong project');
  validateLedger(ledger);
  if (ledger.month !== month || !/^\d{4}-(0[1-9]|1[0-2])$/.test(month ?? '')) throw Error('Month mismatch');
  if (!Number.isFinite(reportedUsd) || reportedUsd < 0) throw Error('Invalid reported cost');
  const policy = assessBudget({ recordedApiUsd: reportedUsd, pendingApiUsd: pendingUsd(ledger),
    estimatedRunUsd, verifiedAt, now });
  return { ...policy, authorization: 'BLOCKED_UNTIL_LIVE_BILLING_AND_ATOMIC_LEDGER',
    projectId, reportedUsd, reservedUsd: pendingUsd(ledger) };
}
