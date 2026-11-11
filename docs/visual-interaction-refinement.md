# Visual and interaction refinement

Phase 7.6E starts from PR #31, merged main `c276d269d2dff1d5bbc9c22d3c484cdd0251ab3b`. The contextual-interaction addendum governs the design: common actions remain direct, while uncommon actions may use a small menu or sheet. This is not a ban on disclosure.

## Visual language and boundaries

The existing theme, system font stack, locally owned Button and Radix primitives remain authoritative. New `--ui-*` tokens in `app-ux.css` define a 2–2.8rem page title, 1.2rem section heading, 2–2.6rem metric, 0.8rem caption, 18px surface corner, responsive 16–24px padding, subtle elevation and a green-tinted neutral surface. Existing primary/card/border/secondary variables supply both themes. The contextual destructive text has a separate contrast-safe dark-theme token; destructive buttons retain the existing treatment.

These styles target `.refined-screen` on Dashboard, Programs, History and their detail/enrollment surfaces. They do not replace global heading, Button or navigation rules. Workout tab primary actions, setup, Full Body/exercise-first, movement tiles, logger fields, Add Set/Next Exercise, fixed footer, timer, pause/recovery and closure review retain their existing design and authority. The Phase 7.6D.1 opaque sticky header and safe-area rules remain intact. Completion only changes its shared Favorite action and saved wording; its hero, halo, statistics, records and Done position are unchanged.

No new font, image, UI framework, paid service or dependency is introduced. Program artwork is the existing allowlisted catalog artwork.

## Dashboard

The heading loses the repeated brand eyebrow and long supporting copy. The existing seven-day schedule remains the main surface: stronger date hierarchy, separate today/selected styling, a larger selected-workout title and restrained tinted detail panel. On recovery/future dates, the existing authoritative `schedule.next` becomes a readable Next workout summary rather than a small line below the controls. It introduces no new recommendation or start eligibility calculation.

All calendar states, date membership, keyboard navigation, partial/overdue/rest meanings, and one-tap start fields remain on the existing engine. An empty date remains No scheduled activity; it never becomes invented rest. Active-session Resume still wins.

Recent totals sum only the existing saved summaries of the **up to three completed workouts shown below**, explicitly labeled Last N completed workouts. Working-set and personal-best counts are not lifetime totals, new metrics, streaks or inferred improvements. Recent cards reuse the existing history values. Shortcuts adapt their column count at increased text size instead of allowing icons to overflow.

## Programs and enrollment progress

Catalog cards use stronger names, quieter metadata, bounded summary previews and existing imagery. Full descriptions remain readable on the detail route. Search and direct View/Start/Switch/Continue links retain their existing destinations and immutable version inputs.

The full calendar moves below the catalog so it no longer obscures browsing. A direct **View Schedule** anchor reaches it in one activation. Existing Dashboard full-schedule links and adjacent-week URLs keep the same `#program-calendar` target; the unconfigured calendar now has that target too. Current Program still presents its full calendar. No schedule data is hidden or recalculated by the presentation layer.

Enrollment cards emphasize the existing exact-assignment workout count, truthful state, duration and up to two eligible lift improvements. The catalog's current-enrollment summary combines its start/rotation metadata more compactly. History enrollments remain separate even when their names match.

**Manage Program** opens a compact in-app panel with the existing Switch, End After Next, Cancel Scheduled End and confirmed End Now operations. Links from the current-enrollment card/history may open this panel directly using `?manage=1#manage-program`; that query only controls presentation and performs no transition. All command payloads, confirmations, revisions, locking, active-workout restrictions and ending semantics are unchanged.

## History

Workouts | Programs remains the two-segment selector, defaulting to Workouts. Archived Workouts remains secondary access, not a third segment. Both segments keep bounded pagination and exact enrollment/workout identities.

The shared HistoryCard emphasizes name/date, actual completed working-set and selected-exercise counts, truthful status, qualified duration and existing achievements. Warm-up/incomplete counts remain visible with quieter typography. The whole card remains a normal same-window workout-detail link. Program cards emphasize the existing counts/durations and extend the title link's hit area across the card. No strength or qualification engine is added.

Workout/program details retain actual saved sets, source attribution, measurement caveats, progression, retained evidence and pagination. Archive/Restore/Delete stay secondary and keep existing explicit confirmations and authoritative operations.

## One-tap Favorite creation

One reusable SaveFavorite server wrapper and SaveFavoriteButton replace the naming disclosure at all existing locations: recommended/alternative days, program detail, eligible History review and Workout Complete.

The user taps **Save as Favorite** once. There is no textbox, modal, confirmation or required disclosure. Pending shows Saving… and prevents duplicate local submissions. Confirmed success shows Saved to Favorites in place. A transport rejection or server failure keeps actionable feedback and the same retry UUID; success is never inferred from the tap. The client is keyed by exact source type/version-or-session/day and the authoritative saved/removed state, and retains its initial UUID across unchanged-state server revalidation. A different source gets a fresh component state, so a prior saved confirmation cannot leak to a new recommendation. A real removal resets the control and supplies a fresh save request; restoring the shortcut retains its existing custom name and immutable structure.

The Server Action verifies the user and reads the authorized source:

- Program day: exact readable immutable version and matching non-rest day; use that day's human-readable name.
- Independent completion: exact owned, completed, unarchived, non-program session; use its human-readable name. The existing friendly-workout formatter normalizes the generic ad-hoc title to Workout.

Blank defaults use Workout, and defaults are bounded to the existing 100-character validation cap. No dates, invented labels or numeric suffixes are appended. Caller-submitted `name` fields are ignored during creation. Renaming remains a separate validated operation.

