import test from 'node:test';
import assert from 'node:assert/strict';
import { pendingUsd, reserve, settle, validateLedger } from './reservation-ledger.mjs';
const base = () => ({ version: 1, month: '2026-11', reservations: [] });
const req = { id: 'run_12345678', usd: 5, month: '2026-11' };
test('reserves at most one run', () => {
  const next = reserve(base(), req);
  assert.equal(pendingUsd(next), 5);
  assert.throws(() => reserve(next, { ...req, id: 'run_87654321' }), /one active/);
});
test('rejects duplicate ids after settlement', () => {
  const next = settle(reserve(base(), req), req.id);
  assert.equal(pendingUsd(next), 0);
  assert.throws(() => reserve(next, req), /Duplicate/);
});
test('rejects month rollover without reconciliation', () =>
  assert.throws(() => reserve(base(), { ...req, month: '2026-12' }), /Month mismatch/));
test('rejects oversized reservation', () =>
  assert.throws(() => reserve(base(), { ...req, usd: 5.01 }), /Invalid request/));
test('rejects invalid ledger and duplicate entries', () => {
  const next = reserve(base(), req);
  assert.throws(() => validateLedger({ ...next, reservations: [...next.reservations, ...next.reservations] }), /Invalid reservation/);
});
test('rejects settlement twice', () => {
  const next = settle(reserve(base(), req), req.id);
  assert.throws(() => settle(next, req.id), /Unknown or already settled/);
});
