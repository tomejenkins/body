// Configuration preview only: no Codex CLI install, model invocation or write access.
import { assessBudget } from './pilot-policy.mjs';

const required = ['OPENAI_API_KEY', 'GITHUB_REPOSITORY', 'ISSUE_NUMBER'];
const present = Object.fromEntries(required.map(name => [name, Boolean(process.env[name])]));
const budget = assessBudget({
  recordedApiUsd: Number.NaN,
  pendingApiUsd: Number.NaN,
  estimatedRunUsd: 5,
  verifiedAt: Number.NaN,
});
console.log(JSON.stringify({
  mode: 'configuration-preview',
  repository: process.env.GITHUB_REPOSITORY ?? null,
  issueNumber: process.env.ISSUE_NUMBER ?? null,
  requiredEnvironmentPresent: present,
  codexCli: 'NOT INSTALLED OR INVOKED',
  budgetAllowed: budget.allowed,
  reason: budget.reason,
  publishing: 'DISABLED',
  note: 'Presence flags only; secret values are never printed.',
}, null, 2));
