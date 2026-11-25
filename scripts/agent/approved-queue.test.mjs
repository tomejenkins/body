import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('unattended workflow has two explicit feature flags and owner identity gate',()=>{
 const yaml=readFileSync(new URL('../../.github/workflows/body-agent-approved-queue.yml',import.meta.url),'utf8');
 assert.match(yaml,/BODY_AGENT_UNATTENDED_ENABLED == 'true'/);
 assert.match(yaml,/BODY_OPENAI_HARD_LIMIT_CONFIRMED == 'true'/);
 assert.match(yaml,/github.actor == 'tomejenkins'/);
 assert.match(yaml,/issue_comment:/);
 assert.match(yaml,/types: \[created\]/);
});
test('admin billing credential is never provided to Codex action',()=>{
 const yaml=readFileSync(new URL('../../.github/workflows/body-agent-approved-queue.yml',import.meta.url),'utf8');
 const step=yaml.slice(yaml.indexOf('uses: openai/codex-action@v1'),
   yaml.indexOf('      - name: Validate actual patch'));
 assert.ok(step.startsWith('uses: openai/codex-action@v1'));
 assert.doesNotMatch(step,/BODY_OPENAI_ADMIN_KEY/);
 assert.match(step,/secrets.OPENAI_API_KEY/);
});
test('workflow cannot merge, deploy or automatically retry failed tasks',()=>{
 const yaml=readFileSync(new URL('../../.github/workflows/body-agent-approved-queue.yml',import.meta.url),'utf8');
 assert.match(yaml,/gh pr create --draft/);
 assert.doesNotMatch(yaml,/gh pr merge|supabase db push|wrangler deploy/);
 assert.match(yaml,/max-parallel: 1/);
 assert.match(yaml,/cancel-in-progress: false/);
});
