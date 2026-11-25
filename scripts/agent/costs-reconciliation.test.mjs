import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePaginatedMonthlyCosts } from './costs-policy.mjs';
import { reconcileCostSnapshot } from './costs-reconciliation.mjs';
import { BODY_OPENAI_PROJECT_ID } from './budget-config.mjs';
const opts = { projectId: BODY_OPENAI_PROJECT_ID, startUnix: 100, endUnix: 300 };
const bucket = (start, end, usd) => ({ start_time: start, end_time: end,
  results: [{ project_id: BODY_OPENAI_PROJECT_ID, amount: { currency: 'usd', value: usd } }] });
const pages = [
  { data: [bucket(100, 200, 2)], has_more: true, next_page: 'page2' },
  { data: [bucket(200, 300, 3)], has_more: false },
];
test('sums complete paginated buckets', () =>
  assert.equal(parsePaginatedMonthlyCosts(pages, opts), 5));
test('rejects missing middle page', () =>
  assert.throws(() => parsePaginatedMonthlyCosts([pages[0]], opts), /Invalid page chain/));
test('rejects gaps in buckets', () =>
  assert.throws(() => parsePaginatedMonthlyCosts([
    { data: [bucket(100, 190, 2)], has_more: true },
    pages[1],
  ], opts), /Missing, overlapping/));
test('rejects duplicated buckets', () =>
  assert.throws(() => parsePaginatedMonthlyCosts([
    pages[0],
    { data: [bucket(100, 200, 2)], has_more: false },
  ], opts), /Missing, overlapping/));
test('rejects out-of-order pages', () =>
  assert.throws(() => parsePaginatedMonthlyCosts([pages[1], pages[0]], opts)));
test('never authorizes paid execution from diagnostic costs', () => {
  const result = reconcileCostSnapshot({ pages, startUnix: 100, endUnix: 300,
    month: '2026-11', ledger: { version: 1, month: '2026-11', reservations: [] } });
  assert.equal(result.reportedUsd, 5);
  assert.equal(result.safeToExecutePaidRun, false);
});
