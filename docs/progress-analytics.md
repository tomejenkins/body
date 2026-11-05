# Progress analytics — Phase 6.3

History links to `/history/progress`; Personal Records links there too. Exercise Look Back (`/exercises/[id]/history`) embeds Progress above its existing records/history. Existing workout-builder query context and navigation helpers are preserved; chart selection changes local UI state, never rewrites builder URLs. No logging, program, OAuth, timer, social or offline-sync behavior is added.

## Source and eligibility

`performance_source` centralizes the existing Phase 6.2 eligibility contract; `record_performances` now delegates to it with no date limit. `performance_metrics` centralizes metrics, with `record_metrics` delegating without date limits. Existing callers and record identities are preserved. No applied migration was edited and no mutable analytics truth table or cache exists.

Eligible performance belongs to auth.uid(), a completed session, a nonremoved selection and a completed, confirmed, nondeleted actual set. Warm-ups, suggestions, active/abandoned sessions, zero reps/nonpositive external loads, assistance/duration and conservatively unsupported legacy measurements are excluded. Normal/drop/rest-pause sets qualify for actual working metrics; Estimated 1RM retains the normal-working-only Epley rule. Bodyweight NULL resistance, positive added resistance and ordinary external load stay separate. Archived own custom exercises remain readable.

## Exercise charts

Each series is scoped to one exact exercise ID and measurement category. Each actual session produces at most one point per selected metric/load/rep key:

- Heaviest Lift / Heaviest Added Resistance: maximum eligible actual external load.
- Best Single / Triple / Five-Rep Set (or another selected observed count): maximum load at exactly that rep count. These names describe recorded sets, not proven maximal effort.
- Estimated 1RM: maximum validated per-set Epley estimate, reps 1–10 only; single equals recorded load. No unweighted/added-only/assisted/duration estimates.
- Most Reps at This Load: best actual reps at the selected canonical 0.001-kg resistance and category.
- Best Session Volume: sum of eligible external kg × actual reps for that exercise/session/category.
- Most Bodyweight Reps: maximum actual unweighted reps, with no assumed body mass.

Only observed/applicable series appear. Comparable-load choices show up to 20 most-used loads in the selected period, tied by latest performance, category and load. Exact-rep choices show up to 12 observed counts, prioritizing 1/3/5 then frequency and count. These are approachable chart selectors; the preserved per-load record pagination and exact-record APIs retain the full truth, including less common loads/counts.

The x-axis uses actual set completion times; volume uses the latest eligible set time in its session. Sessions on the same calendar date stay distinct. Points select by touch/pointer or a keyboard-accessible slider; the detail links to that specific saved workout. Text summaries and an expandable table expose every plotted observation. SVG points have no animation or invented/interpolated sessions. A single observation says more data is needed; missing data is not a zero lift. Errors expose Retry, not a fabricated empty account.

Each series returns at most 180 actual observations. Up to 180 sessions remain untouched. Longer series split chronological ordinals into 178 buckets, retain each bucket's highest actual metric value (stable actual-time/session-ID tie break), and retain first/last observations, deduplicated. Counts disclose the full underlying session count. This is deterministic peak sampling, not a moving average or invented value. All-time records are computed independently over full eligible history, never a chart sample.

## Date ranges and local dates

Default is 90 days, with 30 days, 6 calendar months, 1 calendar year and All time. `progress_window` uses database statement time and a validated IANA timezone. It includes today: local `[until_day - range, tomorrow)` converted independently to UTC at each boundary, preserving DST. The browser supplies its current timezone after hydration, matching existing LocalTime behavior; no stored account timezone preference exists. An unavailable local timezone never authorizes a guessed private response.

Analytics membership uses the session's local start date, consistently with the calendar. A session crossing midnight belongs to its start day even if a chart's actual performance timestamp falls on the following day. All time intentionally scans full eligible owner history on the server. Civil-date weekly periods start Monday. Long overview ranges use deterministic multi-week bins, with the bin size disclosed, rather than downloading every session. Weekly volume chart points represent labeled aggregate periods, not fabricated workout timestamps.

