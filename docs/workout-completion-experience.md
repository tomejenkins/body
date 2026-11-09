# Workout Complete — Phase 7.5D

## Preflight and routing

Base main `93c3728` includes merged PR #25. Review covered AGENTS.md, finish actions/RPC transaction semantics, controls, old post-finish route, history review/permissions, record eligibility and prominence, continuity/manual pause, program outcomes/progression/adherence, Favorite snapshots/deduplication, calendar invalidation and retained tests.

The plan adds an owned completion route, composes established sources, exposes additional achievements without changing featured ranking, preserves partial-program semantics and Favorite identity, then validates actual closure, repeat visits, privacy and mobile presentation. It does not duplicate History or create another performance/progression engine.

`endWorkout` still calls the existing `end_workout` RPC. A successful completed-session receipt redirects to `/workout/[id]/complete`; abandonment retains the existing outcome route. Closure remains transactional, owner-scoped and idempotent in SQL. The action validates the returned session identity before confirming success, then invalidates Dashboard, Programs, Workout, History and exercise/record views through existing paths.

The new route validates the UUID, loads the owned actual session and gates on persisted status. Active sessions redirect to Workout Home; abandoned sessions redirect to their existing History review; missing/foreign resources use not-found. A valid old `/workout?message=completed&finished=…` bookmark redirects to this same verification path. No query parameter supplies statistics or proves completion. History provides a Workout Summary link for later review.

Closure unmounts the active logger and restores the ordinary app shell/bottom navigation. Done returns to Dashboard, without starting another session. View Full Workout opens the exact existing History detail, including its saved sets and draft-review facilities. Completion does not apply or discard local drafts.

## Authoritative summary and statistics

The server-only loader composes one requested-session `loadWorkout`, `workout_training_summary`, `workout_achievements`, program outcomes/progression where applicable, and one bounded owner Favorite metadata read. No exercise-library load, per-exercise record requests, raw lifetime-history transfer or new metric storage is introduced. Individual saved-set details remain server-side; the concise page renders facts and links to History rather than duplicating its tables.

The narrow forward migration `20261109224811_workout_completion_summary.sql` adds an authenticated invoker read helper for at most 51 requested UUIDs. It selects only owned completed sessions and aggregates existing `performance_source` eligibility, with a target-session timestamp window and exact session membership. Foreign/missing/active/abandoned IDs produce no completed-summary row. Empty completed sessions produce honest zero counts. No owner argument, privileged bypass, mutation or new table is used.

- **Working sets:** eligible confirmed positive-repetition non-warm-up actual performance, excluding removed/deleted/unconfirmed/pending/unsupported evidence under the existing source. Loaded/added resistance retains its established valid positive canonical-load bounds; supported bodyweight performance does not require invented body mass or volume.
- **Exercises performed:** distinct actual exercise selections containing at least one qualifying working set, not unselected movement slots or distinct canonical IDs. Deliberately repeated selections of one canonical exercise count separately.
- **Duration:** existing `qualifiedDuration`, including authoritative manual-pause exclusions, continuity effective endpoints, estimated classification and legacy elapsed labeling. Unknown duration is unavailable, never inferred from wall time. The page shortens “Less than a minute” to “<1 min” for display only.

No optional combined-volume metric is introduced. Strength metrics do not mix assisted, duration, added-load and bodyweight measurements. Unsupported legacy timed/assisted entries remain in History with a clear note and strength-specific summary labels; this phase adds no cardio logging or PR type.

The migration also batches the same helper into closed `workout_history` working-set totals. History, Dashboard recent training and completion therefore agree, including after eligible evidence corrections. Existing selected-exercise counts remain labeled **exercises selected**, distinct from performed selections. History's broader saved-status count is explicitly **total completed sets**, with warm-ups/pending values kept separate. Active/abandoned history behavior remains unchanged. Historical counts can correctly decrease where raw completed rows previously included nonqualifying zero-rep evidence; saved measurements are not rewritten.

## Records and achievements

The existing SQL `workout_achievements` remains the source of genuinely improved records. `selectAchievements` retains its exact scoring, lift prominence, category diversity, tie-breaking and three-featured-exercise behavior. A shared `rankedAchievements` exposes the existing ordering for remaining candidates without inventing records or dropping them behind the featured cap.

Default completion renders at most three cards. View All Achievements requests `?achievements=all` on the same private route and renders additional earned records on demand. The query changes presentation only. It neither records a new achievement nor recloses the session.

