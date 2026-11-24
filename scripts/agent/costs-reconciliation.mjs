// Unpaid diagnostic reconciliation. Never treats Costs API data as live or
// releases a reservation automatically: daily billing data can lag.
import { BODY_OPENAI_PROJECT_ID } from './budget-config.mjs';
import { parsePaginatedMonthlyCosts } from './costs-policy.mjs';
import { evaluateBudgetSnapshot } from './budget-evaluation.mjs';

export function reconcileCostSnapshot({ pages, startUnix, endUnix, month, ledger, now = Date.now() }) {
  if (!Number.isFinite(now)) throw Error('Invalid clock');
  // Only inspect completed daily buckets; current day and unreported usage
  // must be handled by a separately implemented trusted reconciliation process.
  const reportedUsd = parsePaginatedMonthlyCosts(pages, {
    projectId: BODY_OPENAI_PROJECT_ID, startUnix, endUnix,
  });
  const diagnostic = evaluateBudgetSnapshot({
    projectId: BODY_OPENAI_PROJECT_ID, month, reportedUsd, ledger,
    verifiedAt: now, now,
  });
  return {
    ...diagnostic,
    billingWindowEndUnix: endUnix,
    unreportedCurrentDay: true,
    safeToExecutePaidRun: false,
    reason: 'Delayed billing and durable reservation reconciliation not verified',
  };
}
