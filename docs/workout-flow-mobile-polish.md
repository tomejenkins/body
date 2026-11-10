# Workout flow and mobile polish

Phase 7.6D.1 extends the existing two-screen active workout and Phase 7.6D completion presentation. It introduces no migration, dependency, RPC, scheduling cursor, performance rule or exercise-sequencing engine.

## Confirmed exercise actions

`exerciseSetsConfirmed` is a display-readiness predicate over saved logger entries. The focused exercise must have at least one nondeleted set; every such set must have saved `status = completed` and `inputs_confirmed = true`. Dirty, pending, failed, conflicting, local-only and deleting entries block readiness. All visible normal, warm-up and advanced rows participate; a skipped or pending row does not represent confirmed completion. Deleted rows are excluded, and an exercise containing only deleted rows is not ready.

The logger additionally requires an editable active session and no unresolved logger-wide draft or mutation. Duration/assisted categories remain unsupported by the existing logger and do not receive this affordance. This conservative global guard preserves existing draft protection across screens.

This predicate is deliberately **not training eligibility**. Saved zero-repetition or zero-load rows do not gain PR, schedule or program eligibility because navigation becomes available. Existing server performance and completion authorities remain unchanged.

The optional two-column action area is part of the same fixed footer stack, above the timer. It stays visible while the logger scrolls. Its live status explains that Next Exercise returns to this Workout Home. It never navigates automatically.

- **Add Set** calls the logger's existing `add(itemId, bodyweightEligible)`: same queue, UUID, defaults, normal pending row, effort reset, revision handling and local-only duplicate guard. The existing 100-set limit is mirrored by disabling this new button. The ordinary inline Add set control remains available. Adding a row hides the contextual area until the new row is saved as completed.
- **Next Exercise** calls the existing `loggerHref(workout.id)` navigation helper. The destination is exactly the same session's Workout Home. No exercise is selected, ordered, skipped or started; no movement/session is created; no program position or schedule advances.

Refreshing derives readiness from the loader's current saved rows and existing draft recovery, rather than persisting a new completion flag.

## Shared active footer

Workout Home and the focused Exercise Logger use `WorkoutModeControls`:

1. Optional equal-width Add Set / Next Exercise controls.
2. Full-width centered timer, with tabular numerals and Running/Paused state.
3. Three equal grid columns: **Back | Abandon | Finish**.

Back retains the existing contextual destination: same Workout Home from an exercise; Programs or Workout from Home. Finish only shortens the outer label; the existing review, partial acknowledgment, dirty/pending protections and authoritative submission are intact. During closure submission, conflicting buttons remain disabled through the existing shared provider/mutex.

The timer's effects, server reads, pause/resume transaction, effective elapsed calculation and session key remain unchanged. Query navigation does not key a new timer/provider instance. A `ResizeObserver` measures the fixed stack and publishes a CSS custom property on its own workout root. Content reserves the actual stack height plus the existing visual-viewport keyboard inset, including when controls wrap at larger text sizes. Cleanup removes the scoped property. Existing safe-area footer padding is retained.

## Two-tap abandonment

The middle column contains **one persistent button** and the existing abandonment form:

- Idle → the button is non-submitting, including initial server-rendered markup. Its first click prevents default locally and becomes destructive **Confirm Abandon**. The same node then becomes a submit button.
- Armed → second submit invokes the original `endWorkout` action for the exact session and `abandoned` outcome.
- Pending → shared closure mutex and disabled controls prevent competing submissions. Only authoritative success closes the session.
- Failure → existing retryable alert remains available; no successful closure is implied.

No Cancel button, new route or RPC is added. Document capture listeners for pointerdown and click dismiss when the event target is outside the confirmation button. They never prevent default or stop propagation, so the underlying logger, Timer, Back, Finish and navigation controls retain their behavior. Escape, popstate and pagehide also dismiss. Back and Finish explicitly cancel; session-key changes, unmount and refresh discard local arming state. Listeners are removed on cleanup and do not reset confirmation during an authoritative pending request.

The three columns, button node and dimensions remain stable when armed. At ordinary 375–430px widths the label fits one line. At 200% root text it wraps within the same column and height shared by the three controls. The changed label and live announcement supplement destructive color.

## Header investigation and correction

Baseline computed styles on merged main showed `.topbar` had a transparent background and static positioning. The wordmark is ordinary text. Inspection found no blur, backdrop filter, opacity reduction, mask, gradient overlay or pseudo-element covering it. The only unrelated gradient in the stylesheet belongs to movement progress. Thus transparency/missing stable top paint are confirmed; a specific native Safari scroll-edge/compositing cause is **not proven**.

The targeted correction paints an opaque theme-aware `var(--background)` surface. On mobile the existing 48px header becomes sticky at the top with an isolated stacking context, consistent height and `env(safe-area-inset-top)` padding. Content scrolls beneath a solid surface. Existing focused-exercise header hiding remains intact; no additional header is introduced into the logger. The header sits below dialogs and the workout footer.

The request referenced iPhone screenshots, but no image attachments were present in this task. Local before/after Chromium captures establish the CSS correction and readable scrolling in both themes. They cannot establish physical iPhone Safari status-bar/scroll-edge behavior; that remains a device release check.

## Completion refinement

The Phase 7.6D success mark grows from 76px to 84px, with a slightly stronger ring and soft green halo. A single 620ms entrance animates the halo only under `prefers-reduced-motion: no-preference`. Reduced motion renders the final static treatment immediately. Existing check/stat motion, earned PR cards, no-PR/empty copy and all completion/navigation/Favorite/retention behavior remain unchanged. There are no celebratory database writes or fabricated facts.

## Validation and boundaries

See [actual validation and screenshots](phase-7-6d-1-validation.md). Coverage includes pending-save readiness, refresh, default-preserving repeated Add Set, same-session navigation, timer continuity, stable armed geometry, outside/Escape dismissal, 200% text, simulated keyboard inset, header scrolling and reduced-motion halo suppression.

Physical Safari, Dynamic Type and assistive-technology review remain necessary. Phase 7.6E may refine Dashboard, Programs and History styling; it should preserve this shared footer and the existing logger/selection authorities.