Cards reuse `metricLabel` and `formattedMetric`, including original entered-unit precision. Actual strength results include their recorded repetition count. Best Single/Triple/Five-Rep Set remain exact-repetition observations; a heavier five does not become a true triple. Estimated 1RM remains explicitly estimated. Volume categories retain their engine-defined units and separation. Hidden prominence tiers never appear as product labels. First-use baselines, dominated performance and no-improvement sessions retain existing recognition rules; no artificial achievement or attendance award is created.

A no-PR session still confirms saving. Empty sessions do not claim training improvement. Later visits show the same session's earned facts under current eligible evidence, without notifications, duplicate records or repeated schedule advancement.

## Program work and Next time

`loadProgramOutcomes` supplies prescribed/completed sets and movement outcomes. Persisted partial sessions are clearly labeled Partial Workout, and the actual completed/prescribed movement/set counts remain distinct from total recorded work. Missing work is never manufactured.

The existing progression evidence/calculation supplies Next time suggestions. The same extracted presentation selector prioritizes at most three items in both History and completion; it does not recompute the progression algorithm. Unsupported kinds stay excluded, sparse evidence produces no invented increase, and suggestions never write future actual loads or sets.

Finishing a partial session is not accepting its program position. A secondary Review program schedule link opens the existing authorized decision disclosure at `/workout?decisions=program#schedule-decisions`. Existing current-cursor identity, confirmation, eligibility, locks and revisions still govern acceptance. Revisited accepted sessions remain truthfully partial history. No acceptance/skip/defer mutation occurs during completion rendering.

No next workout is guessed here. Done exposes the updated authoritative Dashboard/Programs recommendation after the existing finish invalidation. Nonweekly cycles and out-of-order identity remain under the shared scheduling engine.

## Favorite state

The page reuses the existing SaveFavorite form and validated save operation. Eligible program sources save the individual immutable day; meaningful completed independent workouts save a structural session template. Performed actuals and PR claims never become new completed sets. Saving cannot advance assignments or start training.

One owner-scoped read of at most 100 active Favorite summaries identifies a saved source by existing type/source key, or the real Favorite identity of a launched independent session. Already-saved sources display Saved as Favorite and link to management; the cap displays a useful message instead of a misleading save action. Empty/ineligible independent sources do not expose Save. Server deduplication, immutable snapshots, payload-bound retries and profile locks remain authoritative even when the visible state becomes stale on another device.

Save revalidation reloads the source state, so refresh/revisit does not create another shortcut. Favorite rename/archive never rewrites this session's frozen attribution. A deliberate later save can use the current eligible source according to existing restore/deduplication rules.

## Private future Feed contract

The only Feed affordance is a native disabled **Share to Feed · Coming Later** button. It has no form, handler, publication endpoint, notification or social write. Completion/PR processing remains private and independent of any future publishing step. No privacy settings, follower distribution or public workout URL is added.

Future Feed work must require explicit user initiation and a server-owned, permission-checked whitelist of approved title/statistics/selected achievements. This private loader and its full workout object are not a public sharing DTO. Notes, account fields, location, private history and source metadata must not be exposed automatically. Future Private/Semi-Private/Public settings require their own reviewed contract; they are not implemented here. Finishing and Done never depend on Feed interaction.

## Refresh, retention, ownership and rollout

The protected force-dynamic/no-store app and verified owner reads remain in force. Summary requests only read facts; no completion event, working set, Favorite or scheduled resolution is created by refresh, Back/Forward, expansion or direct review. Duplicate close requests reuse the existing transaction behavior. Browser Back cannot authorize reopening a closed logger; owner/session guards remain active.

Sessions are not user-deletable under current retention grants. Program/exercise/Favorite archival preserves owned frozen history according to existing policies. Removed/deleted evidence is excluded by the central performance source, and derived summaries/records recalculate rather than relying on copied counters. Permanently missing sessions are not reconstructed from Favorites or other history. Cross-owner IDs disclose no private content; Next.js may return a streamed not-found shell with HTTP 200 after streaming has begun, while underlying reads remain denied.

Apply the reviewed forward migration before the new app version. Earlier migrations are untouched. No hosted SQL, infrastructure change, automatic merge or deployment is part of delivery. Supabase preview disablement remains intact. Known limits include existing unsupported legacy measurement types and separate physical iOS/Safari/screen-reader and hosted-provider verification.

Actual checks, screenshots and rollout prerequisites: [phase-7-5d-validation.md](phase-7-5d-validation.md).
