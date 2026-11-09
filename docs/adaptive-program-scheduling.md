# Adaptive program scheduling — Phase 7.5A

## Preflight and architecture

Base: latest merged main `25a6581`, including Phase 7.4 evidence/adherence and active workout mode. Existing immutable program_versions define ordered 1–366-position cycles, explicit rest positions, movement prescriptions and optional rotation duration. They do not define weekdays. Existing start_program_workout clones approved sources into owned immutable versions, serializes on the owner's profile, creates unselected movement snapshots and binds sessions to program_assignments. Starting a different version archives the prior active assignment. Actual session/set writes, continuity, manual pause, PRs and historical snapshots remain the execution engine.

Phase 7.4 derives recorded progress through program_saved_progress. Its unscheduled next-workout summary advances after a completed session with any qualifying work, including partial work; retrying a partial position preserves its rotation. It never creates calendar dates. Programs already offers program progress and ordinary workout launch forms. Dashboard remains the existing active-workout/record entry, shortcuts and recent history. No Dashboard shortcut, Favorite, override picker, social or publishing workflow is added here.

Scheduling extends these assignments and sessions rather than creating another assignment, performance or execution table. The same SQL scheduling cursor now supplies calendar recommendations, scheduled session rotation binding and the configured assignment's adherence recommendation.

## Authoritative and derived records

- **Program definition:** the owned immutable source version, explicit day UUID/position, prescribed rest positions and typed recipe metadata. Authored edits do not change a running assignment.
- **Schedule configuration:** assignment-local start date, timezone, origin position/rotation, initialization timestamp and optionally the existing active session explicitly included during initialization. These are server-derived, immutable fields. A narrow schedule_command input transports validated configuration intent; it is not an editable completion record.
- **Original scheduled date:** workout_sessions.schedule_due_on is computed by the existing assignment-binding trigger when a scheduled session starts. Retries/repetitions of the same rotation/position retain the original date. This protects historical intent when later training or corrections change projections.
- **Actual history:** closed sessions and eligible saved performance remain the only training/completion evidence. No calendar date creates a session, set, record or completion flag. Administrative finish timestamps and all actual values remain unchanged.
- **Projection:** read-only SQL derives current cursor, completed rotations, recovery and requested calendar events. Future dates are hypothetical guidance, never stored attendance. The immutable start/sequence and protected session due-date snapshots preserve historical scheduling facts without materializing every future day.

## APIs and bounded work

All functions are authenticated-only SECURITY INVOKER, empty-search-path and owner scoped, with no caller owner parameter:

| Contract                                                         | Purpose                                                                                                                                   |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| valid_scheduling_timezone(zone)                                  | Validate a real IANA zone against PostgreSQL's timezone catalog; explicit UTC is supported, ambiguous abbreviations are rejected.         |
| configure_program_schedule(assignment, start, timezone, request) | Initialize an active, version-bound owned assignment using a payload-bound UUID request.                                                  |
| program_schedule_days(assignment)                                | Normalize immutable training positions, full-day recovery gaps and calendar offsets.                                                      |
| program_schedule_facts(assignment)                               | Shared eligible session summaries using program_saved_progress; no actual-set payload reaches the calendar.                               |
| program_schedule_cursor(assignment)                              | Earliest unresolved training identity, original due date, recovery-ready date, last training/full completion and complete-rotation count. |
| program_schedule(assignment?, from?, days=7)                     | Current assignment or an explicitly owned historical assignment; 1–42 requested calendar dates.                                           |

Calendar output includes local date, assignment/version identity, rotation, explicit program position/day UUID where applicable, human name, kind, factual status, recommendation and session reference. Extra recovery has no invented program day UUID. The top-level progress contract remains available when a fixed-duration calendar has no pending recommendation.

Evidence is aggregated in SQL by owner/assignment, using the retained eligible performance source and an owner/assignment/finish index. The application makes one projection RPC and one owner-scoped preference read, not per-day/per-set queries. It never downloads lifetime set history into the browser. Projection jumps whole normalized cycles for distant windows and loops at most one cycle plus 42 days. Full position membership is read once before that loop, avoiding repeated performance aggregation per projected workout. No recursive lifetime date expansion, random choices or personal-data cache is used.

## Calendar dates and initialization

