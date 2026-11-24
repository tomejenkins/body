// Verify git's actual tracked/untracked state after unprivileged Codex work.
import { execFileSync } from 'node:child_process';
import { validatePatchPaths } from './pilot-policy.mjs';
import { writeFileSync } from 'node:fs';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8', timeout: 10000 });
const status = git('status', '--porcelain=v1', '-z').split('\0').filter(Boolean);
if (!status.length) throw Error('Codex made no changes');
if (status.length > 10) throw Error('More than 10 files changed');
const paths = [];
for (const entry of status) {
  const code = entry.slice(0, 2), path = entry.slice(3);
  if (code.includes('R') || code.includes('C') || code.includes('D') ||
      code.includes('U') || code === '??') throw Error('Renames, deletes, conflicts and untracked files prohibited');
  paths.push(path);
}
const check = validatePatchPaths(paths);
if (!check.allowed) throw Error(check.reason);
for (const path of paths) {
  const mode = git('ls-files', '-s', '--', path).trim().split(/\s+/)[0];
  if (mode !== '100644' && mode !== '100755') throw Error('Non-regular tracked file prohibited');
}
const patch = execFileSync('git', ['diff', '--binary', '--', ...paths], { maxBuffer: 300000 });
if (!patch.length || patch.length > 256000) throw Error('Invalid patch size');
if (!process.env.RUNNER_TEMP) throw Error('RUNNER_TEMP required');
writeFileSync(process.env.RUNNER_TEMP + '/body-agent.patch', patch, { flag: 'wx', mode: 0o600 });
console.log('Verified generated patch paths and size');
