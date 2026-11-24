// Pure parser for OpenAI organization Costs API response. No network or secrets.
// Only accepts complete daily buckets within the requested month, for the
// explicitly configured project. Incomplete current-day usage is not a hard cap.
export function parseMonthlyCosts(payload, { projectId, startUnix, endUnix }) {
  if (!/^proj_[A-Za-z0-9_-]+$/.test(projectId ?? '')) throw Error('Invalid project ID');
  if (!Number.isSafeInteger(startUnix) || !Number.isSafeInteger(endUnix) || endUnix <= startUnix) {
    throw Error('Invalid billing window');
  }
  if (!payload || !Array.isArray(payload.data) || payload.has_more !== false) {
    throw Error('Incomplete or malformed costs response');
  }
  let total = 0;
  let expectedStart = startUnix;
  for (const bucket of payload.data) {
    if (!Number.isSafeInteger(bucket.start_time) || !Number.isSafeInteger(bucket.end_time) ||
        bucket.start_time !== expectedStart || bucket.end_time <= bucket.start_time ||
        bucket.end_time > endUnix || !Array.isArray(bucket.results)) {
      throw Error('Missing, overlapping, or invalid costs bucket');
    }
    for (const result of bucket.results) {
      if (result.project_id !== projectId) throw Error('Unscoped or mismatched project costs');
      const amount = result.amount;
      if (amount?.currency !== 'usd' || typeof amount.value !== 'number' ||
          !Number.isFinite(amount.value) || amount.value < 0) throw Error('Invalid USD cost');
      total += amount.value;
    }
    expectedStart = bucket.end_time;
  }
  if (expectedStart !== endUnix) throw Error('Incomplete billing window');
  return total;
}
