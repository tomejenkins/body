// Trusted, read-only OpenAI billing proof for Body. Never pass the admin key to Codex.
import { assessBudget } from './pilot-policy.mjs';

export function parseCostsPage(page, projectId) {
  if (!page || page.object !== 'page' || !Array.isArray(page.data) ||
      typeof page.has_more !== 'boolean') throw Error('Unexpected OpenAI costs response');
  let amount = 0;
  for (const bucket of page.data) {
    if (bucket.object !== 'bucket' || !Array.isArray(bucket.results)) {
      throw Error('Unexpected OpenAI cost bucket');
    }
    for (const result of bucket.results) {
      if (result.project_id !== projectId || result.amount?.currency !== 'usd' ||
          !Number.isFinite(result.amount?.value) || result.amount.value < 0) {
        throw Error('OpenAI project attribution or USD amount missing');
      }
      amount += result.amount.value;
    }
  }
  if (page.has_more && (!page.next_page || typeof page.next_page !== 'string')) {
    throw Error('Unusable OpenAI cost pagination');
  }
  return { amount, nextPage: page.has_more ? page.next_page : null };
}

export async function readProjectCost({ adminKey, projectId, now = Date.now(), fetchFn = fetch }) {
  if (typeof adminKey !== 'string' || !adminKey.startsWith('sk-admin-') ||
      typeof projectId !== 'string' || !/^proj_[\w-]{4,}$/.test(projectId)) {
    throw Error('Dedicated OpenAI admin credential and project ID are required');
  }
  const start = new Date(now);
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);
  const startTime = Math.floor(start.getTime() / 1000);
  const endTime = Math.floor(now / 1000);
  let cursor = null, total = 0;
  for (let i = 0; i < 10; i++) {
    const url = new URL('https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time', String(startTime));
    url.searchParams.set('end_time', String(endTime));
    url.searchParams.set('bucket_width', '1d');
    url.searchParams.set('limit', '31');
    url.searchParams.append('group_by', 'project_id');
    url.searchParams.append('project_ids', projectId);
    if (cursor) url.searchParams.set('page', cursor);
    const response = await fetchFn(url.toString(), {
      headers: { Authorization: 'Bearer ' + adminKey },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw Error('OpenAI billing verification unavailable: HTTP ' + response.status);
    const page = parseCostsPage(await response.json(), projectId);
    total += page.amount;
    if (!page.nextPage) return {
      recordedApiUsd: total,
      verifiedAt: Date.now(),
      period: start.toISOString().slice(0, 7),
      projectId,
    };
    cursor = page.nextPage;
  }
  throw Error('OpenAI billing exceeded pagination safety cap');
}

export function validateQueueBudget({ billing, reservationUsd, plannedUsd, now = Date.now() }) {
  if (!billing || !Number.isFinite(reservationUsd) || reservationUsd < 0 ||
      !Number.isFinite(plannedUsd) || plannedUsd <= 0 || plannedUsd > 3) {
    return { allowed: false, reason: 'Invalid billing or reservation evidence' };
  }
  // Conservatively count all unresolved claims plus API cost; may double count.
  return assessBudget({
    recordedApiUsd: billing.recordedApiUsd,
    pendingApiUsd: reservationUsd,
    estimatedRunUsd: plannedUsd,
    verifiedAt: billing.verifiedAt,
    now,
  });
}

// Only trusted github-actions[bot] ledger comments count. Reject malformed claims.
export function sumReservations(comments, month) {
  let amountCents = 0;
  const planIds = new Set();
  const taskIds = new Set();
  for (const comment of comments) {
    const body = String(comment.body ?? '');
    if (!body.startsWith('BODY-RESERVE v1 ')) continue;
    if (comment.user?.login !== 'github-actions[bot]') {
      throw Error('Untrusted ledger reservation comment');
    }
    let entry;
    try { entry = JSON.parse(body.slice('BODY-RESERVE v1 '.length)); }
    catch { throw Error('Unparseable ledger reservation'); }
    if (!Number.isSafeInteger(entry.plan) || entry.plan <= 0 ||
        !/^[a-f0-9]{64}$/.test(entry.digest) ||
        !/^\d{4}-\d{2}$/.test(entry.month) ||
        !Array.isArray(entry.tasks) || entry.tasks.length < 1 || entry.tasks.length > 3) {
      throw Error('Invalid reservation entry');
    }
    if (entry.month !== month) continue;
    if (planIds.has(entry.plan)) throw Error('Duplicate plan reservation found');
    planIds.add(entry.plan);
    for (const t of entry.tasks) {
      if (!Number.isSafeInteger(t.issue) || t.issue < 1 ||
          !Number.isSafeInteger(t.cents) || t.cents < 1 || t.cents > 500) {
        throw Error('Invalid task reservation');
      }
      if (taskIds.has(t.issue)) throw Error('Duplicate task reservation found');
      taskIds.add(t.issue);
      amountCents += t.cents;
    }
  }
  return { reservedApiUsd: amountCents / 100, reservedPlans: planIds, reservedIssues: taskIds };
}
