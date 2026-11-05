# Advanced set logging — Phase 7.1

Normal logging remains weight, reps and Complete. Existing expandable set options now contain To Failure and an optional effort rating; no modal or extra required step. The collapsed summary includes applied modifiers only. Profile Settings remembers the preferred input scale for new workout views. Existing saved ratings retain their actual entered scale even if that preference changes.

## Independent measurements

- `set_type` remains working, warm_up, drop or rest_pause.
- `performed_to_failure` is a separate non-null boolean, default false. For this MVP it means the user's report that another repetition could not be completed with acceptable technique. It is supported on working/drop/rest-pause sets, not warm-ups. Clear the flag explicitly before choosing Warm-up.
- `effort_scale` and `effort_value` are an optional paired measurement: both NULL when unrated. RPE supports 6–10 in half steps. RIR supports integers 0–5; stored 5 explicitly means **5 or more**, a censored lower bound, not exactly five.

RPE 10 and RIR 0 never set failure automatically. Failure does not fill or convert either rating. An apparently contradictory report is retained as entered rather than silently reconciled. Switching the input scale clears that set's rating without mathematical conversion. RPE and RIR are not treated as losslessly interchangeable.

The preferred input scale defaults to RPE for existing/new accounts, while all existing effort stays unrated. It is a private `account_preferences.preferred_effort_scale` value, saved through getUser(), owner RLS and a narrow column update. Preference changes do not alter weight units, prior effort, active typing or workout activity clocks. Per-set scale choices do not silently change the account default; choose it explicitly in Profile Settings.

## Actual versus prescribed

Actual effort/failure is user-entered and saved with the same actual performance draft. Pending inputs are not completed performance. New automatic rows and Add set rows start unrated/not-to-failure, even when past actuals or the previous draft supply load/reps. Existing rows with missing advanced data display honestly as unrated. Effort changes in a completed set preserve its original actual completion timestamp.

`program_set_prescriptions.effort_scale/effort_value/intended_to_failure` stores planned targets separately. Future execution can copy these into protected `workout_sets.prescribed_effort_scale/prescribed_effort_value/prescribed_to_failure` snapshots. The current logger does not substitute those targets for actuals, and ordinary clients cannot write the snapshot columns. Thus actual RIR 1 can coexist with prescribed RIR 2 and an independently reported failure flag. Program execution/target assignment is deferred to Phase 7.3; no automatic load or effort recommendations are introduced.

## Persistence and recovery

The existing `log_workout_set` invoker RPC adds one optional trailing `p_effort` object containing exactly scale, value and failure. NULL/omitted means preserve existing effort on an old client's update; new rows default NULL/false. An explicit object can set/clear ratings and flag atomically. Old named/positional calls remain valid with the default argument; the old overload is removed to avoid PostgREST ambiguity.

Both server action and database validate the shape, paired NULLs, supported ranges and warm-up restriction. Numeric effort is not rounded into validity. Explicit effort edits confirm that a row is no longer an untouched automatic suggestion. Clients cannot modify owner/parent/revision or protected prescription snapshots.

Queue ordering, CAS revisions, mutation IDs, retries, conflict review, draft cache and finish/navigation guards remain the same. Rejected edits retain advanced draft fields; closed-draft review shows them separately from recorded performance. A successful effort save touches last activity in the same transaction; failed/stale/foreign/expired writes do not bypass the existing lifecycle. Closed and removed parents remain protected.

History and Look Back display the saved scale/value and failure beside the retained set type. There are no historical editing controls. Changing effort alone does not create a new PR: eligibility, canonical load, completed reps, actual completion time, volume and dominance calculations do not use effort/failure as multipliers or record categories. Warm-ups remain excluded independently of effort.

## Validation and release

The first forward migration adds validated nullable effort fields, the independent failure flag, the private preference, confirmation guard and compatible RPC. The second adds protected future prescription snapshots. Apply both reviewed migrations before deploying this app version. No hosted SQL, remote reset, migration push or production deployment is part of validation.

Tests cover normal/unrated, RPE, RIR, failure alone/combined, drop/rest-pause, explicit clearing, invalid values, old call compatibility, smart defaults, exact load/unit preservation, activity timestamps, cross-owner denial, historical retention, stale revisions, browser refresh, retained failed drafts and input preference. Browser regression tests identify the Complete checkbox by its accessible name now that expanded options contain a separate failure checkbox.
