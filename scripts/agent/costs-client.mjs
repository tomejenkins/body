// Network-capable library; not invoked by any workflow.
// Caller must provide the Admin API key only from an isolated trusted process.
// Do not run from a repository checkout with third-party install scripts.
import { BODY_OPENAI_PROJECT_ID, assertBodyProjectId } from './budget-config.mjs';

export function buildCostsUrl({ startUnix, endUnix, projectId = BODY_OPENAI_PROJECT_ID, page }) {
  assertBodyProjectId(projectId);
  if (!Number.isSafeInteger(startUnix) || !Number.isSafeInteger(endUnix) || endUnix <= startUnix) {
    throw Error('Invalid costs window');
  }
  const url = new URL('https://api.openai.com/v1/organization/costs');
  url.searchParams.set('start_time', String(startUnix));
  url.searchParams.set('end_time', String(endUnix));
  url.searchParams.set('bucket_width', '1d');
  url.searchParams.append('project_ids[]', projectId);
  url.searchParams.append('group_by[]', 'project_id');
  url.searchParams.set('limit', '31');
  if (page !== undefined) {
    if (typeof page !== 'string' || !/^[A-Za-z0-9_-]{1,512}$/.test(page)) throw Error('Invalid page cursor');
    url.searchParams.set('page', page);
  }
  return url.toString();
}

export async function fetchProjectCosts({ adminKey, startUnix, endUnix, fetchImpl, maxPages = 10 }) {
  if (typeof adminKey !== 'string' || !adminKey.startsWith('sk-') || adminKey.length < 15) {
    throw Error('Admin credential missing');
  }
  if (typeof fetchImpl !== 'function') throw Error('Fetch implementation required');
  const pages = [];
  const seen = new Set();
  let cursor;
  for (let index = 0; index < maxPages; index++) {
    const url = buildCostsUrl({ startUnix, endUnix, page: cursor });
    const response = await fetchImpl(url, {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + adminKey, Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw Error('Costs API request failed with HTTP ' + response.status);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.data) || typeof payload.has_more !== 'boolean') {
      throw Error('Invalid costs API response');
    }
    pages.push(payload);
    if (!payload.has_more) return pages;
    if (typeof payload.next_page !== 'string' || !payload.next_page || seen.has(payload.next_page)) {
      throw Error('Missing or repeated costs cursor');
    }
    cursor = payload.next_page;
    seen.add(cursor);
  }
  throw Error('Costs API pagination limit reached');
}