## Activity and duration

Completed workouts means status=completed, including intentionally finished sessions with no completed sets. Such a session contributes a workout/day but zero working sets. Active and abandoned sessions do not count. Multiple completed sessions on one local start date contribute one training day. The calendar month has independent previous/next navigation and links a training day to its earliest completed workout; the saved history preserves all sessions on that day. No streaks, missed-day markers or obligations.

Recent frequency is completed workouts in the trailing 28 local days divided by four. Finite-range comparison uses the preceding equal number of civil days. Both periods need at least three completed workouts before a descriptive comparison appears; this is an explicit UI sufficiency heuristic, not a statistical-significance claim. All time has no invented preceding period.

The primary duration average requires completed status, duration_kind=elapsed, an effective endpoint, saved activity evidence, nonnegative interval and no structured idle gaps. Estimated, unknown, legacy and resumed/idle-inclusive durations are excluded and their counts disclosed. The normal-finish elapsed session average is not verified exercising time. Administrative close gaps never substitute for effective end; automatic abandonment cannot inflate the average. Missing reliable data shows Unavailable. There is no manual duration editing.

## Volume and muscle exposure

External volume uses PostgreSQL numeric arithmetic over canonical kg × actual reps, summed before display conversion. Storage is already quantized to 0.001 kg; converting a derived sum can differ slightly from summing original nominal pound entries. No floating-point accumulation determines record identity or volume. Display preference changes only formatting; it never rewrites loads. External volume is a training-load indicator, not total mechanical work, force or effort.

Overview volume is separated by exact exercise and measurement category. Up to 20 most-trained exercise choices are shown, tied by ID; every other exercise remains reachable through its own library Progress view. No universal machine/free-weight/bodyweight volume sum is shown. Unloaded bodyweight sets/reps are separate; weighted-bodyweight volume means additional external resistance only.

Weekly overall working-set counts count each eligible set once. Muscle exposure counts a set once for each listed primary muscle. Secondary involvement is counted separately, without a fabricated fractional hypertrophy model. Multiple primary muscles can therefore overlap; muscle rows must never be summed into the overall set count. Missing primary classification contributes Unclassified, including private custom exercises; secondary metadata is not guessed to be primary. Exposure is not a scientifically precise growth stimulus. Historical classification corrections recompute these views using current exercise metadata; this phase does not introduce a classification history snapshot.

## Queries, security and performance

Every Server Action verifies identity with getUser() before its owner-scoped preference read and invoker RPC. No caller owner IDs, service-role keys, privileged helpers, shared private cache or client PR writes. UUIDs, finite load precision, observed selection bounds, ranges, month starts and timezone names are validated. SQL enforces authenticated UID, date ranges and RLS; anonymous/service-role EXECUTE is revoked. All helpers use empty search paths and SECURITY INVOKER.

Ordinary chart/overview queries filter owner/session start dates inside the shared source before aggregation; they do not fetch lifetime sets to the browser or issue per-exercise API calls. The partial completed-session `(owner_id,started_at,id)` index complements existing owner/exercise/session and completed-set indexes. Query work grows with the requested owner's period. All time and genuine prior-record comparisons necessarily inspect relevant full history; monitor latency/EXPLAIN on large hosted datasets before adding a reproducible derived cache. There is no asynchronous invalidation mechanism to keep correct today.

## Validation and release

The two new forward migrations must be reviewed and applied in order before app release. The recognition migration depends on the shared metric source but does not change exact performance values. Local pgTAP, unit and browser suites cover date/measurement/owner boundaries, source exclusions, downsampling, calendar/DST, duration reliability, dominance, units and navigation. See [intelligent recognition](intelligent-pr-recognition.md) for its separate rules. Hosted SQL, production deploy and remote history repair remain unauthorized. Phase 6.3 is handed over locally for the user's push/PR workflow.
