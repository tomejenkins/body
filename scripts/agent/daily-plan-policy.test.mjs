import test from 'node:test';
import assert from 'node:assert/strict';
import { planDigest, parseDailyPlan, validateDailyApproval } from './daily-plan-policy.mjs';

const today = '2026-11-25';
const body = JSON.stringify({
  version: 1, date: today,
  primary: [{ issue: 71, estimatedApiUsd: 0.5 }, { issue: 72, estimatedApiUsd: 1 }],
  alternatives: [{ issue: 73, estimatedApiUsd: 0.75 }],
});
const issue = n => ({ number: n, state: 'open', body: 'Fix workout bug',
  labels: [{ name: 'agent-proposed' }], assignees: [{ login: 'tomejenkins' }] });
const approval = issues => ({
  user: { login: 'tomejenkins' },
  body: 'BODY-APPROVE v1 sha256=' + planDigest(body) + ' issues=' + issues,
});
const params = () => ({
  today, planIssue: { number: 70, state: 'open', body, labels: [{ name: 'agent-plan' }] },
  comments: [approval('71,73')], taskIssues: [issue(71), issue(72), issue(73)],
  openPrIssueNumbers: [], spending: {
    recordedApiUsd: 1.26, pendingApiUsd: 0, verifiedAt: Date.now(), now: Date.now(),
  },
});
test('allows two selected tasks including an alternative, not all proposed tasks', () => {
  assert.deepEqual(validateDailyApproval(params()).issues, [71, 73]);
});
test('rejects unapproved plan body edits', () => {
  const v = params(); v.planIssue.body += ' '; v.planIssue.body += '"changed"';
  assert.equal(validateDailyApproval(v).allowed, false);
});
test('rejects any non-owner approval', () => {
  const v = params(); v.comments[0].user.login = 'github-actions[bot]';
  assert.equal(validateDailyApproval(v).allowed, false);
});
test('rejects duplicate owner approvals', () => {
  const v = params(); v.comments.push(approval('71'));
  assert.equal(validateDailyApproval(v).allowed, false);
});
test('rejects out-of-plan and duplicate issue selections', () => {
  for (const selected of ['71,74', '71,71']) {
    const v = params(); v.comments = [approval(selected)];
    assert.equal(validateDailyApproval(v).allowed, false);
  }
});
test('rejects already open PRs and blocked issues', () => {
  const v = params(); v.openPrIssueNumbers = [71];
  assert.equal(validateDailyApproval(v).allowed, false);
  const w = params(); w.taskIssues[0].labels.push({ name: 'agent-blocked' });
  assert.equal(validateDailyApproval(w).allowed, false);
});
test('rejects stale spending evidence', () => {
  const v = params(); v.spending.verifiedAt -= 16 * 60_000;
  assert.equal(validateDailyApproval(v).allowed, false);
});
test('rejects spending above daily $3 and monthly policy allowance', () => {
  const v = params(); v.planIssue.body = JSON.stringify({ version:1, date:today,
    primary: [{issue:71,estimatedApiUsd:2.5},{issue:72,estimatedApiUsd:2.5}],
    alternatives: [] });
  v.comments = [{ user:{login:'tomejenkins'}, body:
    'BODY-APPROVE v1 sha256=' + planDigest(v.planIssue.body) + ' issues=71,72' }];
  assert.equal(validateDailyApproval(v).allowed, false);
  const w = params(); w.spending.recordedApiUsd = 39;
  assert.equal(validateDailyApproval(w).allowed, false);
});
test('rejects malformed JSON, duplicate tasks and invalid dates', () => {
  assert.throws(() => parseDailyPlan('not json'));
  assert.throws(() => parseDailyPlan(JSON.stringify({ version:1,date:'2026-02-30',
    primary:[{issue:71,estimatedApiUsd:1}],alternatives:[] })));
  assert.throws(() => parseDailyPlan(JSON.stringify({ version:1,date:today,
    primary:[{issue:71,estimatedApiUsd:1}],alternatives:[{issue:71,estimatedApiUsd:1}] })));
});
test('date mismatch blocks replay', () => {
  const v = params(); v.today = '2026-11-26';
  assert.equal(validateDailyApproval(v).allowed, false);
});