The user explicitly confirms a persisted IANA scheduling timezone in Programs, optionally choosing the detected device zone. Device detection fills a form only; it never writes automatically. UTC is the clear fallback for configuration, not a fabricated legacy calendar. SQL computes the local current date using statement_timestamp() AT TIME ZONE the assignment's saved timezone. Browser locale, browser clock and query date do not decide authoritative due/overdue state.

A new assignment uses the previously confirmed scheduling preference and starts on the server's current local date at the explicitly selected workout position. Without a confirmed preference, it remains safely unconfigured; the Programs calendar asks the user to initialize it. Existing assignments are never backfilled automatically. Initialization accepts today or a future local date within one year, selects the active workout or the genuine current/next recorded position, and makes no claim about past attendance. Earlier closed sessions remain intact in History; they do not become newly scheduled completions. An active session explicitly included at initialization may count when closed on/after the configured start date.

The timezone is fixed for the assignment. Changing the default preference deliberately affects future assignments only. Travel does not rewrite an active calendar. In-place timezone/start-date changes are intentionally unavailable in 7.5A; a future reviewed revision operation must preserve old completion dates and due snapshots before changing future guidance. This phase does not silently remap old records under a new timezone.

Actual completion markers use the server finished_at timestamp converted in that fixed zone, including cross-midnight sessions. They are not attributed to the session start date or original due date. Timer effective-duration classifications and manually excluded pause seconds do not decide program completion or rewrite dates. A forgotten session closed as abandoned cannot advance the schedule.

Date addition uses calendar dates, not repeated 24-hour timestamp additions, so week/month/year and both DST transitions retain their local dates. Optional minimum_rest_hours is rounded conservatively upward to full calendar days and may enlarge the gap between training positions. This is date-based recovery guidance, not certification that an exact hourly interval has elapsed across DST or a prescription to train at midnight. maximum_rest_hours remains advisory metadata, not a punishment deadline.

## Carry-forward and recovery rules

1. Training occurrences have explicit assignment/version/day/rotation identity. A calendar week ending does not start a rotation.
2. The earliest unresolved occurrence stays pending. Passing one day, two days or a week never resolves it. Overdue appears only after its original scheduled local date has passed.
3. Original due dates remain visible. If Wednesday's workout is completed Thursday, Wednesday has an overdue scheduling marker and Thursday has the actual completion marker. No completion is backdated.
4. Late completions shift following dates. The first full resolution of each occurrence is used, so repeats cannot erase an outstanding original due date. Following guidance uses the latest such resolution and its normalized recovery gap, skipping positions already resolved out of order. Recovery starts relative to actual recorded training; unused calendar dates do not stack duplicate rest positions.
5. An overdue pending workout can be recommended today after existing recovery guidance has elapsed. Otherwise the calendar shows recovery before the recommendation. Extra rest is never completed training and never satisfies a pending workout.
6. Projections place at most one prescribed workout per date. They never compress multiple unfinished workouts into today to catch up. Optional extended recovery is distinguished from an actual planned-rest position.
7. Deliberate existing launch forms can still start any program workout. A full out-of-order session retains its own current-rotation position; it does not discard the earlier gap or complete another day. Repeated already-resolved positions do not advance twice. Projecting past an already-resolved out-of-order position does not invent another training session or another recovery block for it.
8. A full rotation requires all required training positions in that recorded rotation. Fixed-duration calendars stop projecting after the configured number of full rotations; existing explicit launch forms remain available and history is not erased or locked.

Tradeoff: this default keeps the prescription order and recovery meaningful rather than forcing attendance onto weekdays. Early/out-of-order real training may leave extra room in the original projection; no accelerated catch-up or automatic skip is inferred. Recovery remains guidance, while the existing launch flow is deliberately unchanged until 7.5B.

## Full, partial, abandoned and corrected work

Eligibility reuses program_saved_progress: completed sessions with confirmed, nondeleted, positive-repetition non-warm-up performance on nonremoved supported selections. Pending, zero-rep, deleted, unconfirmed, unsupported, empty and abandoned evidence cannot manufacture progress. Existing full/partial/none session classifications, target/actual values, effort, progression suggestions and PRs are untouched.

For calendar-enabled assignments, all prescribed movements must satisfy the existing required saved-set counts before their occurrence resolves. A partial closed session is **Partial training recorded**, informs recovery and stays in History, but leaves the position pending. A later full retry at the same rotation/position resolves it; partials are not automatically merged into fictional full sessions. This is an intentional reconciliation of the Phase 7.4 next-position display for configured assignments only. Unconfigured legacy assignments retain their old progression behavior.