The existing `save_favorite_workout` RPC still validates source ownership/visibility, actual qualifying training, cap, source-key uniqueness, nonce reuse and structural snapshots. A post-RPC owner/ID/active-row read confirms that the receipt still identifies a retained Favorite; an archived receipt cannot produce false saved feedback. No SQL, RLS, grant or migration changes are needed.

A request-local React cache deduplicates the bounded active-Favorite key read (maximum 100) across server-rendered save locations. It is not a persistent or cross-owner cache. Initial saved states come from owner-scoped rows. Stale unsaved devices safely converge through the existing locked, idempotent RPC. State remains a point-in-time read; no new subscription, polling or offline synchronization model is introduced.

Saving copies only the existing validated reusable structure, never actual weights/repetitions, completed sets, PRs, schedule resolutions or assignment progress. Independently starting a Favorite remains independent training.

## Favorite management and contextual menus

Workout → Your Favorites remains the home for management. Cards show concise attribution, a visible Start Workout action and an accessible ellipsis button named Manage [Favorite]. Its anchored menu contains exactly **Rename** and **Remove**.

Radix portals/collision handling keep the small menu in the current viewport/window. Outside pointer interaction and Escape close it; selection closes the menu. Arrow/Enter keyboard behavior, labels and highlighted focus styling remain available. The menu layer is above the fixed header, tabs and workout controls.

Rename opens an automatically focused, selected name field in a compact dialog. Remove opens the existing confirmation checkbox and destructive operation. Editors become bottom sheets on narrow screens with bounded scrolling and safe-area padding; they do not open another route, browser tab or full-screen builder. Only confirmed server success closes an editor. Closing returns focus to its trigger, or to Your Favorites when a removed trigger no longer exists.

Removing a Favorite archives the shortcut using the existing owner-scoped operation. It does not archive/delete any workout or alter immutable attribution. Existing 100-character rename validation and Remove confirmation remain intact.

## Disclosure inventory

Counts below are **source sites**, not the potentially many per-set/per-day rendered instances. Before: 34 native `<details>` sites. After: 31. Custom workout accordions and the new contextual menu are separate from this native count.

| Original interaction                                                                                              | Decision                                                  | Reason                                                                       |
| ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Save as Favorite (1 site, reused across routes)                                                                   | Eliminate; direct one-tap action                          | Routine save needs no naming/configuration step                              |
| Favorite management (1)                                                                                           | Replace with two-item contextual menu and compact editors | Keep infrequent editing/removal out of creation and primary Start            |
| Manage Program (1)                                                                                                | Replace with direct management panel                      | Discoverable deliberate management with existing consequential confirmations |
| Lifecycle/schedule setup and calendar timezone (3)                                                                | Retain                                                    | Infrequent configuration; required missing settings stay expanded            |
| Program progress methodology, About, prescriptions, catalog filters (4)                                           | Retain                                                    | Optional explanation/long content and advanced filtering                     |
| Alternate program workouts, blank setup options, schedule decisions, suggested movement controls (6)              | Retain                                                    | Protect the highly rated entry flow and deliberate overrides                 |
| Logger explanations/options/instructions/management, movement alternatives, exercise filters/editor metadata (10) | Retain                                                    | Protected workout/picker flow; advanced or lengthy content                   |
| Analytics tables/methodology and exact-load records (6)                                                           | Retain                                                    | Optional detailed data without crowding the primary view                     |
| History movement targets and completion progression detail (2)                                                    | Retain                                                    | Useful extended information, not a routine action prerequisite               |

## Interaction counts

Counts begin on the relevant screen and exclude navigation to that screen, typing and necessary destructive confirmation. Inspection of prefilled text is not counted as a tap.

| Task                                | Before                                                         | After                                                                         |
| ----------------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Save completed workout as Favorite  | Open disclosure + submit: 2 activations, optional name editing | Save as Favorite: 1                                                           |
| Save program day as Favorite        | Open disclosure + submit: 2, optional name editing             | Save as Favorite: 1                                                           |
| Recognize already-saved source      | Open form/retry to discover existing save                      | Visible saved state: 0                                                        |
| Start recommended workout           | 1                                                              | 1; unchanged validated operation                                              |
| Start Favorite                      | 1                                                              | 1; unchanged independent launch                                               |
| Rename Favorite                     | Manage + focus field + submit: 3, plus typing                  | Ellipsis + Rename + submit: 3, autofocus, automatic confirmed close           |
| Remove Favorite                     | Manage + confirm + Remove: 3                                   | Ellipsis + Remove + confirm + Remove: 4; deliberately secondary and protected |
| Switch program from details         | Direct Switch entry + required confirmation/submit             | Same; safety confirmation retained                                            |
| Open History                        | Direct navigation                                              | Same; no intermediate page                                                    |
| Manage current program from summary | Follow management link + open disclosure                       | Direct panel-opening link: 1                                                  |

The intent is lower friction and clearer hierarchy, not maximizing deleted menus. The addendum's compact contextual pattern takes precedence over interpreting caret reduction as exposing every action.

## Accessibility and release boundaries

All actions use native links/buttons/forms and existing owner validation. Menu and dialog titles, descriptive trigger labels, focus return, Escape/outside dismissal and visible focus states are explicit. Statuses have text as well as color. Stable minmax segment columns and responsive shortcut columns support text scaling. Long names wrap, content remains above safe-area-aware navigation, and no new motion is required.

See [validation and screenshots](phase-7-6e-validation.md) for actual results and limitations. Chromium mobile/keyboard/200% root-font tests are not physical Safari, Dynamic Type or VoiceOver verification. The Supabase documentation/changelog host was unavailable under the managed network policy; this phase reuses the installed SDK and unchanged reviewed SQL rather than introducing a new Supabase API. No hosted database, infrastructure, deployment or merge is part of this work.
