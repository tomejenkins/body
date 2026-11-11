# Phase 7.6F.1 — Logger interaction simplification

## Scope and architecture

Base: merged PR #33, main `8fa756a336695c72771cae9f2065d9b0af1e5222`. This phase changes client presentation and the current MVP roadmap. Existing `WorkoutLogger` entries, queue, sequence numbers and saved rows remain authoritative. No migration, dependency, RPC, performance formula, schedule engine, set identity, mutation UUID rule or stored completion flag is added.

The existing `expanded` movement ID controls Workout Home. Native per-row `<details class="set-options">` continues to own Options openness. The optional effort editor is a small presentation component over the same draft and callbacks; it never stores a second copy of actual effort or creates a session.

## Collapse only after confirmed completion

When a command represents a transition from an uncompleted saved row to completed actuals, the logger captures the existing draft sequence and a presentation interaction generation. The existing server action, validation, invoker RPC, CAS and row reconciliation run unchanged. Only afterward can it close that exact row's native Options panel.

The accepted entry must still have the same draft sequence, no dirty/pending/error/conflict state, saved `status=completed`, confirmed inputs and the exact acknowledged mutation UUID. Failed, empty, conflicting or superseded responses cannot collapse the panel. Ordinary weight/repetition/type/effort editing on an already completed saved row does not repeatedly collapse it. Pending/incomplete saves never trigger this behavior.

Each Options panel records pointer, keyboard and assistive click interaction generations in a component-local ref. Any newer interaction cancels an older pending collapse, including closing/reopening the panel or requesting help. Another row's interaction is independent. This bookkeeping performs no network call, React rerender per keystroke or persistence; it is not completion authority. Native details remain manually reopenable after completion.

The completion checkbox, fields, Saved/Not saved/Unsaved/Saving states and error/retry controls remain visible outside the disclosure. Collapse never hides the set or discards entered values. A small `collapseSetOptions` DOM helper moves focus to the visible summary only when closure would hide the currently focused control. Focus already on the summary or outside the panel is preserved; `preventScroll` avoids a forced page jump. No automatic scroll to another exercise is added; native collapse/scroll anchoring retains the current row context. The existing fixed footer measurement and keyboard-inset handling remain unchanged.

## Next Exercise and Workout Home

The existing Next Exercise callback clears `expanded` and navigates through `loggerHref(workout.id)` to the **same** active Workout Home. This explicit one-time client action needs no query flag, server field, persisted preference or effect that keeps forcing the page closed. Initial/refresh Home already begins collapsed. Back retains its existing behavior, including deliberate manual review state; manual movement expansion remains available after Next.

Collapsed cards retain movement labels, the selected canonical exercise name/link and the existing completion indicator. A short working-set summary uses `workoutProgress(...).progress.completed/required`. When no prescribed denominator exists it shows the actual completed working-set count alone. There is no new counting/qualification formula. A mere selection is not completion, partial stays partial and an unstarted movement is not completed. Active performance and saved progress retain the existing meaningful-load/repetition rules.

Next creates no exercise, movement, workout, scheduling decision or program progress. It does not choose the next movement, accept partial work, finish the session or satisfy a pending program-end request. Contextual Add Set calls its existing implementation and preserves defaults, limit and idempotency.

## Compact Set Options

The primary row remains set number, applicable load, reps and Done. The collapsed Options summary still includes supported set type and any reported effort/failure modifiers.

Expanded Options contains:

- Direct supported Set Type selection with on-demand help.
- **Effort · Optional** with a Record effort action when unrated. Opening the editor writes nothing. Its single rating control uses the saved scale first, otherwise the existing Profile preference. Blank entry is explicitly labeled RPE/RIR · Not recorded.
- A secondary **More effort options** action exposes the scale selector and the independent To Failure flag. These are not permanently stacked alongside the ordinary RIR rating. A recorded failure is still identifiable in the compact summary and the secondary-action label.
- Existing Move Up, Move Down and Delete Set controls in a secondary action row. They have the same queue/dirty/pending safeguards and accessible names.
- Existing bodyweight/external load choices only for applicable exercises. Primary Add weight and normal inline/contextual Add Set paths are unchanged.

