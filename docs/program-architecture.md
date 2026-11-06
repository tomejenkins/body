# Program architecture — Phase 7.1

Phase 7.1 extends the existing programs, program_days, program_slots and program_assignments model. It adds no parallel program engine and no program browser/editor, activation, calendar scheduler, progression executor, public catalog or moderation workflow. The Programs route remains its honest placeholder. Typed domain contracts live in `src/features/programs`; SQL remains in root `supabase/migrations`.

## Ownership and publisher identity

Each program has a private profile owner, publisher identity, name/description, constrained objective/experience, equipment requirements, estimated sessions per week, optional duration in rotations, draft lifecycle, source origin, visibility and platform publication controls. NULL duration means open-ended. Frequency is descriptive guidance, not a seven-day sequence constraint.

Origins distinguish body_authored, user_created, user_copy and authorized_creator without a hardcoded global owner. Ordinary creation assigns the authenticated owner as publisher and user_created origin. Clone construction assigns user_copy and server-derived source attribution; clients cannot impersonate Body or another publisher. Existing is_template remains a private recipe designation, never official catalog authority.

Visibility defaults private. A user may store public intent, but existing owner-only RLS still hides the root and every child from all other ordinary users. Publication status, eligibility, moderation and recommendation eligibility are separate protected fields. A public value cannot approve moderation, remove publisher restrictions or imply a Body recommendation. There is no public-read policy or publishing endpoint in 7.1: those are closed release gates requiring a reviewed later migration/workflow.

## Rotations, rest and phases

Cycle length remains an integer 1–366. program_days has a unique position within that cycle, an explicit rest flag, optional focus/notes, phase-number annotation and optional min/max rest-hours guidance. A day is a rotation position, not Monday–Sunday. Three-, five-, eight- and ten-day programs use the same model. Rest days cannot hold movement slots; rest-hours guidance does not place workouts on calendar dates.

A draft can be incomplete during future editing. Version creation requires one day at every position and at least one slot on each training day. Phase numbers allow future multiweek grouping; phase-specific progression/scheduling behavior is deferred, not executed by this annotation. `nextRotationPosition` is a validated pure sequencing helper, not an assignment-advancement or scheduling service.

## Movement slots and planned sets

program_slots retains its ordered position, movement pattern/default exercise, aggregate sets/rep/load/rest guidance and notes. It adds primary-muscle target, independent compound/isolation/other requirement, optional designation, optional explicit exercise lock, rest range and progression-rule reference. A slot requires a movement pattern, primary muscle or default exercise; it is not permanently bound to one exercise unless exercise_locked is true.

program_slot_equipment contains permitted equipment IDs from the existing taxonomy. Empty means unrestricted; otherwise an eligible exercise's full non-None equipment combination must be contained in the permitted list, retaining station-specific identity. program_slot_alternatives contains ordered canonical exercise IDs. Default/alternative checks use readable nonarchived catalog records, the existing movement mappings, primary muscle role, independent exercise type and equipment requirements. No family pooling or fallback exercise fabrication. Tightening a slot or equipment list revalidates the choices atomically. Later custom/catalog edits can change eligibility; version creation revalidates it again rather than silently accepting obsolete defaults.

program_set_prescriptions records ordered set-level intent: retained set type, fixed/ranged reps, optional canonical kg/bodyweight mode or textual load guidance, optional RPE/RIR target, independent intended failure, rest and notes. These are not actual sets. If explicit per-set prescriptions exist, a version requires their count/positions to match target_sets; otherwise the legacy aggregate prescription remains supported. No actual workout session/set is created by authoring, versioning or cloning a recipe.

Protected actual-set prescription-effort columns and session source-version/version-number snapshots prepare Phase 7.3. They are NULL for today's ad-hoc flow and have no ordinary write grants. Existing session/exercise/set snapshot architecture remains the execution target; future activation must populate snapshots through reviewed owner-scoped RPCs, not live mutable-plan joins.

## Progression configuration

program_progression_rules is normalized and scoped to the same program/owner as its slots. Config version 1 uses typed columns, not executable expressions:

| Strategy           | Required configuration                                   |
| ------------------ | -------------------------------------------------------- |
| fixed / manual     | No automatic parameters                                  |
| linear_load        | Positive canonical kg step, at most 1,000 kg             |
| double_progression | Positive load step, integer rep step and valid rep range |
| rep_progression    | Integer rep step and valid rep range                     |
| effort_guided      | Positive load step and validated RPE/RIR target          |

Reps/steps are bounded 1–1,000; effort validation matches the logging scale contract. Irrelevant parameters are rejected. `validateProgression` and `progressionColumns` expose reusable strict TypeScript contracts. No rule executes or recommends load in 7.1; Phase 7.4 supplies execution, history evaluation and correction semantics.

## Immutable source versions and safe copies

program_versions is the immutable recipe boundary, not another editable program tree. A snapshot serializes schema version 1 from normalized root/equipment/rules/days/slots/choices/prescriptions. Definition JSON and monotonic version numbers are generated in the database, limited to 5 MiB, and cannot be submitted or edited by ordinary clients. This deliberate immutable snapshot is distinct from the editable normalized draft. The legacy programs.revision draft field is not the immutable source-version authority.

snapshot_program serializes on the owner root. Every structural child writer locks that root, with NOWAIT for child-first direct DML to avoid reverse-lock waits. Composite owner/parent FKs prevent orphan/foreign nesting and cross-program rule references. A failed snapshot/clone is transactional. program_definition reads only the authenticated owner's editable recipe; versions may be cloned only when RLS allows reading the source. In 7.1 that means own versions only. Future approved Body/community source policies can admit explicitly approved source snapshots without changing copy ownership or global source-version attribution references.

