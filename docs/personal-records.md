# Personal Records

Phase 6.2 derives records from canonical completed performance through owner-scoped SECURITY INVOKER SQL. No editable PR table, runtime backfill, external service or privileged key exists. Historical performance contributes to current bests; it never produces unsolicited backfill celebrations.

## Eligibility

The source `record_performances` requires auth.uid() ownership, a completed session, a nonremoved selection, a completed nondeleted confirmed set, actual positive integer reps (1–1000), completed_at and a supported logging snapshot. Warm-ups, pending suggestions, unconfirmed actuals, abandoned sessions, assistance/duration snapshots and zero/nonfinite/nonpositive external loads are excluded. All nonwarmup working types (working/drop/rest_pause) qualify for actual strength, rep and volume metrics. Epley uses normal working sets only.

Legacy rows qualify conservatively: known system compound/isolation exercises with supported loaded measurement, or explicit unweighted bodyweight. Ambiguous legacy custom or positive added-bodyweight measurements are excluded. Modern supported custom exercises remain eligible, including archived private exercises. Variations retain exact exercise IDs; families never pool records. Record eligibility is independent of prominence.

## Categories and calculations

| Metric                    | Calculation                                                                                                                                     |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| **Actual 1/3/5RM**        | Highest eligible canonical load for **exactly** 1/3/5 actual reps, respectively                                                                 |
| Heaviest Lift             | Highest eligible external load for any positive valid rep count                                                                                 |
| Estimated 1RM             | Normal working loaded dynamic compound/isolation sets: single = actual load; reps 2–10: Epley `kg × (30 + reps) / 30`, rounded once to 0.001 kg |
| Most Reps at This Load    | Highest completed reps at the same canonical 0.001-kg load, separately per measurement category                                                 |
| Best Session Volume       | Sum of eligible external kg × actual reps for the same exercise/session/category; excludes warm-ups                                             |
| Most Bodyweight Reps      | Highest actual reps in one explicit unloaded bodyweight set                                                                                     |
| Heaviest Added Resistance | Highest explicitly added positive external load, with completed actual reps                                                                     |

**Exact-repetition rule is absolute.** A 235 lb × 5 set cannot raise Actual 3RM, even above a lower three-rep best. It can affect Actual 5RM, Heaviest Lift and a separately labeled Estimated 1RM. Missing exact-rep records are omitted, never extrapolated, inferred or substituted. MVP summaries show actual 1/3/5 only; the query engine also supports bounded optional exact-rep keys such as 8. No qualifying single means no Actual 1RM.

Bodyweight reps, added resistance and ordinary loaded performance are separate categories. No assumed body mass, assistance inversion or fabricated external volume. Added-load volume counts only external resistance, not total lifted load. Epley excludes added-bodyweight-only measurement. A machine's stack load is a recorded input, not a claim of biomechanical equivalence to free weights.

Canonical numeric kilograms (existing storage precision) determine identity and comparisons. Original entered load/unit metadata is retained when it matches display preference (including exact practical 50-lb inputs). Alternate-unit rounding is presentation only. Equal canonical loads share a rep bucket. Current-best ties choose earliest actual set completion, then stable set/session IDs. Administrative session finish time never orders lift achievements.

## Read models, history and correction

`record_metrics` derives per-session maxima and external volume. `personal_records` chooses all-time winners for a bounded exercise page; `record_load_bests` keyset-pages comparable loads. `/history/records` makes bounded featured and other-record queries; Look Back adds the same exercise-specific summaries and load-page records. No browser downloads lifetime sets. SQL may scan the owner's relevant history; beta-scale query performance should be monitored before adding a cache. Any future aggregation cache must remain reproducible from actual performance.

Old completed sessions contribute to bests but have recognition_enabled=false. Only a newly completed authenticated lifecycle transition enables recognition. `workout_achievements` compares target per-session metrics with strictly earlier eligible performance using actual performed_at plus stable session IDs. First performances establish baselines; ties do not improve; abandoning never recognizes. Repeated finish/read requests return stable derived results without duplicate persisted events. Review displays the same achievements as postfinish. A bounded batch count RPC summarizes up to three distinct qualifying exercises for history pages.

Owner-authorized future corrections or tombstones recompute current bests and historical improvement candidates from source, rather than leaving stale record rows. The current phase does not grant unrestricted historical correction. Catalog corrections can affect support/classification for conservative legacy eligibility; review such changes explicitly. No deleted source is silently replaced with suggested performance.

## Presentation and ranking

Featured lifts use existing recordProfile UUID metadata: Barbell bench press, Barbell back squat, Conventional deadlift. Other exercises remain searchable and paginated; secondary prominence influences ordering, not eligibility. Internal primary/secondary/standard labels never appear in product UI. Actual 1/3/5 are prioritized; Estimated 1RM is distinctly labeled. Look Back exposes per-load reps without crowding summary cards.

Postfinish/review show at most three strict improvements, at most one per exercise for diversity. Deterministic score = metric weight + `min(relative percentage improvement,100) × 0.5` + prominence bonus (10 primary, 5 secondary, 0 standard). Metric weights: heaviest/added/bodyweight reps 40, actual RM 35, reps-at-load 30, estimated 1RM 25, session volume 20. Stable exercise/metric/category/load-key ties break equally scored candidates. Any exercise can win a slot; a sufficiently large standard-exercise improvement can outrank featured lifts. This is quiet static recognition, not repeated animated celebrations or invented milestones.

## Validation and deployment

Local pgTAP tests cover exact 1/3/5/8, absent records, the heavier-five/actual-three regression, Epley/single/range, source exclusions, volume, bodyweight/added separation, canonical unit buckets, variant isolation, baselines/ties, correction recomputation and foreign-user denials. Unit tests cover exact math, labels, units and diverse stable ranking. Browser tests cover empty/featured/nonfeatured records, genuine postfinish achievements, refresh stability and Look Back on both local runtimes.

Apply the two forward Phase 6.2 migrations in timestamp order only through the reviewed project migration workflow before deploying app code that calls these RPCs. No hosted migration, SQL, history repair or production deployment is part of validation. Phase 6.3 charts, programs, timers, assistance/time tracking and offline sync remain out of scope.

Set completion timestamps are also server-assigned by the logging trigger. Existing narrow invoker column grants are retained, but submitted completion times are ignored: first completion uses database time, completed corrections keep the original event time, and pending sets clear it. Privileged historical imports remain distinct from ordinary authenticated writes.

## Phase 6.3 refinement

User-facing exact-rep names are now Best Single, Best Triple and Best Five-Rep Set, without claiming maximal effort. Exact actual_rm keys and values remain unchanged. [Intelligent recognition](intelligent-pr-recognition.md) separates historical dominance suppression from performance truth and adds deterministic category diversity. Record rows show source date/workout and actual rep context; estimate rows identify their source set. [Progress analytics](progress-analytics.md) reuses the shared metric source for bounded date-filtered charts, never chart-sampled personal bests.
