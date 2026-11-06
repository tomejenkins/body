# Workout continuity

Phase 6.2 adds continuity to the existing session lifecycle, not a second status system. Status remains in_progress/completed/abandoned. The authenticated shell shows a compact persistent Resume bar outside the current logger, with completed/live set counts. It refreshes on navigation, focus/visibility and every 30 seconds outside logging. Passive requests never extend activity. An expiration notice links to preserved history and can be dismissed on that device. The latest automatic closure remains discoverable until a newer session starts, with no arbitrary notification time limit. Mobile safe-area spacing keeps controls clear; light/dark themes and reduced motion are supported without flashing.

## Authority and policy

`public.workout_policy()` is the threshold source. UTC database time decides:

| Inactivity           | State                        | Behavior                                                                    |
| -------------------- | ---------------------------- | --------------------------------------------------------------------------- |
| <30 minutes          | active                       | Ordinary logging                                                            |
| 30–<60 minutes       | quiet                        | No interruption or pause                                                    |
| 60 minutes–<12 hours | check_in                     | On return: Finish Workout, Resume Workout, Abandon Workout                  |
| >=12 hours           | abandoned, reason inactivity | Preserve all saved/pending sets; release active uniqueness; no achievements |

New sessions start with a server timestamp but no activity evidence. Successful set additions/edits/completions/deletions/reorders/type changes, selection mutations and deliberate session name/notes changes atomically update last_activity_at and activity_evidence_at. Passive reads, refreshes, background polling, failed writes and no-op direct session updates do not. Duplicate RPC mutations remain idempotent and do not manufacture activity. Automatic pending structure is part of the authenticated selection transaction; it does not imply completed performance.

Explicit Resume uses an opaque UUID nonce, updates last_activity_at and continuation_count, and records a structured idle interval when appropriate. It does not invent an actual performance or activity_evidence_at. Retry with the same nonce has no effect. A successful saved action after a stale interval also records that gap. These are continuation context, not verified active-duration measurements.

## Manual pause refinement

The focused workout mode adds an explicit server-owned manual pause, separate from inactivity/check-in. Pause commands never extend inactivity or evidence. Effective duration excludes only manual pause intervals; historical timestamps and classifications stay intact. Qualifying saved work auto-resumes, passive navigation does not. Untracked legacy sessions require existing continuation/saved activity before using pause. See [focused workout mode](active-workout-mode.md) for commands, concurrency and display semantics.

## Endpoints and duration

- started_at: server-created start; no client INSERT/UPDATE grant.
- last_activity_at: latest committed qualifying interaction or explicit continuation.
- activity_evidence_at: whether saved meaningful work exists; explicit Resume alone is not evidence.
- finished_at: actual administrative confirmation/cleanup timestamp, never backdated.
- effective_finished_at: endpoint used for duration, separately constrained within start and closure.
- duration_kind: elapsed, estimated, unknown or legacy.
- closure_reason: finished, abandoned or inactivity.
- idle_intervals: structured from/to UTC timestamps (unknown legacy gaps marked explicitly).

Ordinary finish within 60 minutes uses administrative finish as effective end and labels the result **Elapsed session**. Forgotten finish uses last_activity_at only when saved activity evidence exists; **Estimated workout duration** explains the basis. It is never labeled verified time exercising. A resumed session uses elapsed start-to-end duration, explicitly qualified when an idle interval is included; gaps are retained for possible future analysis rather than silently subtracted or claimed as active work. Stale empty sessions close with unknown duration and NULL effective end. There are no manual times, sliders, editable durations or client clock parameters.

Legacy closed history retains original times, no invented activity or achievement events, with an explicit legacy elapsed label. Untracked legacy active sessions cannot be expired from a guessed last-activity timestamp: they show a check-in once old enough. Deliberate resume or saved work starts tracked continuity. Unknown legacy gaps are retained. A stale legacy closure without evidence has unknown duration.

## Transactions and recovery

Continuity RPCs use SECURITY INVOKER, authenticated UID, RLS and parent-session row locks. Lifecycle/selection/logging RPCs evaluate expiration before accepting mutations. Expired attempts return a committed rejection (NULL UUID or empty set result), rather than raising after cleanup and accidentally rolling it back. The server action reports unsaved input, never Saved. Duplicate closes preserve timestamps; conflicting outcomes and closed ordinary writes are rejected. The single-active index remains authoritative.

Direct child-DML guards lock the parent NOWAIT to avoid waiting in the opposite order from session-first RPCs. A concurrent direct write can fail with a retryable lock error; it must not be treated as Saved. Expired direct DML rejects and rolls back; the next continuity request performs cleanup. Child activity triggers run in the same transaction; failed saves cannot keep the session alive. Existing FK cleanup of historical plan references does not count as activity or rewrite closed metadata.

Lazy expiration runs on relevant authenticated shell/history/workout/context reads and write RPCs. There is no scheduler: a dormant account is physically closed on its next relevant request, and finished_at truthfully reflects that cleanup time. No claim is made that cleanup ran exactly at the 12-hour threshold. Expiration preserves pending selections and actual sets unchanged.

The inline check-in defers while drafts or queued mutations exist, disables duplicate submissions, and never steals focus. Existing draft/CAS/nonce/navigation protections remain. After server closure, rejected edits stay on screen and in owner/session-scoped sessionStorage. Closed review can display unapplied drafts separately with explicit discard; those drafts never become records or overwrite historical performance. Local storage is best-effort, device-only, not offline sync.

## Validation

`supabase/tests/database/workout_continuity.test.sql` exercises thresholds using privileged fixtures only in rolled-back local transactions. Browser clock fixtures refuse hosted URLs and use the disposable Docker database; no clock override exists in production. Unit tests cover UTC duration, DST, evidence fallback, idle qualification and closure language. Run the full retained navigation and logging suites on both Next.js and local Worker preview.

Set completion timestamps are also server-assigned by the logging trigger. Existing narrow invoker column grants are retained, but submitted completion times are ignored: first completion uses database time, completed corrections keep the original event time, and pending sets clear it. Privileged historical imports remain distinct from ordinary authenticated writes.
