# Movement matching and smart quick workouts

This correction starts from main `a4f1b99` (Phase 7.4). The two-screen Workout Home / focused Exercise Logger, source-slot Last Used eligibility, exact-exercise history/records, progression, effort, queues and concurrency protections remain authoritative.

## Compatibility and tile order

Primary target muscle is required for a compatibility grade. Primary pattern, compound/isolation/other type and supported movement intent determine 4 / 3 / 2 / 1. Exact has no visible quality label; the remaining labels are Close, Similar and Same Muscle. Equipment is neither a score nor a tie-breaker. Saved equipment only supplies Check equipment; the full-library equipment checkbox explicitly filters. It never implies a current location.

For flat pressing, barbell/dumbbell/matching machine presses are Exact. Floor pressing is Close for reduced range; close-grip pressing is Close for shifted emphasis. Dips and incline push-ups change the pressing path and are Similar; incline pressing is Similar; a chest fly is Same Muscle. These broad estimates do not promise identical biomechanics. Private exercises retain their declared taxonomy; a matching name/slug cannot impersonate curated system mechanics.

Program Pick stays first, qualifying exact-slot Last Used second if different, then descending grade with stable slug/ID ties. No lower grade is injected just to represent every category. Selected exercises remain in the bounded pool without being upgraded. Last Used has a subtle theme-green outline/context; selected state has a separate foreground outline and selected surface. Initial restoration may reveal an already selected tile, but subsequent selection-state updates do not scroll the carousel. See All remains inline with independent search, pattern, muscle, type and equipment filters; outside-target choices say Changes muscle focus.

## Shared intent metadata

`src/features/exercises/movement-intents.json` refines existing primary pattern/muscle/type classifications. It adds no movement-pattern IDs, exercise UUID identities or equipment grades. Explicit system slugs describe important angle, range, grip, arm-position and joint-action distinctions within one pattern. Ordinary taxonomy suffices for broader intents. The same definitions support matching, generation and a protected immutable SQL registry; the consistency tests verify every slug against the 183-exercise source catalog and the migration's exact registry. Archived, duration and assistance entries cannot supply generated coverage.

The published catalog and all earlier migrations remain unchanged. Future shared metadata changes require a new forward registry migration; never regenerate the deployed edition-1 SQL.

## Setup and deterministic recipes

Primary Focus is required for generation: Chest, Back, Legs, Shoulders, Biceps, Triceps or Core. Secondary Focus is optional and cannot equal the primary. Emphasis defaults to Balanced, resets on primary change, and applies only to the primary. The server calculates preview counts using the same catalog/recipe as the start action; only emphasis options that actually change a supported shell are shown. Start Blank independently creates no slots or exercises.

The ordered definitions live in `quick-focus.ts`; the generator first takes available emphasis intents, then balanced complements, deduplicating intent keys. It never randomly chooses an exercise, prescribes universal weights or manufactures actual performance. Missing coverage produces fewer useful slots. Within one pattern, curls vary grip/arm position, extensions vary upper-arm position, and calves vary knee position. No invented region isolation or filler names are used.

| Focus                        | Alone | With secondary                                               |
| ---------------------------- | ----- | ------------------------------------------------------------ |
| Chest, Back, Legs, Shoulders | 4     | 3 primary + 2 secondary                                      |
| Biceps, Triceps, Core        | 3     | 2 + 2 when both are small; otherwise 3 primary + 2 secondary |

Automatic shells are capped at six; manual additions retain the existing limit and may exceed six. Each slot receives three working sets, compounds 8–12 reps or isolations 10–15 reps. Actual exercises/loads/effort remain unselected and exact-exercise history remains the only performance source.

Balanced chest uses flat press, incline press, flat fly and a differentiated incline/low-to-high fly. Balanced back uses vertical pull, row, straight-arm pull and upper-back row/face pull. Balanced legs use squat, hinge, unilateral movement and knee flexion. Shoulders cover press, side raise, rear-delt fly and front raise. Biceps use standard, hammer/neutral and behind-body curl; triceps use pushdown, overhead and lying extension.

Emphasis examples: hamstrings start hinge/curl; quads start squat/unilateral/extension before hinge; glutes start bridge/hinge; calves start straight-/bent-knee raises before squat/hinge; upper chest starts incline pressing and incline/low-to-high fly; lats start vertical pull and underhand/elbow-to-hip row. Other emphasis options reorder supported complementary intents. Rear-delt emphasis uses both fly and face-pull intents. Where the catalog only supports one meaningful intent (for example shrugs for traps or side-delt isolation), the recipe uses that intent first and then broader complements, without promising two distinct regional isolation movements. Core uses repetition-loggable trunk curl, reverse crunch and rotation; timed planks remain unsupported.

## Persistence, security and rollout

The one new forward migration adds the immutable `suggested_intent` INSERT input and includes it in database-derived ad-hoc snapshots. It permits 1–6 initial slots and distinct intents under the same pattern, replacing the old two-pattern/two-muscle bounds. Duplicate intents, broad/narrow duplicates of the same pattern/muscle, unsupported metadata and changed retry payloads are rejected. Start locking/retry/expiry behavior, owner RLS, protected snapshots, programme immutability and recorded-set preservation use the existing invoker path. No new table, privileged bypass, writable performance field or cross-exercise record identity is introduced. Old snapshots are untouched and generic manual/legacy movements still work.

Apply `20261106163951_movement_intent_shells.sql` through the approved migration process before rolling out the app. No new dependency, secret, runtime binding or hosted configuration is required. Supabase hosted data, deployments and merges are outside this change. Executed results and review screenshots are recorded in the [validation document](movement-matching-validation.md).

Last Used continues to mean qualifying completed performance for an exact saved slot. Newly generated ad-hoc slots have per-session identities; this change does not invent a cross-session preference history for them. Custom exercises without curated intent metadata get conservative intent-specific grades and remain available through the full library. Physical iOS/Safari and real-device ergonomics require separate verification.
