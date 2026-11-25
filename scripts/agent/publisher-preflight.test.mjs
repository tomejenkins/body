import test from 'node:test';
import assert from 'node:assert/strict';
import { validatePublisherRequest } from './publisher-preflight.mjs';

const valid = {
  repository: 'tomejenkins/body',
  base: 'main',
  baseSha: 'a'.repeat(40),
  issueNumber: 123,
  patchSha256: 'b'.repeat(64),
  draft: true,
  approvedBy: 'tomejenkins',
  authorization: 'manual-review-required',
  paths: ['src/components/Example.tsx'],
};
test('accepts manifest for review without publishing', () => {
  assert.equal(validatePublisherRequest(valid).acceptedForManualReview, true);
});
for (const [name, value] of [
  ['repository', 'someone/else'],
  ['base', 'staging'],
  ['baseSha', 'not-a-sha'],
  ['issueNumber', -1],
  ['patchSha256', 'missing'],
  ['draft', false],
  ['approvedBy', 'someone-else'],
  ['authorization', 'auto-merge'],
  ['paths', ['.github/workflows/unsafe.yml']],
]) {
  test('rejects unsafe ' + name, () => {
    assert.throws(() => validatePublisherRequest({ ...valid, [name]: value }), /Publisher blocked/);
  });
}