clone_program takes a readable immutable version, name and retry UUID. It locks the owner's profile to serialize retries, creates a new private user-owned root, allocates new day/slot/rule/prescription identities, remaps rule references and preserves recipe ordering. Publication privileges, source publisher identity and moderation approvals are never inherited. Source edits/version 2 cannot mutate a version-1 copy. The same request UUID returns the original copy; using it for a different source is rejected. UI-independent server repository helpers verify getUser() and validate IDs before these invoker RPCs.

Source attribution retains version/program/publisher identity, source name and source version. An approved deletion of an unreferenced source leaves immutable versions with NULL program_id and keeps independent copies/actuals. Existing FKs deliberately restrict deletion of roots that are still referenced by actual history; archival/unpublishing is the ordinary safe lifecycle. Deleting a live planned slot can clear legacy provenance under the existing history protections but cannot rewrite performed values. Immutable version records cannot be deleted by ordinary clients. Future approved administrative deletion of a version can clear pointers while retaining attribution/version/name snapshots and actual performance.

Cloning can fail honestly if referenced exercises have become unreadable or incompatible; it never fabricates replacements. Larger partial-edit/rebase/upgrade workflows are deferred.

## Future publishing, moderation and creators

The following foundation tables enable RLS and revoke all ordinary and service-role client privileges. They have no public write endpoints, forms or badges:

- program_brands: organization/brand identity.
- creator_accounts: separate identity verification, public-profile metadata, platform publishing privilege, reviewer/timestamps/notes.
- creator_affiliations: reviewed organization affiliation, distinct from rights to a program.
- creator_brand_authorizations: explicit brand/creator/program scope (program/assets/both), approval, expiration and revocation.
- program_reports: program identity, reporter, copyright/trademark/impersonation/misleading-affiliation/inappropriate/other category, explanation, optional HTTPS reference, status and moderator action/review.
- program_admin_events: append-oriented audit records with stable entity identities, actor, action, explanation and timestamp, preserving context when mutable targets are removed.

Verified identity is not IP authorization. An approved affiliation is not a license. Public intent is not publishing permission, and public publication is not official recommendation. Only a future authorized platform administrative path may set these controls. No new broad admin bypass, self-issued verification, brand keyword removal, uploads or licensing UI exists. Administrative audit writing/review and enforcement of live expiration/revocation are future workflow responsibilities; tables alone do not launch them.

Phase 7.2 adds the reviewed Body seed/library release gates; Phase 7.3 adds creation/editing and snapshot-based execution/activation; Phase 7.4 executes typed progression rules; Phase 7.5 adds reviewed community publishing, reporting/moderation and search. Creator onboarding/verification/badges and branded third-party publication remain later work. No private source becomes discoverable merely because a user toggles visibility.

## Security, tests and rollout

All client-facing program RPCs are SECURITY INVOKER with empty search paths, verified auth.uid(), existing owner RLS and no caller owner/publisher argument. New user children have narrow operation/column grants and composite ownership constraints; platform metadata and protected actual-history targets have no client writes. Anonymous/service-role RPC access and private-helper execution remain revoked. Existing system taxonomy/catalog writes remain denied.

The two forward migrations leave all previously applied SQL immutable. Local tests cover rotations/rest, choices, prescription/rule validation, version/copy isolation, idempotence, source-deletion history safety, public-intent nondiscoverability, all platform-table ACLs, and advanced logging privacy/concurrency. Apply reviewed migrations in timestamp order before approved application rollout. No hosted SQL, migration-history repair, production deployment or automatic merge belongs to Phase 7.1 validation.

## Phase 7.2 official library

The [program library](program-library.md) adds a non-login platform principal, controlled rich metadata/media/tags and an explicit RLS-approved immutable official source boundary. It preserves existing owner entities and source/copy isolation. Cards use protected published-version projections; draft changes do not rewrite published content. User publishing, activation, scheduling, progression execution, cardio, billing and creator workflows remain deferred.

## Phase 7.3 direct execution and in-workout choices

See [in-workout exercise selection](in-workout-exercise-selection.md). Program workouts start directly in Workout Home with immutable unselected movement snapshots. The two-screen amendment opens a focused, URL-addressable exercise logger only after a tile is selected; safe Back navigation retains the shared queue and drafts. Home permits one expanded carousel and derives status from saved qualifying performance. Actual exercise entries bind only after selection; explicit continuations retain prior performance and exact remaining planned-set identities. Last choice is derived from eligible completed performance for that exact slot, never a global or browse-based preference. This adds the start/execution contract for future scheduled occurrences, not a full calendar/editor/activation manager. Match labels are a presentation/ranking layer; the existing authoring taxonomy and actual PR identity stay unchanged.

## Phase 7.4 execution of progression rules

[Program progression](program-progression.md) now evaluates immutable typed rules against eligible exact-exercise actual history and binds future sessions to existing versioned assignments. Rotation summaries are derived from saved performances, with explicit rest, partial and abandoned semantics. No calendar deadlines, second workout engine or writable derived recommendation store is introduced. See the linked document for formulas, conservative bounds, history windows, correction behavior and release requirements.

## Phase 7.5A adaptive scheduling

[Adaptive program scheduling](adaptive-program-scheduling.md) extends the same assignments, immutable versions and session snapshots with explicit local-date/timezone configuration and a shared server cursor/calendar. It introduces no second execution/history engine or community functionality. Legacy calendars are initialized explicitly; full/partial and out-of-order identities remain tied to actual saved evidence.
