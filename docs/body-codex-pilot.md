# Manual-only Codex pilot — implementation review

**Status: NOT ACTIVATED.** This separate draft PR is intentionally independent of foundation PR #41. Both workflows have `if: ${{ false }}`. There are no automatic triggers, paid API calls, deployment commands, remote database calls, or repository writes.

## What is implemented
- A Node 24, `npm ci` CI recipe with lint, typecheck, format, generated-catalog checks, Vitest and Next build.
- A single-worker manual workflow skeleton with 20-minute timeout, read-only permissions, an `agent-pilot` environment and no secret references.
- A fail-closed issue preflight requiring `main`, manual dispatch, a valid open issue, both `agent-approved` and `agent-ready` labels, an assigned human owner and the `approved-pilot` acknowledgement.
- Neither workflow is executable in its current form. There is **no Codex CLI execution or draft-PR creation yet**.

## Required before first paid pilot (separate approval and PR)
1. Verify environment `agent-pilot` exists, contains `OPENAI_API_KEY`, and requires reviewer approval; check the secret's *presence only*, never reveal its value.
2. Verify actual OpenAI API project budget and any hard-enforcement capability. The $50 all-in pilot target reserves $40 API, $7 runners and $3 contingency. Warn at $30 and stop launching new paid jobs at $40, or sooner if reporting is stale. Do not promise a guaranteed hard cap.
3. Implement a reliable **pre-run** budget check from a trusted billing source and a bounded worst-case per-run estimate. If the source is inaccessible, stop; do not trust issue text, an unverified environment variable or a manually typed spend number as proof.
4. Pin the Codex CLI version and supported model after checking official docs. Run noninteractive with workspace-write sandbox and no approval bypass; validate effective filesystem/network isolation and prevent agent writes to `.github/workflows`, `AGENTS.md`, and budget/security scripts.
5. Separate untrusted coding from a privileged PR publisher: the coding job has **read-only GitHub permissions** and produces a reviewed patch artifact; a separate tightly scoped trusted step may create a draft PR after validating changed paths. No agent-controlled content may execute with write credentials.
6. Record actual token usage, cost estimates, command/test results and output PR; redact sensitive information. Block duplicate issue claims, retries and concurrent workers.
7. Enable CI and manual pilot in separate reviewed commits. GitHub's manual dispatch UI normally requires workflow files on the default branch. Verify Cloudflare/Supabase integrations cannot deploy or migrate from these branches.
8. Never grant the pilot Supabase, Stripe or Cloudflare secrets. Never merge, deploy or alter remote databases automatically.

## Validation still outstanding
- YAML parse and GitHub Actions schema validation.
- CI execution on GitHub-hosted runners.
- Unit tests for preflight rejection cases.
- Real Codex CLI and cost-gate integration.
- End-to-end dry-run of draft-PR handoff.
- GitHub environment protection, Actions permissions and ruleset verification.

This PR is an **implementation scaffold and review artifact**, not a complete working agent. Do not remove the unconditional false guards as a shortcut.
