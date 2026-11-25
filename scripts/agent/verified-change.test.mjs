import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const guard = fileURLToPath(new URL('./verified-change.mjs', import.meta.url));
function fixture(run) {
  const dir = mkdtempSync(join(tmpdir(), 'body-agent-guard-'));
  const work = join(dir, 'repo');
  mkdirSync(work);
  const git = (...args) => execFileSync('git', args, { cwd: work, stdio: 'pipe' });
  git('init', '-q'); git('config', 'user.name', 'Test'); git('config', 'user.email', 'test@example.com');
  mkdirSync(join(work, 'src'));
  writeFileSync(join(work, 'src', 'demo.ts'), 'export const n = 1;\n');
  git('add', '.'); git('commit', '-qm', 'initial');
  const invoke = (mode) => spawnSync(process.execPath, [guard, mode], {
    cwd: work, encoding: 'utf8', env: { ...process.env, RUNNER_TEMP: dir },
  });
  try { run({ dir, work, git, invoke }); } finally { rmSync(dir, { recursive: true, force: true }); }
}
test('generate includes staged and unstaged edits in patch', () => fixture(({ work, git, invoke, dir }) => {
  writeFileSync(join(work, 'src', 'demo.ts'), 'export const n = 2;\n');
  git('add', '.');
  writeFileSync(join(work, 'src', 'demo.ts'), 'export const n = 3;\n');
  const result = invoke('generate');
  assert.equal(result.status, 0, result.stderr);
  assert.match(readFileSync(join(dir, 'body-agent.patch'), 'utf8'), /\+export const n = 3;/);
}));
test('rejects changes to protected files', () => fixture(({ work, git, invoke }) => {
  mkdirSync(join(work, '.github'));
  writeFileSync(join(work, '.github', 'target'), 'old\n');
  git('add', '.'); git('commit', '-qm', 'add protected file');
  writeFileSync(join(work, '.github', 'target'), 'new\n');
  assert.notEqual(invoke('generate').status, 0);
}));
test('publisher rejects staged protected file even with benign header claims', () => fixture(({ work, git, invoke }) => {
  mkdirSync(join(work, '.github'));
  writeFileSync(join(work, '.github', 'target'), 'old\n');
  git('add', '.'); git('commit', '-qm', 'add protected file');
  writeFileSync(join(work, '.github', 'target'), 'new\n');
  git('add', '.');
  assert.notEqual(invoke('publish').status, 0);
}));
test('publisher accepts ordinary staged source modification', () => fixture(({ work, git, invoke }) => {
  writeFileSync(join(work, 'src', 'demo.ts'), 'export const n = 4;\n');
  git('add', '.');
  const result = invoke('publish');
  assert.equal(result.status, 0, result.stderr);
}));
test('rejects untracked generated files', () => fixture(({ work, invoke }) => {
  writeFileSync(join(work, 'src', 'demo.ts'), 'export const n = 2;\n');
  writeFileSync(join(work, 'src', 'extra.ts'), 'extra\n');
  assert.notEqual(invoke('generate').status, 0);
}));
