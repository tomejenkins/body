# Phase C — bounded autonomous execution bridge

Status: **Stage C1: preflight only.** This PR adds a read-only manual verification workflow, not an unattended execution engine.

## How to test C1

1. Create a real implementation issue containing a bounded task with acceptance tests; label `agent-proposed` and assign to `tomejenkins`.
2. Create an `agent-plan` issue with a JSON-only body matching the contract in `daily-plan-contract.md`. Each task includes the SHA-256 hash of its issue body. Use the current Pacific calendar day.
3. Add **one** owner-authored comment of the form `BODY-APPROVE v1 sha256=<plan-body-hash> issues=<comma-separated-issue-numbers>`.
4. Run `Body agent - verify daily plan (dry run)` manually on main and enter the plan issue number.
5. Observe which tasks pass eligibility checks. No Codex API calls, issue edits, dispatches or PRs are created.

## Required C2 work before any unattended paid run

- Read **real**, fresh project-scoped OpenAI API spending using a trusted billing identity. Never trust spending numbers supplied by issues, comments or user-supplied workflow inputs.
- Add a durable, atomic per-day/per-month reservation and completion ledger. Reserve for the full approved queue before the first paid execution; reconcile pending/running calls and delayed usage reporting.
- Design a single-writer queue and idempotency identifiers (plan ID + digest + task ID), with completed/failed/skipped states and no replay on workflow rerun; inspect PRs and active runs.
- Revalidate the exact owner approval, body digests, issue eligibility and spend evidence immediately before every task, not just at launch.
- Keep existing `body-agent-launch.yml` manual-only until its authorization model is safely extended. Existing code requires `workflow_dispatch`, `github.actor=tomejenkins`, and `agent-approved`/`agent-ready`; a bot-triggered call will fail.
- Never blindly copy `agent-proposed` to `agent-approved` to bypass the manual gate.
- Sequential execution, at most 3 tasks/day, maximum 1 retry per task for deterministic failures and zero unapproved scope expansion. Review independent PRs, avoid file overlap, stale base and unmet dependencies.
- Fail closed if verification, reservation or GitHub state is unavailable. No automatic merges, deployments, remote SQL, Stripe or billing changes.

The morning ChatGPT report remains a recommendation, not a paid execution credential. The owner approval comment on a plan issue is the eventual authorization source, and the queue must protect it against edits and replays.

## Validation

Run `node --test scripts/agent/daily-plan-policy.test.mjs scripts/agent/pilot-policy.test.mjs` and validate read-only workflow permissions. No OpenAI API key is referenced by C1.
