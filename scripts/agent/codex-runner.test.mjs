import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCodexArgs, executePilot } from './codex-runner.mjs';

test('uses noninteractive workspace-write CLI with structured events', () => {
  assert.deepEqual(buildCodexArgs({ model: 'gpt-test', promptFile: '-' }),
    ['exec', '--json', '--sandbox', 'workspace-write', '--model', 'gpt-test', '-']);
});
test('rejects injected model arguments', () => {
  assert.throws(() => buildCodexArgs({ model: 'x --danger', promptFile: '-' }));
});
test('rejects non-stdin prompts', () => {
  assert.throws(() => buildCodexArgs({ model: 'gpt-test', promptFile: '/tmp/untrusted' }));
});
test('never calls CLI without spending data', () => {
  let calls = 0;
  assert.throws(() => executePilot({ verifiedSpend: null, spawn: () => { calls++; } }));
  assert.equal(calls, 0);
});
test('never calls CLI even when caller fabricates apparently valid spending', () => {
  let calls = 0;
  const now = Date.now();
  assert.throws(() => executePilot({
    verifiedSpend: { recordedApiUsd: 0, pendingApiUsd: 0, estimatedRunUsd: 1, verifiedAt: now, now },
    spawn: () => { calls++; },
  }), /trusted spending adapter not implemented/);
  assert.equal(calls, 0);
});
