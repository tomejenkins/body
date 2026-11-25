// Conservative validation of completed daily Costs API buckets.
// This diagnostic parser never grants permission to make paid API calls.
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

// OpenAI may paginate daily buckets. Validate the complete ordered chain only
// after all pages are fetched. Duplicate, skipped and out-of-order buckets fail.
export function parsePaginatedMonthlyCosts(pages, options) {
  if (!Array.isArray(pages) || pages.length === 0) throw Error('Missing costs pages');
  const buckets = [];
  for (let i = 0; i < pages.length; i++) {
    const page = pages[i];
    if (!page || !Array.isArray(page.data) || typeof page.has_more !== 'boolean' ||
        page.has_more !== (i < pages.length - 1)) throw Error('Invalid page chain');
    buckets.push(...page.data);
  }
  return parseMonthlyCosts({ has_more: false, data: buckets }, options);
}
