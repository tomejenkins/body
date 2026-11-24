// Trusted, read-only validation of a proposed Codex patch. Does not apply or publish.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validatePatchPaths } from './pilot-policy.mjs';

function fail(message) { console.error(message); process.exit(1); }
const patchFile = process.argv[2];
if (!patchFile) fail('Usage: node validate-patch.mjs <patch-file>');
let patch;
try { patch = readFileSync(patchFile); } catch { fail('Patch file unavailable'); }
if (patch.length === 0 || patch.length > 256 * 1024) fail('Patch empty or larger than 256 KiB');
const text = patch.toString('utf8');
if (Buffer.from(text, 'utf8').compare(patch) !== 0) fail('Patch must be valid UTF-8');
const paths = [];
for (const line of text.split('\n')) {
  if (!line.startsWith('diff --git ')) continue;
  const match = /^diff --git a\/([^\s]+) b\/([^\s]+)$/.exec(line);
  if (!match || match[1] !== match[2]) fail('Renames, spaces in paths, and malformed headers are not supported');
  paths.push(match[1]);
}
if (paths.length === 0 || paths.length > 10) fail('Patch must change 1–10 files');
const result = validatePatchPaths(paths);
if (!result.allowed) fail(result.reason);
if (/^(?:GIT binary patch|Binary files )/m.test(text)) fail('Binary patches prohibited');
console.log('Patch paths passed preliminary checks; this does NOT authorize applying or publishing.');
