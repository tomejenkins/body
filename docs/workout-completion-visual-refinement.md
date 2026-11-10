# Workout completion visual refinement

Phase 7.6D is a presentation refinement of the existing private completion route. It builds on merged Phase 7.6C (`9765963`) without a migration, dependency, new completion event or new statistics query.

## Composition and hierarchy

The former page used a small left-aligned status icon, similarly weighted information blocks and several consecutive paragraphs. The new composition has one clear visual sequence:

1. Centered success symbol, prominent completion headline, workout title and original completion timestamp.
2. One deep-green statistics surface: duration, qualifying working sets and performed exercise selections. Dividers make these a single summary rather than three competing cards.
3. Earned records, using a restrained warm-metal accent and readable actual results.
4. Compact prescribed-work context and expandable Next Time guidance when relevant.
5. Secondary Favorite controls and unmistakably disabled future Feed affordance.
6. One primary Done action, followed by View Full Workout.

The layout is phone-first and stays centered within a 680px reading width on larger screens. It retains the existing global navigation and normal document scrolling. Done is a full-width, 52px-minimum primary control; secondary links/disclosures have at least 44px targets. No new fixed overlay can obscure workout content.

## Typography and theme

The headline uses a responsive 2.1–3rem scale, moderate weight and tighter tracking. Workout names use a calmer 1.05–1.3rem scale and wrap naturally. Statistics use large tabular values with smaller, explicit labels and duration qualifications. Long duration values use a separate fitting scale; their values are unchanged. Record results are more prominent than metric labels or explanatory metadata.

Existing system fonts and theme tokens remain authoritative: background, card, muted text, primary, border and completion status. Completion-local dark-green statistics surfaces use high-contrast white values and light supporting labels. The record accent has deliberate light/dark variants and a lightly tinted surface. It is not a new global color system. There are no neon gradients, external fonts or image dependencies.

All new rules are scoped beneath `.workout-completion`; completion animation names are unique. The former completion-only CSS block was replaced, leaving logger, picker, Workout entry, Programs, History and global navigation rules untouched.

## Motion and review visits

The original decorative SVG check uses a 460ms stroke reveal after a 60ms delay. The success symbol has a 420ms opacity/5px entrance. Three metric cells receive a restrained 360ms entrance with short 90/140/190ms offsets. The complete effect finishes within about 550ms, never loops, blocks an action or plays sound.

Animation declarations apply only under `prefers-reduced-motion: no-preference`. Reduced motion shows the final check and true values immediately. Without animation support, normal final-state CSS and all semantic content remain visible. Values do not count up or temporarily display invented statistics.

Initial navigation and later review are deliberately not persisted or inferred from a query parameter. Both receive the same brief restrained entrance. No view receipt, cookie, local-storage celebration flag or extra database write is introduced. The server still validates the owned persisted completed status before rendering anything celebratory.

## Authoritative statistics and program context

`loadCompletion`, `loadTrainingSummary`, `completionDuration`, program outcomes, progression feedback and retention eligibility are unchanged. Duration still uses effective endpoints, pause exclusions and existing estimated/legacy qualifications. Qualifying working sets and performed selections retain the shared measurement rules. Pending, warm-up, skipped, removed, unsupported and invalid work do not become training through this design.

For unsupported legacy timed/assisted entries, strength-specific labels and the original explanatory note remain available. No calories, bodyweight resistance or new combined-volume calculation is invented.

The program progress bar displays prescribed sets fulfilled out of the same server-backed target count already shown as text. Its visual value is capped at that target; actual displayed counts are not changed. It does not claim a new whole-program percentage or implement completion logic. Partial Workout and the existing Review program schedule link remain distinct from closing a session; neither rendering nor expanding guidance accepts partial training, advances the cursor or ends an assignment.

Next Time is a native expandable disclosure containing the same existing maximum-three suggestions, values, units, repetition guidance and basis. Insufficient-evidence text remains inside it. Expanding it does not issue a new query or apply a load.

## Records and honest empty states

The shared `Achievements` component has an optional server-rendered `presentation="completion"` variant. Default History/records presentation retains its original content structure; only completion requests the trophy/result layout. The variant changes decoration and hierarchy, not selection or measurement.

Existing achievement ranking still supplies up to three featured records. `metricLabel` and `formattedMetric` retain exact repetitions, canonical conversion and entered-unit precision. Estimated 1RM stays explicitly estimated; bodyweight repetition records never gain fabricated load. Additional records use the same private server-backed View All Achievements route and are not discarded.

Without a PR, meaningful qualifying training receives “Another session in the books.” Empty/nonqualifying sessions say “Workout saved” and explicitly report that no qualifying working sets were recorded. They do not claim improvement, a streak or an earned award. The success check confirms a saved closed session, not fulfillment of every prescribed movement.

## Favorites, Feed and navigation

The existing `SaveFavorite` component, validated server operations, source eligibility, cap, duplicate protection and immutable structural snapshots are unchanged. The disclosure is secondary; saved state and management access remain visible. No actual sets or records are copied by this presentation.

Share to Feed · Coming Later remains a disabled native button without a handler, form, publishing endpoint, notification or public URL. Workouts remain private.

Done navigates to Dashboard and View Full Workout to the exact original session. Neither starts another workout. Refresh, direct visits, additional-record review, missing/foreign/archived/deleted handling, active-session redirection and abandoned-session History redirection keep their existing server gates. Program-ending transactions are never replayed by visual code.

## Performance, accessibility and boundaries

This remains a Server Component composition with existing small client boundaries for local time and forms. No animation library, additional client island, new data read/write, loading dependency or authentication/RLS change was introduced. The checks and trophies are small inline SVGs. Motion is decorative; headings, definition-list labels, actual values and native progress/disclosure semantics provide equivalent information without it.

Keyboard navigation, touch targets, wrapping at 375/390/430/768/1440px, both themes, reduced motion and 200% root text size are covered by local tests. Lower-page controls can scroll clear of the unchanged fixed bottom navigation. Full-page screenshots can show the fixed navigation at the original viewport boundary; separate viewport screenshots of program progress show the actual scrolled reading position.

No physical iOS/Android, production cellular, VoiceOver/TalkBack certification or hosted rollout is claimed. Later Phase 7.6E can unify typography and secondary navigation across Dashboard, Programs and History; it should preserve the established Workout entry, picker and active logger. This phase does not begin that global redesign.

Actual before/after screenshots and execution results: [phase-7-6d-validation.md](phase-7-6d-validation.md).
