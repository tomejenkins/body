import test from 'node:test';
import assert from 'node:assert/strict';
import { BODY_OPENAI_PROJECT_ID, BODY_BUDGET_ENVIRONMENT, assertBodyProjectId } from './budget-config.mjs';

test('pins the intended Body project', () => {
  assert.equal(BODY_OPENAI_PROJECT_ID, 'proj_O5giIELFflZ131F0wem4Xc10');
  assert.equal(BODY_BUDGET_ENVIRONMENT, 'agent_budget');
  assert.equal(assertBodyProjectId(BODY_OPENAI_PROJECT_ID), BODY_OPENAI_PROJECT_ID);
});
test('fails closed for another project', () => {
  assert.throws(() => assertBodyProjectId('proj_other'), /project mismatch/);
});
test('fails closed for missing project', () => {
  assert.throws(() => assertBodyProjectId(undefined), /project mismatch/);
});
