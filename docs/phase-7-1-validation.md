# Phase 7.1 validation and release notes

Base: main at `e809439` (merged Phase 6.3 / PR #13). Feature branch: `feat/phase-7-1-program-foundation`.

## Changes

- Two forward-only migrations: `20261105183319_advanced_set_effort.sql`, then `20261105183320_program_foundation.sql`. Previously applied migrations remain unchanged.
- Optional actual RPE/RIR, independent To Failure, owner-scoped effort preference, retained drafts/conflicts, and read-only historical summaries.
- Existing program/day/slot model extended with nonweekly rotations, validated choices/prescriptions/rules, immutable versions, transactional independent copies and protected future execution snapshots.
- Six owner-scoped foundation tables and six closed platform-only preparation tables. No program UI, scheduling, publishing, moderation or creator workflow is enabled.
- No dependencies, credentials, Wrangler configuration or deployment scripts changed.

See [advanced logging](advanced-set-logging.md) and [program architecture](program-architecture.md) for contracts and deferred behavior.

## Local validation

Validation uses only the disposable local Supabase Docker stack, synthetic accounts and loopback application runtimes. Browser tests reject nonlocal base URLs. No hosted schema or data was inspected or changed.

- Fresh local migration replay: passed.
- Database lint (`public,body_private`, fail on warnings): passed, no issues.
- pgTAP: 1,538 assertions across 12 files passed. Includes existing authentication, catalog, workout, PR and analytics security regressions.
- ESLint: passed.
- Vitest: 167 tests across 35 files passed.
- Catalog consistency: passed, 183 exercises.
- Formatting: passed.
- Strict TypeScript: passed.
- Next.js production build: passed.
- OpenNext / Cloudflare build: passed.
- Wrangler no-upload dry-run: passed; existing asset/self-reference bindings retained.
- Playwright against Next.js production runtime: 56 desktop/mobile checks passed.
- Playwright against local Cloudflare Worker runtime: 56 desktop/mobile checks passed.

The first browser runs exposed test synchronization/selector problems: the new Look Back assertion matched two lists, and the Worker recovery test opened native details before client restoration finished. Assertions now select the actual set list and wait for recovered state before interaction. No application behavior was changed to accommodate these tests. Final full runs passed in both runtimes.

Build/preview warnings include the existing middleware convention deprecation, the managed proxy notice and local Request.cf metadata fallback. These did not prevent local build/runtime checks.

## Release requirements and limitations

1. Review both migrations and take the normal database backup/release precautions. Apply in timestamp order only through the approved deployment mechanism, before rolling out this application build. No remote migration execution is authorized by this validation.
2. Keep Supabase preview migration automation disabled while evaluating this branch; the repository-wide disabled setting was confirmed by the project owner earlier in this session. No second migration deployment mechanism was added.
3. No new environment keys or public/secret credentials are required. Existing Cloudflare dashboard variables and `keep_vars` remain unchanged.
4. Verify effort preference, ordinary logging, refresh/recovery and historical summaries in staging after the separately approved database/app rollout.
5. Snapshot/clone domain operations are available for subsequent phases, without a program editor. Incomplete drafts cannot be versioned; unavailable/archived exercise choices must be resolved before versioning/copying. Public intent remains owner-only. Platform moderation/creator tables deliberately have no public workflow or ordinary grants.
6. Legacy sets remain NULL/false for effort/failure; there is no backfill inference. RIR 5 means 5 or more. No effort conversions, automated progression, actual-performance rewrite or PR rule changes occur.
7. Source deletion remains privileged and constrained by existing history FKs; normal users archive programs. Immutable snapshots/copy attribution and recorded workout history survive permitted source deletion.
8. Browser checks use Chromium desktop and mobile emulation with system light/dark preferences. Physical iOS/Safari and real hosted Supabase/Cloudflare behavior require separate staging verification.

## GitHub handoff

GitHub API preflight returned `Forbidden` for `https://api.github.com/repos/tomejenkins/body` in this managed environment. If draft PR creation remains blocked after the authorized branch push, use [the feature comparison](https://github.com/tomejenkins/body/compare/main...feat/phase-7-1-program-foundation?expand=1) to create a draft against main. Do not merge or deploy as part of this handoff.
