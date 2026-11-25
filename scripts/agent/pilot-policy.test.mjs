import test from 'node:test';
import assert from 'node:assert/strict';
import { assessBudget, validatePatchPaths } from './pilot-policy.mjs';

const now = Date.parse('2026-11-24T00:00:00Z');
const valid = { recordedApiUsd: 2, pendingApiUsd: 1, estimatedRunUsd: 3, verifiedAt: now, now };
test('allows bounded fresh spending evidence', () => assert.equal(assessBudget(valid).allowed, true));
test('rejects stale evidence', () => assert.equal(assessBudget({ ...valid, verifiedAt: now - 16 * 60_000 }).allowed, false));
test('rejects unknown costs', () => assert.equal(assessBudget({ ...valid, pendingApiUsd: undefined }).allowed, false));
test('rejects exceeding API allowance', () => assert.equal(assessBudget({ ...valid, recordedApiUsd: 39 }).allowed, false));
test('rejects run estimate over $5', () => assert.equal(assessBudget({ ...valid, estimatedRunUsd: 6 }).allowed, false));
test('rejects future evidence', () => assert.equal(assessBudget({ ...valid, verifiedAt: now + 1 }).allowed, false));
test('allows ordinary source changes', () => assert.equal(validatePatchPaths(['src/components/Example.tsx']).allowed, true));
for (const path of ['.github/workflows/test.yml', 'AGENTS.md', 'scripts/agent/pilot-policy.mjs', 'supabase/migrations/123.sql', '.env.local', 'src/../AGENTS.md', '/tmp/file', 'src\\file']) {
  test(`rejects unsafe path: ${path}`, () => assert.equal(validatePatchPaths([path]).allowed, false));
}
