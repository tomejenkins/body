import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

function check(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'body-patch-'));
  try {
    const file = join(dir, 'change.patch');
    writeFileSync(file, contents);
    return spawnSync(process.execPath, ['scripts/agent/validate-patch.mjs', file], { encoding: 'utf8' });
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('accepts simple allowed path header', () => {
  assert.equal(check('diff --git a/src/demo.ts b/src/demo.ts\n').status, 0);
});
test('rejects workflow modifications', () => {
  assert.notEqual(check('diff --git a/.github/workflows/x.yml b/.github/workflows/x.yml\n').status, 0);
});
test('rejects path traversal', () => {
  assert.notEqual(check('diff --git a/src/../AGENTS.md b/src/../AGENTS.md\n').status, 0);
});
test('rejects renames', () => {
  assert.notEqual(check('diff --git a/src/old.ts b/src/new.ts\n').status, 0);
});
test('rejects empty patch', () => assert.notEqual(check('').status, 0));
test('rejects binary patch', () => {
  assert.notEqual(check('diff --git a/src/demo.ts b/src/demo.ts\nGIT binary patch\n').status, 0);
});
