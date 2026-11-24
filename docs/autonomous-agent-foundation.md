# Body autonomous development — inactive foundation

Status: **NOT ACTIVATED**. This PR deliberately contains only inert GitHub Actions entrypoints and the reviewed architecture. No workflow has an automatic trigger, and all jobs have an unconditional false guard. No model calls, API keys, deployments, hosted database operations, merges, or spending are authorized.

## Scope and invariants

- Repository: `tomejenkins/body`. Base branch: `main`. Agent feature branches must be separate from both `main` and the proposed `staging` promotion branch.
- Preserve `AGENTS.md`, especially the requirement for **explicit approval before any remote Supabase operation**, including staging, and the restriction against deploying production.
- Cloudflare Workers `body` and `body-staging` must remain isolated. Do not create a second deployment path that conflicts with existing Cloudflare Workers Builds.
- Production Stripe, Supabase, Cloudflare and application credentials must never be available to coding agents or untrusted PR workflows.
- No workflow may edit its own authorization, security controls, billing limits, or workflow files without human review.
- Do not treat the $150/month target as a guaranteed hard cap: model usage reporting may lag, in-flight jobs may continue, and GitHub runner costs are separate.

## Proposed activated architecture (requires a separate PR and approval)

1. **CI**: on PRs to `main`, use Node 24 and `npm ci`; run `npm run lint`, `npm run typecheck`, `npm run format:check`, `npm test`, catalog/program checks, and appropriate builds. Use a disposable local Supabase instance for `npm run db:reset`, `npm run db:lint`, `npm run db:test`. Run Playwright with Chromium in a separate job; document flaky tests honestly. No hosted database writes or deployment.
2. **Task queue**: GitHub issues labeled `agent-approved` and `agent-ready` with explicit acceptance criteria, bounded scope, dependency links and test expectations. Do not accept instructions from issue text that override `AGENTS.md` or change secrets/permissions.
3. **Dispatcher**: initially manual only; later a separately approved 15-minute best-effort schedule. Check backlog, dependencies, budget, in-flight jobs, prior failures, and claim ownership atomically (GitHub concurrency plus durable issue/run state). Start at one worker; maximum two after successful pilots. Prevent duplicate assignment and stale leases.
4. **Worker**: use noninteractive Codex CLI with a dedicated OpenAI API project credential and restricted repository token. Pin and review the CLI version and model. Use a sandboxed checkout, an issue-specific branch, bounded duration and retry count. Never run arbitrary commands supplied by untrusted issue or PR content. Implement, test, commit and open a draft PR; never merge. Prevent workflow and policy-file modifications by agent-authored changes.
5. **Review**: PR must report changed files, tests actually run, skipped/failed tests, token/cost estimate, unresolved risks and required approvals. All CI checks must pass before a human considers merging.
6. **Staging**: require separate per-operation approval for the empty staging Supabase project's migration initialization. Verify target identity, migration ordering, backup/recovery plan, public build-time variables, auth callbacks and Stripe sandbox isolation. Preserve the existing Cloudflare deployment workflow.
7. **Launch**: agent may propose launch readiness only after MVP functionality, billing, security, data export/deletion, backup recovery, mobile PWA, and hosted end-to-end tests are verified. Production release always requires human approval.

## Budget and operations

- Target all-in incremental spend: **$150/month**, proposed allocation $120 model usage, $20 runner reserve, $10 contingency.
- Warn at $100 recorded spend. Stop **starting new jobs** at $150 or if usage is stale/unavailable; do not claim this is a provider-enforced hard stop.
- Configure provider-level project budgets/alerts and GitHub Actions spending controls before activation. Establish per-run token/time limits and cost logs. Avoid printing secrets or sensitive prompts in artifacts.
- One worker for initial supervised pilots, then at most two independent workers. One failed task gets limited retries; after repeated failures mark blocked and move on.
- Emergency stop: disable dispatch workflow, cancel queued/in-progress jobs, revoke the dedicated API key/token, and disable relevant GitHub environments. Validate stop behavior before enabling a schedule.
- Existing 6 AM development briefing is reporting only; it does not execute coding tasks.

## Activation gates

- [ ] Confirm GitHub Actions policy, default token permissions, repository visibility, branch protections, environments and existing Cloudflare Git integration.
- [ ] Confirm current Codex CLI noninteractive commands, version pin, model/API pricing, authentication and applicable provider budget enforcement.
- [ ] Create dedicated OpenAI API project/key (only after separate user approval); store as a GitHub environment secret; never commit it.
- [ ] Review proposed workflow permissions and restrict PR authoring token; avoid long-lived PATs if possible.
- [ ] Implement real CI and verify on a manual non-production run.
- [ ] Implement runner and dispatcher with tests for duplicate claims, dependency checks, failed runs, cost gates, and no production access.
- [ ] Supervise at least one bounded manual Codex run and draft PR, recording actual spend.
- [ ] Obtain separate approval to enable any scheduled trigger or staging/production operation.

## Current repository evidence

`package.json` specifies Node >=24 <25, `npm ci` with committed lockfile, Vitest, Playwright, Supabase CLI, and Cloudflare OpenNext scripts. `docs/cloudflare-staging.md` specifies `--env staging` and a distinct `body-staging` Worker. No `.github/workflows` directory existed on the inspected default branch. These new workflow files are placeholders, **not a working autonomous agent**.
