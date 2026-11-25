# Body agent: first manual run

The **Body Codex agent — approved issue to draft PR** workflow is manually dispatched from `main`. It does not schedule tasks, deploy Body, or merge code. The Codex run uses the `agent_pilot` environment and its `OPENAI_API_KEY` secret. The admin billing key is never used.

## Before first run

1. Review and merge PR #42 **only after** resolving any conflicts and confirming the normal checks. The launch workflow has not yet passed an end-to-end GitHub Actions test.
2. In **Settings → Actions → General**, allow GitHub Actions to create pull requests; keep the default `GITHUB_TOKEN` permissions read-only. The publisher job requests narrowly scoped write permissions.
3. Confirm the `agent_pilot` environment has `OPENAI_API_KEY`, required reviewers, no admin bypass, and deployment-branch restriction to `main`.
4. Confirm Cloudflare's GitHub integration does not deploy production from agent-created branches or this PR.
5. Review the OpenAI project's current costs and budget alert before each run. This pilot has **no guaranteed dollar hard cap**; the 20-minute timeout only limits runner duration. Do not launch if costs or limits are uncertain.

## Pilot

1. Create an issue **as tomejenkins**, with a clear, narrow, non-sensitive task and acceptance criteria. Assign it to `tomejenkins` and apply both `agent-ready` and `agent-approved` labels.
2. Open **Actions → Body Codex agent — approved issue to draft PR → Run workflow** on `main`. Enter the issue number.
3. Approve the pending `agent_pilot` environment request if the task and expected API spending are acceptable.
4. Watch the `generate` job (Codex + lint/typecheck/test/build) and `publish` job. On success, review the generated **draft PR**. Nothing is automatically merged.
5. Stop after one small pilot; check actual API billing and review the draft PR before another run.

## Restrictions

- One GitHub Actions workflow run at a time; no automatic retries.
- The issue must be open, owner-authored, owner-assigned and labeled twice.
- Agent GitHub token is read-only; the publisher has no OpenAI key.
- Agent patches are limited to 10 tracked files and 256 KiB, with protected infrastructure paths rejected.
- Changes to remote Supabase, Cloudflare or Stripe resources are prohibited.
- This is a best-effort software guardrail, **not** a guaranteed financial spending cap or proof of safe generated code. Human review is mandatory.
