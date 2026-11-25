// Trusted change verification. Run only from a copy made BEFORE Codex executes.
// The publisher runs this from a fresh checkout, never from the patch artifact.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { validatePatchPaths } from './pilot-policy.mjs';

const git = (...args) => execFileSync('git', args, {
  encoding: 'buffer', timeout: 10000, maxBuffer: 1024 * 1024,
});
const entries = (args) => git(...args).toString('utf8').split('\0').filter(Boolean);
const mode = process.argv[2];
if (!['generate', 'publish'].includes(mode)) throw Error('Expected generate or publish');
const changed = entries(mode === 'generate'
  ? ['diff', '--name-status', '-z', 'HEAD']
  : ['diff', '--cached', '--name-status', '-z', 'HEAD']);
const paths = [];
for (let i = 0; i < changed.length; i += 2) {
  const status = changed[i], path = changed[i + 1];
  if (status !== 'M' || !path) throw Error('Only modifications to existing tracked files allowed');
  paths.push(path);
}
if (paths.length < 1 || paths.length > 10 || new Set(paths).size !== paths.length) {
  throw Error('Expected 1–10 unique modified files');
}
const result = validatePatchPaths(paths);
if (!result.allowed) throw Error(result.reason);
if (mode === 'generate') {
  const untracked = entries(['ls-files', '--others', '--exclude-standard', '-z']);
  if (untracked.length) throw Error('Untracked files prohibited');
}
for (const path of paths) {
  const index = git('ls-files', '-s', '-z', '--', path).toString('utf8');
  if (!/^100644 [0-9a-f]{40} 0\t[^\0]+\0$/.test(index)) {
    throw Error('Only regular, non-executable tracked files allowed');
  }
  const base = git('ls-tree', 'HEAD', '--', path).toString('utf8');
  if (!/^100644 blob [0-9a-f]{40}\t/.test(base)) {
    throw Error('Base file must be regular, non-executable');
  }
}
if (mode === 'generate') {
  if (!process.env.RUNNER_TEMP) throw Error('RUNNER_TEMP required');
  const patch = git('diff', '--binary', 'HEAD', '--', ...paths);
  if (!patch.length || patch.length > 256 * 1024) throw Error('Invalid patch size');
  writeFileSync(process.env.RUNNER_TEMP + '/body-agent.patch', patch, { flag: 'wx', mode: 0o600 });
} else {
  const unstaged = git('diff', '--name-only', '-z').length;
  if (unstaged) throw Error('Unexpected unstaged changes');
}
console.log('Verified actual git changes: ' + paths.length + ' regular files');
