# Phase 7.2 validation and release

Base: merged main at `3d1d57f` (Phase 7.1 / PR #14). Branch: `feat/phase-7-2-program-library`.

## Implemented

Twelve original Body programs, 46 training days and 205 movement slots, using the existing exercise taxonomy and normalized program foundation. Read-only card discovery/detail routes, six combined filter facets plus search, six-card pagination, controlled original covers/fallback, restricted prose rendering, initial-publication New badge, explicit planned-effort labels and no fake activation.

The two forward migrations are:

1. `20261105194445_program_library.sql`: non-login platform principal while preserving person auth FKs/cascades; four media/tag/gallery tables; rich metadata, protected publication pointers/timestamps and version projections; owner-safe approved official reads; invoker query/serialization/clone extensions.
2. `20261105194446_body_program_catalog.sql`: reviewed deterministic version-1 originals, generated from programs.json and the migration-only loader source under supabase/catalog. No actual workouts or personal auth accounts are seeded.

Previously applied migrations remain untouched. No dependencies, secrets, environment variables, Cloudflare configuration or deployment mechanisms were added. package.json adds only programs:check. See [program library](program-library.md) for the complete program list, methodology, schema boundaries, performance and known limitations.

## Executed local checks

All database and browser fixtures target the disposable local Supabase Docker stack. No hosted schema, accounts or settings were changed.

- Fresh local migration replay: passed.
- Database lint, public/body_private with warnings treated as failure: passed, no issues.
- pgTAP: 1,634 assertions across 13 files passed.
- ESLint: passed.
- Strict TypeScript: passed.
- Vitest: 173 tests across 38 files passed.
- Exercise consistency: passed, 183 canonical exercises.
- Program consistency: passed, 12 programs / 46 training days / 205 slots.
- Formatting: passed.
- Next.js production build: passed.

- Playwright against the Next.js production runtime: 60 desktop/mobile checks passed.

- OpenNext / Cloudflare build: passed.
- Wrangler no-upload dry-run: passed.
- Playwright against the local Worker runtime: 60 desktop/mobile checks passed.

All requested local checks completed; none were blocked by Docker or missing credentials. Existing build/preview warnings include the middleware convention deprecation, managed proxy notice and local Request.cf metadata fallback; these did not block validation. Hosted deployment/database state was not verified.

Tests inspect actual prescriptions, default/substitution taxonomy and equipment compatibility, beginner volume/failure restrictions, deterministic replay, immutable versions/projections, private/copy/gallery boundaries, publication/clock/privilege controls, unverified/anonymous denial, safe prose/media rendering, individual/combined filters, pagination/reset, light/dark and mobile layouts. Existing logging, continuity, exact-rep PR, analytics and navigation regressions are retained.

Validation caught and fixed an initial missing-UID catalog RLS edge case, installer lint warnings and Reset Filters retaining uncontrolled form values. New browser selectors now use accessible combobox names and wait for navigation state. No failing tests were removed.

## Review and manual release

1. Review both migrations, original program content, the platform-principal change and publication read boundary. Use normal backup/release safeguards.
2. Keep preview database automation disabled for this branch (the owner previously confirmed repository-wide disablement). No second deployment mechanism is introduced.
3. Apply metadata/security first, seed second, through the single approved migration path, only after separate hosted approval. Do not regenerate these migration files once shared/deployed. New content needs a new forward version.
4. Deploy the app only after both migrations succeed. No new environment keys are needed; preserve Cloudflare dashboard variables and keep_vars.
5. In staging, confirm twelve catalog entries across two pages, all filters/reset, read-only details, covers/fallback, owner isolation, and existing workout/effort logging. Verify migration history and database advisors after the separately approved rollout.
6. Physical Safari/iOS, real hosted Supabase/Workers behavior, production-scale query performance and professional program review remain separate verification. Local Chromium mobile emulation is not physical-device certification.

Program activation/editor/scheduling, automated progression, community publishing, creators, cardio and billing are intentionally deferred. Gallery references and deterministic guidance helpers are ready without upload/guidance UI. Popular/Trending/adoption/review statistics are absent. The Markdown subset and exact full-text search limitations are documented; no hosted capacity or personalized-results claim is made.

## GitHub handoff

If draft PR creation is blocked by the managed environment GitHub API policy, use [the feature comparison](https://github.com/tomejenkins/body/compare/main...feat/phase-7-2-program-library?expand=1) to create a draft against main. Branch publication and any exact API blocker are reported in the final handoff. Do not merge or deploy as part of validation.
