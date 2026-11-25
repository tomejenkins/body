// Pure pilot safety policy. No credentials, network, or paid calls.
export const API_BUDGET_USD = 40;
export const TOTAL_BUDGET_USD = 50;
export const WARNING_USD = 30;
export const MAX_RUN_ESTIMATE_USD = 5;

export function assessBudget({ recordedApiUsd, pendingApiUsd, estimatedRunUsd, verifiedAt, now = Date.now() }) {
  const values = [recordedApiUsd, pendingApiUsd, estimatedRunUsd];
  if (values.some(value => !Number.isFinite(value) || value < 0)) {
    return { allowed: false, reason: 'Missing or invalid verified spending data' };
  }
  if (!Number.isFinite(verifiedAt) || verifiedAt > now || now - verifiedAt > 15 * 60 * 1000) {
    return { allowed: false, reason: 'Spending evidence missing or stale' };
  }
  if (estimatedRunUsd > MAX_RUN_ESTIMATE_USD) {
    return { allowed: false, reason: 'Run exceeds $5 pilot estimate ceiling' };
  }
  const projected = recordedApiUsd + pendingApiUsd + estimatedRunUsd;
  if (projected > API_BUDGET_USD) {
    return { allowed: false, reason: 'Projected API spending exceeds $40 allowance' };
  }
  return { allowed: true, warning: projected >= WARNING_USD, projectedApiUsd: projected };
}

const forbiddenExact = new Set(['AGENTS.md', 'package.json', 'package-lock.json']);
const forbiddenPrefixes = ['.github/', 'scripts/agent/', 'supabase/migrations/', 'supabase/seed', '.env', 'wrangler', 'docs/autonomous-agent'];
export function validatePatchPaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) return { allowed: false, reason: 'No files to publish' };
  for (const path of paths) {
    if (typeof path !== 'string' || !path || path.startsWith('/') || path.includes('\\') ||
        path.split('/').some(segment => segment === '..' || segment === '.' || !segment) ||
        forbiddenExact.has(path) || forbiddenPrefixes.some(prefix => path.startsWith(prefix)) ||
        path.split('/').some(segment => segment.startsWith('.env'))) {
      return { allowed: false, reason: 'Disallowed or unsafe path' };
    }
  }
  return { allowed: true };
}
