// Read-only publisher preflight. It cannot push branches or open PRs.
// Publishing must run in a separate trusted workflow after explicit approval.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { validatePatchPaths } from './pilot-policy.mjs';

function reject(message) { throw new Error('Publisher blocked: ' + message); }
export function validatePublisherRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) reject('invalid request');
  if (request.repository !== 'tomejenkins/body') reject('wrong repository');
  if (request.base !== 'main') reject('base must be main');
  if (!Number.isSafeInteger(request.issueNumber) || request.issueNumber <= 0) reject('invalid issue');
  if (!/^[a-f0-9]{40}$/.test(request.baseSha ?? '')) reject('base SHA must be pinned');
  if (!/^[a-f0-9]{64}$/.test(request.patchSha256 ?? '')) reject('patch digest missing');
  if (request.draft !== true) reject('draft PR required');
  if (request.approvedBy !== 'tomejenkins') reject('owner approval required');
  if (request.authorization !== 'manual-review-required') reject('manual review required');
  const paths = validatePatchPaths(request.paths);
  if (!paths.allowed) reject(paths.reason);
  return { acceptedForManualReview: true, issueNumber: request.issueNumber, files: request.paths.length };
}

if (process.argv[1]?.endsWith('/publisher-preflight.mjs')) {
  try {
    const filename = process.argv[2];
    if (!filename) reject('missing JSON manifest');
    const request = JSON.parse(readFileSync(filename, 'utf8'));
    console.log(JSON.stringify(validatePublisherRequest(request)));
    console.log('Read-only manifest check passed. No patch applied, branch pushed, or PR created.');
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
