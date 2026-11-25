// Read-only, fail-closed gate for proposed daily execution. No paid actions.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { planDigest, parseDailyPlan, validateDailyApproval } from './daily-plan-policy.mjs';

const REPO = 'tomejenkins/body';
const fail = message => { throw Error(message); };
const number = String(process.env.PLAN_ISSUE_NUMBER ?? '');
if (!/^[1-9][0-9]{0,7}$/.test(number)) fail('Expected a valid plan issue number');
if (process.env.GITHUB_REPOSITORY !== REPO ||
    process.env.GITHUB_REF !== 'refs/heads/main' ||
    process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch' ||
    process.env.GITHUB_ACTOR !== 'tomejenkins') fail('Owner-only manual preflight on main required');

const api = endpoint => JSON.parse(execFileSync('gh', ['api', '--method', 'GET', endpoint], {
  encoding: 'utf8', timeout: 20000, maxBuffer: 2_000_000,
  stdio: ['ignore', 'pipe', 'pipe'],
}));
function pages(path) {
  const out = [];
  for (let page = 1; page <= 10; page++) {
    const rows = api('repos/' + REPO + '/' + path + (path.includes('?') ? '&' : '?') +
      'per_page=100&page=' + page);
    if (!Array.isArray(rows)) fail('GitHub pagination returned unexpected data');
    out.push(...rows);
    if (rows.length < 100) return out;
  }
  fail('Pagination exceeds review limits');
}
const planIssue = api('repos/' + REPO + '/issues/' + number);
const plan = parseDailyPlan(planIssue.body);
const comments = pages('issues/' + number + '/comments');
const allNumbers = [...new Set([...plan.primary, ...plan.alternatives].map(t => t.issue))];
const taskIssues = allNumbers.map(n => api('repos/' + REPO + '/issues/' + n));
const pulls = pages('pulls?state=open');
const openPrIssueNumbers = [];
for (const pull of pulls) {
  const body = String(pull.body ?? '');
  const match = /(?:^|\n)Closes #([1-9][0-9]{0,7})(?=\s|$)/gm;
  for (const m of body.matchAll(match)) openPrIssueNumbers.push(Number(m[1]));
  const agentBranch = /^codex\/issue-([1-9][0-9]{0,7})-run-/.exec(pull.head?.ref ?? '');
  if (agentBranch) openPrIssueNumbers.push(Number(agentBranch[1]));
}
const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Los_Angeles', year: 'numeric',
  month: '2-digit', day: '2-digit',
});
const pieces = Object.fromEntries(formatter.formatToParts(new Date())
  .filter(x => ['year','month','day'].includes(x.type)).map(x => [x.type,x.value]));
const today = pieces.year + '-' + pieces.month + '-' + pieces.day;
if (today !== plan.date) fail('Plan day differs from current Pacific date');

// SIMULATED budget evidence. This script grants no authorization to spend.
// Trusted billing evidence and atomic reservations are mandatory for C2.
const simulation = {
  recordedApiUsd: 0, pendingApiUsd: 0,
  verifiedAt: Date.now(), now: Date.now(),
};
const result = validateDailyApproval({
  planIssue, comments, taskIssues, openPrIssueNumbers, today, spending: simulation,
});
if (!result.allowed) fail('Daily plan validation failed: ' + result.reason);
const report = {
  mode: 'DRY_RUN_ONLY_NOT_AUTHORIZED_TO_SPEND',
  planIssue: Number(number),
  planSha256: planDigest(planIssue.body),
  selectedIssueNumbers: result.issues,
  estimatedApiUsd: result.estimatedApiUsd,
  billVerification: 'NOT_PERFORMED',
  budgetReservation: 'NOT_PERFORMED',
  executionAuthorized: false,
};
console.log(JSON.stringify(report, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY,
    '### Body daily queue — read-only preflight\n\n' +
    '**Not approved for paid execution:** billing and atomic reservations are not implemented.\n\n' +
    'Plan: #' + number + '; selected tasks: ' + result.issues.map(n => '#' + n).join(', ') +
    '; aggregate estimated API cost: $' + result.estimatedApiUsd.toFixed(2) + '\n',
    { flag: 'a' });
}
