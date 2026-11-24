# Manual-only Codex pilot — implementation review

**Status: NOT ACTIVATED.** This separate draft PR is intentionally independent of foundation PR #41. Both workflows have `if: ${{ false }}`. There are no automatic triggers, paid API calls, deployment commands, remote database calls, or repository writes.

## What is implemented
- A Node 24, `npm ci` CI recipe with lint, typecheck, format, generated-catalog checks, Vitest and Next build.
- A single-worker manual workflow skeleton with 20-minute timeout, read-only permissions, an `agent_pilot` environment and no secret references.
- A fail-closed issue preflight requiring `main`, manual dispatch, a valid open issue, both `agent-approved` and `agent-ready` labels, an assigned human owner and the `approved-pilot` acknowledgement.
- Neither workflow is executable in its current form. There is **no Codex CLI execution or draft-PR creation yet**.

## Required before first paid pilot (separate approval and PR)
1. Verify environment `agent_pilot` exists, contains `OPENAI_API_KEY`, and requires reviewer approval; check the secret's *presence only*, never reveal its value.
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

## Codex CLI interface preparation (still disabled)

Official OpenAI documentation demonstrates noninteractive `codex exec --json --sandbox workspace-write` with a prompt supplied on standard input. The new `scripts/agent/codex-runner.mjs` validates this command shape and rejects all invocations, even if a caller supplies plausible spending numbers: there is no trusted billing adapter yet. The `codex-runner.test.mjs` tests assert that the CLI is never spawned. No model version or CLI package version has been pinned yet; the example model in tests is a placeholder, not a production model.

**Do not remove the unconditional block** or insert a CLI installation command until a reliable billing provenance check, executable sandbox isolation, model/version pinning and human activation review are complete. `OPENAI_API_KEY` must never enter untrusted pull-request jobs. A workflow timeout is not an API spending cap.

## Publisher review-only scaffold

A separate disabled `body-publisher-pilot.yml` workflow and `publisher-preflight.mjs` validate the *shape* of a proposed draft-PR manifest. This does **not** publish changes. Manifest fields such as `approvedBy`, `patchSha256`, and `paths` are **untrusted claims** until independently verified by a trusted publisher against GitHub identity, actual patch bytes, current base SHA, issue labels, and immutable workflow artifact provenance. A matching SHA-256 string in a JSON file is not verification of patch contents. The current patch-header validator is preliminary only, and cannot authorize patch application.

Before enabling a publisher: fetch the artifact by exact run ID from a trusted source, validate its digest against the actual bytes, parse/apply the patch in a disposable checkout, compare the resulting `git diff --name-status` and changed files to the policy, reject symlinks/submodules and unexpected changes, verify the initiating human's GitHub identity server-side, then use a separate least-privilege short-lived credential to push an issue branch and create a **draft-only** PR. Never execute untrusted artifact content in a write-privileged job.

There is no live spending-data adapter or active Codex invocation yet; activation remains blocked.

## Body billing project scope

The user-provided OpenAI project ID is pinned in `scripts/agent/budget-config.mjs` as `proj_O5giIELFflZ131F0wem4Xc10`. The Admin API key remains solely in the `agent_budget` environment and must not be committed or shared with the Codex execution job. The config and tests do not call OpenAI.

**Integration still required:** implement the trusted costs-fetcher using the organization Costs API, explicitly request project-scoped grouping/filtering and verify the actual response schema; handle pagination and reporting lag; verify pending reservations from an independently controlled ledger. The current parser assumes each result has a `project_id` and complete buckets; confirm these assumptions against real API responses before relying on it. The project's monthly $40 target is not a hard platform spending limit.

## Costs API client (not activated)

`scripts/agent/costs-client.mjs` constructs project-scoped, daily-bucket Costs API requests and supports pagination. Its tests use an injected mock fetch, never live credentials. **This is only a library**, not an operational billing gate: no workflow invokes it, and the admin secret is not referenced in code or workflows.

Before any live use, reconcile the Costs API's daily reporting semantics (including incomplete current-day data), test real response shape and pagination, and design an independently durable pending-run reservation ledger. The present `parseMonthlyCosts` assumes complete bucket coverage and should not be used to authorize paid runs until validated against actual billing response shape. The admin credential must only be accessible in a trusted isolated job, not in a checkout running project scripts or third-party dependencies. A $40 policy allowance is not a guaranteed hard cost cap.

The draft publisher and runner remain intentionally inert; human review and separate activation approval are required.
