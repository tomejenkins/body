// Pure daily-plan approval policy. No GitHub writes, no network or paid API calls.
import { createHash } from 'node:crypto';
import { assessBudget } from './pilot-policy.mjs';

export const DAILY_TASK_LIMIT = 3;
export const DAILY_API_LIMIT_USD = 3;
export const PLAN_OWNER = 'tomejenkins';
const issueNumber = (n) => Number.isSafeInteger(n) && n > 0 && n <= 99_999_999;
const usd = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0 && n <= 5;
const fail = (reason) => ({ allowed: false, reason });

export function planDigest(body) {
  if (typeof body !== 'string' || !body.trim() || body.length > 12000) {
    throw new Error('Plan must have 1–12,000 characters');
  }
  return createHash('sha256').update(body.trim(), 'utf8').digest('hex');
}

// A plan issue has a JSON-only body; this makes approvals refer to exact bytes.
export function parseDailyPlan(body) {
  if (typeof body !== 'string' || body.length > 12000) throw Error('Invalid plan body');
  const plan = JSON.parse(body);
  if (!plan || Array.isArray(plan) || plan.version !== 1 ||
      typeof plan.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(plan.date) ||
      !Array.isArray(plan.primary) || !Array.isArray(plan.alternatives) ||
      plan.primary.length < 1 || plan.primary.length > 3 ||
      plan.alternatives.length > 5 ||
      Object.keys(plan).sort().join(',') !== 'alternatives,date,primary,version') {
    throw Error('Invalid daily plan schema');
  }
  const tasks = [...plan.primary, ...plan.alternatives];
  if (!tasks.every(t => t && !Array.isArray(t) &&
      Object.keys(t).sort().join(',') === 'estimatedApiUsd,issue,taskSha256' &&
      issueNumber(t.issue) && usd(t.estimatedApiUsd) &&
      typeof t.taskSha256 === 'string' && /^[a-f0-9]{64}$/.test(t.taskSha256)) ||
      new Set(tasks.map(t => t.issue)).size !== tasks.length) {
    throw Error('Invalid or duplicate task entry');
  }
  const actual = new Date(plan.date + 'T00:00:00Z');
  if (Number.isNaN(actual.getTime()) || actual.toISOString().slice(0,10) !== plan.date) {
    throw Error('Invalid calendar date');
  }
  return plan;
}

// Comment must be written by the real owner and match the exact plan body.
// A bot-created issue or label cannot self-approve paid work.
export function validateDailyApproval({
  planIssue, comments, taskIssues, openPrIssueNumbers = [], today, spending,
}) {
  if (!planIssue || planIssue.pull_request || planIssue.state !== 'open' ||
      !issueNumber(planIssue.number) ||
      !(planIssue.labels ?? []).some(l => (typeof l === 'string' ? l : l.name) === 'agent-plan')) {
    return fail('Plan issue is not a valid open agent-plan issue');
  }
  let plan, digest;
  try {
    plan = parseDailyPlan(planIssue.body);
    digest = planDigest(planIssue.body);
  } catch {
    return fail('Plan body is not valid JSON-only daily plan data');
  }
  if (plan.date !== today) return fail('Plan is not for the execution date');
  const approvals = (comments ?? []).filter(c =>
    c.user?.login === PLAN_OWNER &&
    typeof c.body === 'string' &&
    c.body.startsWith('BODY-APPROVE v1 ')
  );
  if (approvals.length !== 1) return fail('Exactly one owner approval comment is required');
  const match = /^BODY-APPROVE v1 sha256=([a-f0-9]{64}) issues=([1-9][0-9]*(?:,[1-9][0-9]*){0,2})$/.exec(approvals[0].body.trim());
  if (!match || match[1] !== digest) return fail('Owner approval does not match current plan');
  const selected = match[2].split(',').map(Number);
  if (selected.length > DAILY_TASK_LIMIT || new Set(selected).size !== selected.length) {
    return fail('Too many or duplicate approved tasks');
  }
  const candidates = [...plan.primary, ...plan.alternatives];
  if (!selected.every(n => candidates.some(t => t.issue === n))) {
    return fail('Approval includes a task outside the proposed plan');
  }
  const issues = new Map((taskIssues ?? []).map(i => [i.number, i]));
  for (const n of selected) {
    const issue = issues.get(n);
    const expectedDigest = candidates.find(t => t.issue === n)?.taskSha256;
    const labels = (issue?.labels ?? []).map(l => (typeof l === 'string' ? l : l.name));
    if (!issue || issue.pull_request || issue.state !== 'open' ||
        !labels.includes('agent-proposed') || labels.includes('agent-blocked') ||
        !issue.body?.trim() || issue.body.length > 12000 ||
        planDigest(issue.body) !== expectedDigest ||
        !issue.assignees?.some(a => a.login === PLAN_OWNER)) {
      return fail('Approved task is missing, blocked, or not owner-assigned');
    }
  }
  if (selected.some(n => openPrIssueNumbers.includes(n))) {
    return fail('An approved task already has an open PR');
  }
  const estimated = candidates.filter(t => selected.includes(t.issue))
    .reduce((sum,t) => sum + t.estimatedApiUsd, 0);
  if (estimated > DAILY_API_LIMIT_USD + 1e-9) return fail('Daily $3 API allowance exceeded');
  const budget = assessBudget({ ...spending, estimatedRunUsd: estimated });
  if (!budget.allowed) return fail('API spending evidence rejected: ' + budget.reason);
  return { allowed: true, issues: selected, estimatedApiUsd: estimated,
    projectedApiUsd: budget.projectedApiUsd, warning: budget.warning };
}
