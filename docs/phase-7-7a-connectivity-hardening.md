# Phase 7.7A — Invalid completion and connectivity hardening

## Scope

Based on merged PR #34, main `33cefeb191a7e904f2e8a9456826e26d71b23955`. The mandatory P1 checkpoint precedes optional performance work. This change corrects invalid completion, bounded keyboard visibility adjustment, lifecycle/retention transport recovery and the local database test runner. No performance optimization, schema migration, dependency update, hosted configuration, deployment, offline queue or Superset implementation is included.

## Confirmed findings and limits

1. `WorkoutLogger` changed `draft.completed` before calling `valuesFor`. A missing load/repetition then failed validation, but the checkbox and complete-row styling still used that invalid draft. Local reproduction shows a checked row with Not saved and a large generic retry error. Missing values did **not** reach the server in that case.
2. `valuesFor` allowed explicit zero reps/load under the old storage contract. After the invalid completion left the draft completed, entering zero and blurring submitted a completed command. The local baseline persisted `status=completed`, zero reps and zero external load. These values do not become qualifying performance under the existing evidence engine; this phase does not change that engine.
3. Saving explicit blank actuals on an untouched automatic pending row can return `inputs_confirmed=false`. Calling `draftFor` on that response reapplied prescribed suggestions over the user's cleared fields. A dedicated browser regression demonstrated the reps returning; own acknowledged pending saves now retain the explicit current strings while accepting the authoritative row.
4. `WorkoutModeControls` called `scrollIntoView` on every visual-viewport resize **and scroll**, whenever a keyboard-sized inset and focused input existed. A controlled viewport adapter produced ten calls for ten scroll events. Recentring can itself cause more viewport scroll events. This establishes a repeatable scroll path, **not** proof that the physical Safari shake or a self-sustaining native loop was reproduced.

There is no evidence here of repeated database retry loops, a ResizeObserver loop, timer mutations or Options-collapse loops causing the original iPhone report. Native iPhone keyboard/Safari/PWA behavior remains a release verification requirement.

## Completion contract

`src/features/sets/model.ts` supplies `setFieldErrors` and `SetValidationError`; `valuesFor` uses the same field validation. Done validates the latest ref-held draft synchronously before changing completion intent or generating a mutation UUID. Invalid Done preserves strings, saved row, Options and focus, sets only field feedback, and queues no completed command.

- Non-warm-up completion requires integer reps 1–1,000. External mode additionally requires positive canonical load, within the existing 100,000 kg maximum and entered numeric format. Conversion uses the user's existing lb/kg setting and unchanged exact rational arithmetic. A positive input rounding to zero at storage precision cannot establish positive load.
- Bodyweight mode requires positive reps and no added-load entry. Deliberately adding resistance switches to the existing external-mode validation. No body mass is invented.
- Pending drafts retain nullable values and explicit zero. Malformed/out-of-range numeric strings remain recoverable and cannot be saved as valid numbers.
- Warm-ups preserve their existing zero-inclusive numeric contract, required fields on completion and independent failure restriction. Drop/rest-pause retain their classifications and effort/failure semantics; their non-warm-up completed training uses positive actuals.
- Unsupported duration/assistance controls retain the existing server-resolved restrictions. No new measurement category or legacy support is fabricated.

The server action independently rejects missing/zero non-warm-up completion. The invoker RPC's existing NULL/range/measurement/ownership/CAS guards remain unchanged; it still supports historical zero-inclusive storage for older/direct callers. This application guard does not retroactively rewrite such records, change PR eligibility or substitute for database authorization. No database constraint or grant is weakened.

## Feedback, acknowledgement and corrections

Compact field descriptions use stable set-UUID IDs, `aria-invalid`, `aria-describedby` and a polite live region. Correcting a field clears its corresponding message. Validation does not autofocus, scroll, animate, open a modal or add retry buttons for a simple input mistake. One initial feedback insertion can change row height; repeated invalid taps must not repeatedly mount changing error panels or move the footer.

The checkbox and completed styling use the authoritative row. A valid new completion remains unchecked while Saving and checks only after acknowledgement. A failed completion remains unconfirmed; retained draft intent and the original retry command remain available. Previously completed rows remain checked while an invalid correction is retained, because their prior saved evidence still exists. Invalid completed corrections cannot overwrite that evidence. A subsequent valid correction preserves the original completion timestamp through the existing server operation.

A validation attempt advances the entry's presentation sequence, and another row's returned rows cannot clear active validation feedback. Older replies cannot erase newer inputs. Own pending acknowledgements do not reapply suggestions over explicit blank strings. Initial loading/refresh of untouched unconfirmed automatic rows still uses the existing suggestion contract; this is not a new durable blank-preference or draft store.

Phase 7.6F.1's exact mutation, sequence, dirty/pending/conflict and interaction-generation guards still control Options collapse. Invalid/pending/failed operations cannot collapse it. Its hidden-focus helper remains unchanged.

## Keyboard visibility

`keyboard-visibility.ts` never requests scroll from a visual-viewport **scroll** event. Resize measurements are coalesced in one animation frame. A focused logger input/select is considered at most once per keyboard opening; it scrolls only if outside the visible area or obstructed by the footer. Closing the keyboard resets that allowance. No focus switching is added.

The existing inset threshold, footer bottom positioning, ResizeObserver height publication, safe-area CSS, timer and pause/continuity model are unchanged. Desktop viewport simulation is not a native keyboard implementation; physical field visibility, anchoring and safe areas must still be checked on Safari.

## Connectivity and command integrity

`LifecycleForm` and `WorkoutRetention` catch rejected action transports into existing inline error regions. They call `unstable_rethrow` first so Next redirects/control-flow exceptions remain framework-owned. Errors make no claim about whether a transaction committed. Explicit retry retains the same form request/revision/payload. Preventing automatic form reset preserves the user's confirmation after an uncertain outcome; successful actions still navigate normally.

No automatic retry, client-authoritative transition, new receipt schema or regenerated request UUID is introduced. Tests cover a request aborted before reaching the server and a response aborted **after** `route.fetch()` commits, for switch and archive, on desktop/mobile. The existing receipt/locking/RLS transaction remains the authority. Repeated switches create one replacement enrollment; archive retry does not increment retention revision twice. Existing movement-selection catch/retry logic, Favorites and closure guards are retained rather than rebuilt.

## Database runner and release risks

`npm run db:test` now explicitly selects `supabase/tests/database`; diagnostic SQL remains outside the TAP selection. Two initial-schema assertions now scope volume/cascade checks to their synthetic owner, so unrelated local training cannot fail them. No security assertion is removed. Both the standard local runner and a fresh isolated replay run all 2,308 assertions.

The dependency audit reports 12 development/build/lint findings (4 high, 8 moderate), zero production dependency findings. Some advisory chains have no compatible automatic fix. No blanket `npm audit fix`, override or adapter downgrade is justified by this logger checkpoint. Review compatible tool updates and rebuild/retest in a separate controlled change before release.

Physical Safari/Android connectivity, sanitized hosted-region waterfalls, production Auth/email, operational recovery, accessibility and staged update rehearsals remain unverified. No local result clears those gates. Bounded durable drafts, exactly-two-movement Supersets, manual cardio and entitlement/billing/admin/privacy MVP requirements remain in the [roadmap](mvp-readiness-and-next-roadmap.md).

[Actual validation and evidence](phase-7-7a-validation.md)
