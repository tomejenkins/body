# Body agent: daily planning and approval contract (Phase A)

This is a **policy-only** foundation. It does not create an unattended coding trigger, spend OpenAI credits, or grant permission to merge or deploy. The current manually dispatched Body agent workflow remains unchanged.

## Workflow

1. Sunday planning suggests a weekly backlog using owner feedback, the MVP roadmap, verified repo state and dependencies. Suggested implementation issues receive `agent-proposed`. Proposals are **not execution approvals**.
2. Each day at 6 AM Pacific, prepare up to three primary issues and up to five alternatives in a **JSON-only** GitHub issue with label `agent-plan`. Reuse existing proposals; do not duplicate issues. Include concrete acceptance criteria, dependencies, risk and a conservative API estimate in each task issue.
3. Owner selects 1–3 tasks and records one GitHub comment matching the approved plan's SHA-256 digest, with syntax:
   `BODY-APPROVE v1 sha256=<64 lowercase hex> issues=71,73`
   The digest is SHA-256 of the exact trimmed **plan issue body** (UTF-8). The approval must originate from the GitHub user `tomejenkins`, not an assistant message, email, label or bot comment. Any plan edit requires a new approval, with the prior approval removed to avoid ambiguity. Only selected issues—not the whole week's backlog—are approved.
4. Future execution automation must validate this policy **immediately before any paid call**, verify live GitHub issue/PR state, reserve the estimated budget atomically, and enforce one queue owner per issue. Failed or stale checks stop closed.
5. Proposed work produces **draft PRs only**. Owner approves merges separately. No automatic deployment, remote migrations, billing/auth changes, or unreviewed scope expansion.

## Plan body example

```json
{"version":1,"date":"2026-11-25","primary":[{"issue":71,"estimatedApiUsd":0.5},{"issue":72,"estimatedApiUsd":1}],"alternatives":[{"issue":73,"estimatedApiUsd":0.75}]}
```

The plan issue must be open and labeled `agent-plan`. Each referenced issue must be open, have nonempty implementation instructions, carry `agent-proposed`, lack `agent-blocked`, be assigned to the owner, and not already have an open PR. Owner is allowed to choose alternatives in place of the primary tasks.

## Limits and costs

- Daily: at most three selected issues and estimated API spend no greater than $3.
- Monthly: `pilot-policy.mjs` requires verified, fresh spend and pending commitments below the $40 API target (maximum age 15 minutes).
- Existing single-run estimated maximum: $5. These estimates are not invoice balances or hard guarantees.
- **Critical blocker for unattended mode:** The workflow currently has no verified OpenAI project spending source or durable reservation ledger. No scheduled paid execution may be enabled until a trusted spend connector, per-plan reservation, duplicate-run handling and retry limits have been implemented and tested. A GitHub label alone is not approval.

## Operational boundaries

Weekly and daily ChatGPT briefings may research, plan, and propose GitHub issues without paid coding. A briefing's interactive response is a review interface, not cryptographic authorization. The future GitHub queue must validate real owner-written GitHub approval against the exact issue body and verify the original issue is unchanged before each task.

Run contract tests with `node --test scripts/agent/daily-plan-policy.test.mjs`. These run without API keys, network, GitHub writes or database access. Phase B adds plan-generation quality and deduplication; Phase C adds vetted queue execution after a separate review.
