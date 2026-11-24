// Codex runner entrypoint. Deliberately fail-closed until a trusted spending
// adapter is implemented and separately authorized. Never use issue text as
// shell arguments. No paid request is possible in the current configuration.
import { spawnSync } from 'node:child_process';
import { assessBudget } from './pilot-policy.mjs';

export function buildCodexArgs({ model, promptFile }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{1,79}$/.test(model)) {
    throw new Error('Model must be an explicit, validated identifier');
  }
  if (promptFile !== '-') throw new Error('Prompt must be supplied on stdin');
  return ['exec', '--json', '--sandbox', 'workspace-write', '--model', model, '-'];
}

export function executePilot({ verifiedSpend, prompt, model, spawn = spawnSync }) {
  const decision = assessBudget(verifiedSpend ?? {});
  if (!decision.allowed) throw new Error('Paid pilot blocked: ' + decision.reason);
  // A passing policy calculation is NOT authorization: the live adapter must
  // attest provenance and freshness. There is no such adapter in this PR.
  throw new Error('Paid pilot blocked: trusted spending adapter not implemented');
}

if (process.argv[1]?.endsWith('/codex-runner.mjs')) {
  try {
    executePilot({
      verifiedSpend: null,
      prompt: '',
      model: 'unconfigured',
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
