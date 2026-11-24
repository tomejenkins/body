import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCostsUrl, fetchProjectCosts } from './costs-client.mjs';
import { BODY_OPENAI_PROJECT_ID } from './budget-config.mjs';

test('scopes query to exact project and grouping', () => {
  const u = new URL(buildCostsUrl({ startUnix: 100, endUnix: 200 }));
  assert.deepEqual(u.searchParams.getAll('project_ids[]'), [BODY_OPENAI_PROJECT_ID]);
  assert.deepEqual(u.searchParams.getAll('group_by[]'), ['project_id']);
  assert.equal(u.searchParams.get('bucket_width'), '1d');
});
test('rejects a different project', () => assert.throws(() =>
  buildCostsUrl({ startUnix: 100, endUnix: 200, projectId: 'proj_other' })));
test('does not fetch without credential', async () => {
  let called = false;
  await assert.rejects(fetchProjectCosts({ adminKey: '', startUnix: 100, endUnix: 200, fetchImpl: () => { called = true; } }));
  assert.equal(called, false);
});
test('paginates with injected mock, never using network', async () => {
  const urls = [];
  const pages = await fetchProjectCosts({
    adminKey: 'sk-fake-test-key-not-real', startUnix: 100, endUnix: 200,
    fetchImpl: async url => {
      urls.push(new URL(url));
      return { ok: true, json: async () => urls.length === 1
        ? { data: [], has_more: true, next_page: 'cursor_2' }
        : { data: [], has_more: false } };
    },
  });
  assert.equal(pages.length, 2);
  assert.equal(urls[1].searchParams.get('page'), 'cursor_2');
});
test('rejects repeated pagination cursor', async () => {
  await assert.rejects(fetchProjectCosts({
    adminKey: 'sk-fake-test-key-not-real', startUnix: 100, endUnix: 200,
    fetchImpl: async () => ({ ok: true, json: async () => ({ data: [], has_more: true, next_page: 'same' }) }),
  }), /repeated costs cursor/);
});
test('rejects HTTP failure without leaking credential', async () => {
  await assert.rejects(fetchProjectCosts({
    adminKey: 'sk-fake-test-key-not-real', startUnix: 100, endUnix: 200,
    fetchImpl: async () => ({ ok: false, status: 403 }),
  }), /HTTP 403/);
});