No required effort prompt, completion modal, new set type or unsupported rating is introduced. The supported enums remain working, warm_up, drop and rest_pause. The detailed controls use 44px touch targets without permanently displaying long explanation blocks.

## Help and effort semantics

`SetOptionHelp` uses the installed Radix Popover primitive. Explicit labeled help buttons open compact same-window content, portaled above the header/footer. Collision padding, bounded width/height and theme tokens keep it readable. Escape, outside interaction and the close control dismiss it; focus returns through the existing primitive. Help is available without mutating actual performance.

RIR help explains reserve, 0 and censored 5+. RPE help states the actual supported 6–10 range; no unsupported low ratings are offered. Scale changes clear incompatible entered ratings through the existing change/enqueue path. They never mathematically convert RIR/RPE or change Profile preference.

`performed_to_failure` remains an independent explicit attestation that another repetition could not be completed with acceptable technique. It is **not inferred from RIR 0 or RPE 10**. Existing apparently contradictory historical reports are retained exactly. The rare control remains editable where previously authorized, and remains unavailable for warm-ups. Users must clear a true flag before choosing Warm-up; no automatic clear or historical rewrite occurs. Help explains that distinction when requested.

Actual/prescribed effort remains separate. PR, progression and program completion still use existing eligible performance. New/added sets remain unrated and not explicitly to failure under the existing defaults. No saved weight/reps, timestamps, canonical load, source snapshots or personal records are changed by this presentation.

## Recovery and connectivity

Discard this draft and use saved values appears only for an actual dirty, failed, conflicted or local-only entry, and stays disabled while saving. It is absent rather than a large disabled button on clean saved rows. Its existing owner-scoped read/reconciliation operation is unchanged. Errors and explicit conflict choices remain outside Options and visible even if the user closed the disclosure.

Phase 7.6F's unchanged-retry UUID correction, draft sequence guards, sessionStorage recovery, pending/navigation/closure protections and authoritative Saved semantics remain intact. Offline failure retains visible exact inputs and open Options; reconnecting does not replay a write. Deliberate retry can collapse only after confirmed completion under the same guards. No offline queue or new local persistence is introduced. The public-only offline fallback and notice remain unchanged.

## Mobile and accessibility limits

Tests cover 375, 390 and 430 CSS-pixel widths, light/dark, 200% root text, explicit help, outside/Escape dismissal, focus return and retained input focus. Screenshots use real local training evidence and were visually inspected. Browser screenshots cannot establish physical iPhone keyboard geometry, Dynamic Type, VoiceOver/TalkBack or Safari scroll anchoring. A focused mobile input capture is explicitly labeled keyboard-unverified; it is not a fabricated native-keyboard screenshot. Those remain device release checks.

The fixed timer, Back | Abandon | Finish, stable Confirm Abandon and contextual Add Set | Next Exercise stack are unchanged. Options/help use scoped styles and existing theme tokens, not an app-wide refresh.

## Roadmap-only Supersets

The authoritative [MVP roadmap](mvp-readiness-and-next-roadmap.md) now includes Superset Support as required before launch, after connectivity reliability and logger simplification. Exactly two movement patterns may eventually be grouped from Workout Home, with independent exercise identities, sets, PRs, completion and safe ungrouping. Open questions cover selection timing, alternation, unequal counts, active grouping changes, History, Favorites and immutable program templates. No grouping schema, UI, placeholder or logger behavior is implemented here. Cardio, trials, subscriptions, promotions/lifetime entitlements, admin and prior launch gates remain required.

[Executed validation and screenshots](phase-7-6f-1-validation.md)
