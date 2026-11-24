// Pure reservation state machine. Caller must store the ledger atomically in a
// trusted durable store; JSON files and Actions artifacts are NOT safe locks.
export const MAX_RESERVATION_USD = 5;
const validId = id => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,128}$/.test(id);
const money = n => typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function validateLedger(ledger) {
  if (!ledger || ledger.version !== 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test(ledger.month ?? '') ||
      !Array.isArray(ledger.reservations)) throw Error('Invalid ledger');
  const seen = new Set();
  for (const entry of ledger.reservations) {
    if (!validId(entry.id) || seen.has(entry.id) ||
        !['reserved', 'settled'].includes(entry.status) ||
        !money(entry.usd) || entry.usd > MAX_RESERVATION_USD) throw Error('Invalid reservation');
    seen.add(entry.id);
  }
  return ledger;
}
export function pendingUsd(ledger) {
  validateLedger(ledger);
  return ledger.reservations.filter(r => r.status === 'reserved').reduce((sum, r) => sum + r.usd, 0);
}
export function reserve(ledger, { id, usd, month }) {
  validateLedger(ledger);
  if (ledger.month !== month) throw Error('Month mismatch: manual reconciliation required');
  if (!validId(id) || !money(usd) || usd === 0 || usd > MAX_RESERVATION_USD) throw Error('Invalid request');
  if (ledger.reservations.some(r => r.id === id)) throw Error('Duplicate reservation');
  if (ledger.reservations.some(r => r.status === 'reserved')) throw Error('Only one active pilot run allowed');
  return { ...ledger, reservations: [...ledger.reservations, { id, usd, status: 'reserved' }] };
}
export function settle(ledger, id) {
  validateLedger(ledger);
  if (!validId(id) || !ledger.reservations.some(r => r.id === id && r.status === 'reserved')) {
    throw Error('Unknown or already settled reservation');
  }
  return { ...ledger, reservations: ledger.reservations.map(r =>
    r.id === id ? { ...r, status: 'settled' } : r) };
}
