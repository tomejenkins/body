// Read-only, fail-closed preflight. Does not call OpenAI or modify GitHub.
import { execFileSync } from 'node:child_process';

function fail(message) {
  console.error(message);
  process.exit(1);
}

const raw = process.env.ISSUE_NUMBER ?? '';
const phrase = process.env.APPROVAL_PHRASE ?? '';
if (!/^[1-9][0-9]{0,7}$/.test(raw)) fail('Issue number must be a positive integer.');
if (phrase !== 'approved-pilot') fail('Pilot approval phrase mismatch.');
if (process.env.GITHUB_REPOSITORY !== 'tomejenkins/body') fail('Wrong repository.');
if (process.env.GITHUB_REF !== 'refs/heads/main') fail('Manual pilot must target main.');
if (process.env.GITHUB_EVENT_NAME !== 'workflow_dispatch') fail('Manual dispatch required.');

let issue;
try {
  issue = JSON.parse(execFileSync('gh', [
    'api', '--method', 'GET',
    `repos/tomejenkins/body/issues/${raw}`,
  ], { encoding: 'utf8', timeout: 10000, stdio: ['ignore', 'pipe', 'pipe'] }));
} catch {
  fail('Could not verify issue; fail closed.');
}
if (issue.pull_request || issue.state !== 'open') fail('Expected an open issue, not a PR.');
const labels = new Set((issue.labels ?? []).map(label => label.name));
if (!labels.has('agent-approved') || !labels.has('agent-ready')) {
  fail('Issue requires both agent-approved and agent-ready labels.');
}
if (!issue.assignee && !(issue.assignees ?? []).length) {
  fail('Issue must have an assigned human owner.');
}
console.log(`Validated approved issue #${raw}. No paid execution performed.`);
