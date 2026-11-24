import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMonthlyCosts } from './costs-policy.mjs';
const opts = { projectId: 'proj_body', startUnix: 100, endUnix: 200 };
const response = { has_more: false, data: [
  { start_time: 100, end_time: 200, results: [{ project_id: 'proj_body', amount: { currency: 'usd', value: 2.75 } }] },
] };
test('sums exact scoped complete response', () => assert.equal(parseMonthlyCosts(response, opts), 2.75));
test('rejects pagination', () => assert.throws(() => parseMonthlyCosts({ ...response, has_more: true }, opts)));
test('rejects wrong project', () => assert.throws(() => parseMonthlyCosts({ ...response, data: [{ ...response.data[0], results: [{ project_id: 'proj_other', amount: { currency: 'usd', value: 1 } }] }] }, opts)));
test('rejects missing bucket', () => assert.throws(() => parseMonthlyCosts({ has_more: false, data: [] }, opts)));
test('rejects partial bucket', () => assert.throws(() => parseMonthlyCosts({ has_more: false, data: [{ ...response.data[0], end_time: 150 }] }, opts)));
test('rejects non USD', () => assert.throws(() => parseMonthlyCosts({ ...response, data: [{ ...response.data[0], results: [{ project_id: 'proj_body', amount: { currency: 'eur', value: 1 } }] }] }, opts)));
test('rejects negative cost', () => assert.throws(() => parseMonthlyCosts({ ...response, data: [{ ...response.data[0], results: [{ project_id: 'proj_body', amount: { currency: 'usd', value: -1 } }] }] }, opts)));