There is no current skip/accept/defer operation. 7.5B's explicit partial-acceptance decision can extend the common resolution source using the assignment/version/day/rotation identity rather than rewriting sets or completion flags. The typed future input contract is in src/features/scheduling/decisions.ts. A partial is not trapped by an automatic loop: it can be fully retried now and explicitly accepted by the future reviewed operation.

Future authorized historical corrections recompute from current eligible evidence. Removing qualifying evidence reopens the genuine gap and removes a false completed-rotation result. Other sessions retain their original day/rotation and due-date snapshots; no correction manufactures a replacement completion. Ordinary closed-history edits remain denied under the existing security model.

## States and calendar UI

| State                     | Basis                                                                                                        |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Completed                 | Actual full qualifying session on its actual local finish date.                                              |
| Partial training recorded | Actual completed session with some eligible work but incomplete prescribed progress.                         |
| Due                       | Pending recommendation projected on the current local date.                                                  |
| Scheduled                 | Upcoming projected training date; not completed evidence.                                                    |
| Overdue · carried forward | Original due date has passed without completion on that date. A later actual completion is shown separately. |
| Planned Rest              | A real prescribed rest position in the derived sequence/recovery interval.                                   |
| Recovery guidance         | Additional minimum-rest guidance without an invented program position.                                       |

Deferred, Superseded and Skipped are not exposed because no formal persisted decision exists for those states yet. Projection changes are derived, not fake decision events. There are no attendance scores, punitive streaks, percentages or aggressive alerts. Text labels accompany restrained styling.

Programs displays seven dates, current recommendation/carry-forward, actual/overdue/rest labels and adjacent-week links. The compact mobile list becomes a seven-column desktop calendar. Light/dark, readable text, keyboard links, current-date semantics and practical navigation targets reuse the existing design language. This is a read-only calendar; the only setup mutation is explicit timezone/start configuration. Dashboard and ordinary program launch flows are preserved.

## Concurrency and security

New configuration fields have no ordinary INSERT/UPDATE grants. Only a validated narrow command and a validated scheduling preference are writable. RLS continues to restrict the existing assignments, preferences, versions and sessions to their owners; there are no new user tables or definer bypasses. Original due snapshots cannot be inserted or edited by clients. Configured assignment archival uses a server timestamp and cannot be rewritten/reactivated as a new calendar; historical reads remain available without future prescriptions.

Configuration and assignment starts serialize on the existing profile lock and assignment row; direct assignment-trigger locking uses NOWAIT to avoid reverse-lock deadlocks. The existing single-active-assignment/session constraints remain authoritative. Same-command retries return the same configuration; different payloads/nonces cannot overwrite an initialized calendar. Existing closure idempotency means duplicate completion requests cannot create another session or advance twice. Stable single-statement projection reads see a coherent committed view during concurrent closure.

## 7.5B / 7.5C / 7.5D contracts and limits

7.5B can submit explicit accept_partial/skip/defer/independent-link decisions with assignment, immutable version, day, rotation, expected cursor and retry UUID. These contracts are preparatory only: there is no accepting endpoint or skip/favorite persistence in this phase. A favorite is independent by default and cannot acquire assignment progress merely by matching an exercise or name; deliberate validated linking must be a later action. Existing ad-hoc sessions have no assignment link and do not advance schedules.

7.5C can use the same next/programComplete/progress/events contract for Dashboard tiles and one-tap starts. 7.5D can read the same preserved completion/session references; no Feed entry or publication is created now. No paid service, dependency, secret, builder, billing or admin functionality is introduced.

In-place timezone revisions, explicit override decisions, partial acceptance, Favorites and polished post-workout/Dashboard interactions are deferred. Physical iOS/Safari and hosted-provider behavior require separate device/deployment verification. Apply the new forward migration through the approved existing process before sharing this app revision; no hosted SQL, infrastructure change, deployment or merge is authorized by this work.

## Phase 7.5B integration

Explicit partial acceptance, skip, defer/replacement/cancellation and source-aware independent Favorites now extend this same cursor. See [workout selection and Favorites](workout-selection-and-favorites.md) for authoritative decision records, concurrency and calendar statuses. Original due dates remain visible alongside deliberate deferral events; overdue describes the original uncompleted schedule, not a training failure.
