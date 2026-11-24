import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateBudgetSnapshot } from './budget-evaluation.mjs';
import { BODY_OPENAI_PROJECT_ID } from './budget-config.mjs';
const now = 1700000000000;
const snapshot = () => ({ projectId: BODY_OPENAI_PROJECT_ID, month: '2026-11',
  reportedUsd: 12, ledger: { version: 1, month: '2026-11', reservations: [] },
  verifiedAt: now, now });
test('computes illustrative allowance but blocks live authorization', () => {
  const result = evaluateBudgetSnapshot(snapshot());
  assert.equal(result.projectedApiUsd, 17);
  assert.equal(result.authorization, 'BLOCKED_UNTIL_LIVE_BILLING_AND_ATOMIC_LEDGER');
});
test('rejects stale evidence', () => {
  assert.equal(evaluateBudgetSnapshot({ ...snapshot(), verifiedAt: now - 16 * 60 * 1000 }).allowed, false);
});
test('rejects exhausted allowance', () => {
  assert.equal(evaluateBudgetSnapshot({ ...snapshot(), reportedUsd: 39 }).allowed, false);
});
test('rejects incorrect project', () =>
  assert.throws(() => evaluateBudgetSnapshot({ ...snapshot(), projectId: 'proj_other' }), /Wrong project/));
test('rejects inconsistent ledger month', () =>
  assert.throws(() => evaluateBudgetSnapshot({ ...snapshot(), month: '2026-12' }), /Month mismatch/));
