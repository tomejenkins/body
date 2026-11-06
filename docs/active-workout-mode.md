# Focused workout mode

Workout Home and the focused Exercise Logger now share one workout-specific bottom bar: **Back | Timer | End Workout**. The ordinary global navigation is hidden on those active execution screens. Home Back leaves the active workout resumable; Logger Back returns to Home with device drafts retained. End Workout opens the existing confirmation and finish/abandon guards, including incomplete-work acknowledgement and unsaved/queued-write protection.

## Presentation

Home presents natural movement names, a small accessible status icon and one 44 px selector toggle per row. Movement numbers, thumbnails, prescription paragraphs and structural editing are removed from collapsed rows. Five standard program movements fit the tested 390 × 844 viewport without scrolling. Only one selector opens at a time. Add, change, remove and reorder operations remain available under **Manage Workout**; none requires completing an exercise.

The logger reduces duplicate headings, images, gaps and selected-tile metadata. It retains the original load/repetition fields, completion controls, set types, extra sets, advanced RPE/RIR/failure options, instructions, exercise switching, suggestions, manual overrides and draft/queue handling. Entry controls retain readable text and practical touch targets. The bar follows visualViewport keyboard changes and focused inputs scroll into view. Real iOS/Safari keyboard behavior remains a physical-device verification task.

Exercise tiles place **Program Recommended** and **Last Used** above the exercise name when their existing provenance justifies them. Both may coexist. Generated ad-hoc movements never acquire program labels. No new cross-session ad-hoc Last Used model is invented; these labels reuse the existing program-slot history. Match grading, ranking, exact-match badge suppression and empty pools are unchanged.

## Authoritative timer

Opening or dismissing Timer only displays details. Pause Workout and Resume Workout issue explicit owner-verified commands to the existing session. The database stores pause state, closed pause intervals, a revision and the last command identity. Row locks, expected revisions and payload-bound UUID retries prevent competing tabs, devices or uncertain network outcomes from counting a pause twice. Client clocks and submitted durations never write authoritative timing.

The display starts from server effective elapsed seconds and interpolates locally only while running. It refreshes on visibility/focus, every 30 seconds while visible, and on same-browser tab notifications. Notifications request a verified read; they carry no trusted state. Revision/time guards prevent late responses from undoing newer state. A failed mutation retains its original retry identity and does not optimistically claim success. Cross-device changes become visible on refresh/focus or the next poll.

Pause excludes only explicitly recorded manual pause time. Resume closes the interval using database time. Existing verified saved activity, including logging and actual selection changes, also resumes a paused timer atomically. Passive browsing, refresh, polling, opening Timer and no-op updates do not resume it. Timer commands do not advance last_activity_at or manufacture activity evidence.

The existing 12-hour inactivity policy continues during pause. Expiration remains lazy on the next relevant request; no scheduler or new workout status is introduced. Legacy untracked active sessions must use existing explicit continuation or save an activity before timer commands are allowed. That establishes an expiry anchor without inventing historical activity.

Historical started_at, finished_at, effective_finished_at, idle intervals and elapsed/estimated/unknown/legacy classifications remain intact. Existing sessions start with empty pause intervals, so their durations do not change. Closed effective duration subtracts clipped manual pauses from the original appropriate endpoint. Estimated recovery still ends at saved activity, never cleanup time. Idle intervals remain disclosed rather than silently counted as verified exercise. Reliable-duration analytics retain their existing eligibility rules and use pause-adjusted seconds. History and review use the same pause semantics; there is no editable-duration input.

## Database and release

`20261106181724_authoritative_workout_pause.sql` is an additive forward migration. It adds four fields to workout_sessions, a narrow authenticated UPDATE grant for timer_command, an invoker command RPC, an owner-scoped duration helper and a protected timer trigger. Existing ownership/RLS, lifecycle, set CAS and mutation APIs remain authoritative. Server fields, anonymous/service-role access, foreign sessions and closed timer writes are denied. Private helpers stay unexposed. History loads pause intervals in one bounded owner-scoped query per page.

Apply the migration through the reviewed existing delivery process before using this app revision against a shared database. This work applies SQL only to disposable local databases. It does not merge, deploy, change hosted configuration or run hosted migrations.

See [validation and screenshots](active-workout-mode-validation.md) for executed checks and limits.
