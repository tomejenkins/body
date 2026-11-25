# Body Phase C3 — approved daily execution (feature-gated)

The scheduled Sunday and daily ChatGPT planners prepare proposals. Only a **GitHub-owner-authored `BODY-APPROVE v1` comment**, bound to a precise JSON plan and exact issue-body hashes, can trigger paid task execution. A non-owner, bot, replay, edited task or plan, old date, or unreserved task fails closed.

## Safeguard and setup sequence

1. Merge Phase C2 before C3, and ensure all Node policy tests and GitHub Actions YAML checks pass.
2. In OpenAI Platform, verify Body's **project spend limit is a hard limit** and the Codex API key is in that project. Confirm costs are available through `/v1/organization/costs` for the project. Cost reporting is delayed and reservations are deliberately conservative.
3. In GitHub, create the dedicated Actions environment `agent_daily` (distinct from the manual `agent_pilot` environment), restrict deployment branches to protected `main`, and configure its secrets `BODY_OPENAI_ADMIN_KEY` (a **separate OpenAI organization admin key**) and `OPENAI_API_KEY` (the Body Codex execution key). Do not reuse the keys for one another. After testing, leave `agent_daily` without required manual reviewers so the **owner GitHub plan approval is the single human checkpoint**; other environment protections and branch protection must remain enforced. The admin key is used only in trusted billing/preflight steps and never passed to Codex. The existing manual `agent_pilot` environment is unchanged.
4. Set GitHub repository/environment vars `BODY_OPENAI_PROJECT_ID=proj_...` and `BODY_AGENT_LEDGER_ISSUE=<number>`.
5. Create a dedicated GitHub issue labeled `agent-ledger`, leave it open. It is an audit-only claim ledger. Do not delete or edit its bot reservation comments. All costs remain conservatively reserved until the next UTC month even after actual spend appears in OpenAI usage; this can reduce available capacity but prevents undercounting.
6. Run the **Body agent - verify live OpenAI costs** workflow manually. Verify it returns the intended project and plausible USD spending before continuing.
7. Test the **Body agent - verify daily plan (dry run)** workflow with a real owner-approved plan, 1–3 selected tasks and alternatives. Confirm bad hash, missing issue, duplicate PR, stale date and missing approval are denied.
8. Keep `BODY_AGENT_UNATTENDED_ENABLED` unset until approved. Once all tests pass and the owner explicitly authorizes live execution, set repository var `BODY_OPENAI_HARD_LIMIT_CONFIRMED=true` and `BODY_AGENT_UNATTENDED_ENABLED=true`. Merely merging the workflow will **not** execute paid calls.

## Runtime behavior

- Owner adds one exact `BODY-APPROVE v1 sha256=<digest> issues=71,73` comment to an `agent-plan` issue. ChatGPT's daily briefing may help generate the digest and post the user-selected approval using the connected GitHub account.
- The issue-comment workflow runs only on protected `main`, only for the owner's newly created approval comment, and only when BOTH feature switches are enabled.
- It validates the exact plan and task issue bodies, eligibility and existing PRs; reads fresh project-scoped Costs API spending; and creates a **single** GitHub bot reservation for the whole queue before any Codex call.
- Daily limit: **at most 3 tasks and $3 estimated API spend**, monthly projected limit **$40**, one project-wide concurrent queue. Each task is revalidated with real billing evidence **immediately before** Codex.
- Tasks are generated in sequence (`max-parallel: 1`), with existing 1–10 tracked regular file and forbidden-path checks. App lint, typecheck, tests and production build must pass. Every patch is verified again in a separate publishing job. Overlapping files with any open PR are rejected.
- Successful tasks create **draft PRs only**. A failed task cannot silently broaden scope or automatically retry. One matrix task's validation failure does not instruct Codex to keep making paid calls. Review and merge remain manual.
- After a reservation, rerunning the workflow cannot allocate the same plan or issue again within the UTC month. Recovery of a failed paid task requires a NEW, explicitly owner-approved issue/plan after reviewing the claim; conservative reservation is not automatically refunded.

## Known limitations / required follow-up

- The OpenAI Costs API is bucketed by day and may report delayed usage; treat the project hard spend limit and reservation cap as complementary controls, not guarantees against small overages.
- Reservation ledger uses GitHub bot-authored issue comments and workflow-level `concurrency`, not a database; do not start another independent queue consumer or alter the concurrency group.
- The old manual `body-agent-launch.yml` remains available as a separately owner-dispatched pilot and has no live billing guard. Avoid simultaneous manual paid dispatch when relying on the queue's $40 projection; ideally retire or add the same guard to the old pilot after C3 validation.
- A missing patch artifact for one failed task stops its publish job; other independent task PRs can still be published.
- Automatic code-fix retries and integrated visual device/browser verification are deferred. No automatic merges, production deployment, hosted SQL or Stripe modifications are authorized.
- If costs API project filtering/grouping isn't supported for the organization, the workflow fails closed; do not bypass attribution checks.

## Emergency stop

Set `BODY_AGENT_UNATTENDED_ENABLED=false` or remove it and cancel any running GitHub Actions queue. Disabling new triggers does **not** automatically terminate a currently running workflow: cancel it explicitly. Revoking the Codex project key is the final emergency API stop.
