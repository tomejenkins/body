# Exercise library and movement engine — Phase 4.1

The library lives at `/exercises`, reached from **Workout → Explore exercise library**. It uses the existing protected application shell, verified Supabase sessions and owner RLS. The mobile navigation remains six items; Workout stays active inside the library. Email/password remains the only MVP authentication method; Google/Apple are deferred to V2/V3.

## Catalog and classification

The initial authored catalog contains **183 exercises: 105 compound, 63 isolation, 15 other**. Its reviewable source snapshot is `supabase/catalog/exercises.json`. Every record has a deterministic UUIDv5 ID, canonical underscore slug, name, explicit type, one primary movement, primary muscles, conjunctive equipment requirements, concise movement notes and system ownership (`owner_id IS NULL`). Active status is `archived_at IS NULL`. Names are not identity. Taxonomy IDs use the same fixed namespace with separate kind prefixes.

The 29 movement patterns distinguish horizontal/incline/vertical pressing; horizontal/vertical pulling; shoulder abduction, flexion, horizontal adduction/abduction and extension; elbow flexion/extension; squat, hinge, bridge, lunge, knee extension/flexion, calf raise, hip abduction/adduction; spinal flexion, anti-extension, anti-rotation, rotation and lateral core; carries, scapular elevation and functional strength. This avoids forcing flies, raises or core stability into push/pull/legs.

A primary pattern describes the main task. Secondary patterns are explicit compatibility classifications, not inferred from muscle overlap: incline presses also carry horizontal push, but chest flies are horizontal adduction, not compound pressing. A secondary match is eligible for its declared pattern; a primary match ranks ahead of it. No exercise receives duplicate primary/secondary links from the editor.

The 19 muscle groups distinguish pectorals, anterior/lateral/posterior deltoids, lats, upper back, trapezius, biceps, triceps, quads, hamstrings, glutes, calves, abdominals, obliques, erectors, hip abductors/adductors and forearms. Multiple primary muscles are supported; secondary muscles represent assistance/stabilization. A browsing muscle filter matches either declared role, while cards prioritize primary muscles. Recommendation muscle targets are stricter: only primary muscles qualify, so a lat pullover cannot fill a pectoral-isolation slot just because the chest assists.

### Compound, isolation and other

`exercises.exercise_type` is a non-null database column constrained to `compound`, `isolation`, `other`, independent of every movement, muscle and equipment relationship.

- **Compound:** meaningful movement at multiple joints. Presses, rows, pull-ups, squats, leg presses, lunges and Romanian deadlifts follow conventional strength-training classification. The hinge family includes controlled knee/hip participation, not just the number of muscles recruited.
- **Isolation:** the intended action primarily moves one joint or joint action. Curls, extensions, lateral raises, fly variations, calf raises and shrugs qualify; stabilization by additional muscles does not make them compound. Crunches are classified by their intended spinal-flexion task.
- **Other:** holds, carries, anti-motion drills and complex functional movements where a joint-count label obscures the task. Planks, bird dogs, dead bugs, carries and Turkish get-ups use this label even when limbs move.

Ambiguous exercises are classified by the named technique, not by equipment or how many muscles they engage. Dynamic hip thrust/bridge variations are classified compound; fixed-joint or specialized variants should be reviewed separately. Rotational cable chops and bicycle crunches use multiple moving segments and are compound. Face pulls include elbow and shoulder movement and are compound; reverse flies keep the elbow angle approximately fixed and are isolation. This is a programming aid, not a medical claim or substitute for technique coaching. New variations need human review rather than automatic inference.

Existing exercises are preserved, assigned stable `legacy_<uuid>` slugs and conservatively defaulted to `other`; owners should review their custom classification through the editor. Their historical names/IDs are not replaced. Legacy links default to non-primary instead of arbitrarily choosing a primary. New/edited UI entries require explicit type, primary movement, primary muscles and equipment. Low-level legacy direct inserts remain permitted by existing owner grants; incomplete equipment classifications are never assumed equipment-free by recommendations.

### Equipment

All `exercise_equipment` rows are **AND requirements**. A dumbbell bench press needs dumbbells **and** a flat bench; barbell bench presses additionally require a rack. Incline exercises use an adjustable bench rather than requiring both bench alternatives. The equipment-free `none` row stands alone and is always available. Unknown/missing equipment is not equivalent to `none`.

Specific machine stations are distinct equipment entries: owning a leg-extension station does not imply a chest press, leg curl or every selectorized machine. Broad selectorized/plate-loaded taxonomy entries remain available for custom descriptions, but curated entries use specific stations. Typical integral handles/attachments are assumed; neutral-grip pull-up handles, hand support for leaning raises and a stable squat box are explicit additional requirements. The model does not yet express OR groups or infer that one bench/device substitutes for another. Do not list alternatives together or broaden eligibility to fill recommendations.

The browser's equipment filter is optional: unchecked means browse all. Checked with no selected equipment means equipment-free only. Checked selections require the full equipment subset, and combine with movement, muscle, type, search, favorites and custom filters. Existing `user_equipment` can initialize the selection; changes in this screen are temporary and do not overwrite saved equipment configuration. Search is local/deferred after loading authenticated data; results display 24 at a time with Show more. All database pages are fetched without silently truncating at PostgREST's default row limit.

## Migrations and safe delivery

Apply in timestamp order after the two existing immutable migrations:

1. `20261103202739_exercise_library_classification.sql`: stable slug/type columns, maximum-one-primary index, narrow authenticated column grants and an atomic custom-editor function.
2. `20261103202740_curated_exercise_catalog.sql`: transactional taxonomy, exercise and junction INSERTs under migration privileges. No real user records, client seeding, destructive cleanup, broad grants or history changes.

Catalog data belongs in a versioned migration, **not** local-only `seed.sql`, so approved deployments get the same required data. Plain INSERTs fail atomically on identity/slug conflicts instead of overwriting unrelated or user-created data. Fresh replay produces one copy; the normal migration history applies each file once. If an existing hosted catalog conflicts, stop for review; never delete or repair history to force this migration through.

`npm run catalog:check` verifies that the initial source snapshot matches its generated SQL. `node scripts/generate-exercise-catalog.mjs` is an authoring tool for this new, unapplied snapshot only; it never connects to a database. **After shared application, freeze both snapshot and migration.** Future catalog corrections/additions need a new snapshot/forward migration and review; do not regenerate an applied migration.

```sh
npm run supabase -- start # Docker/local Auth and Mailpit; see authentication guide for proxy caveat
npm run db:reset         # destructive ONLY to disposable local data
npm run db:lint
npm run db:test
npm run catalog:check
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npm run cf:build
npm run cf:check          # packaging dry-run, no deployment
```

Use the existing three public authentication variables and local Mailpit setup in [authentication.md](authentication.md). Browser tests refuse hosted Supabase and app targets. For local Worker tests, build with the canonical origin `http://127.0.0.1:8787`, run `cf:preview`, and set `PLAYWRIGHT_BASE_URL` to that origin. No new secrets or dependencies are needed.

No hosted SQL, migration push, production data or infrastructure changes are performed by this phase. A reviewer must verify the target project, migration order, backup/PITR readiness and forward recovery plan, then explicitly approve delivery through the existing single mechanism. Confirm that existing hosted catalogs do not conflict and that auth/RLS preflight passes. Deploy reviewed migrations before enabling this application version; a missing schema produces a retry/error screen, not client-side fallback data. Do not enable a second migration deployer.

Phase 4.1 builds on Phase 3.1 authentication. At implementation start, remote `main` still lacked that commit, so a PR against `main` may include the authentication dependency until its own PR merges. No phase is merged automatically. Publishing the migration branch requires safe preview settings; prior repository-wide user confirmation of disabled Supabase Automatic branching is the available authorization evidence, not an independent live dashboard check. Cloudflare branch previews may still build; this phase does not authorize production deployment.

## Custom privacy and writes

Catalog reads require a signed-in identity. System type and classification writes remain denied to ordinary users. Custom exercises are private to their creator, checked using verified `auth.uid()` rather than form ownership or JWT metadata. Existing IDs, owner keys, timestamps and slugs have no client UPDATE grants. The new type UPDATE grant is still constrained by owner RLS; it cannot modify system or other-user exercises.

`public.save_custom_exercise` is **SECURITY INVOKER**, with an empty search path, explicit authenticated EXECUTE and no anonymous/service-role EXECUTE. It takes no owner parameter and cannot administer the catalog. Every underlying query still requires ordinary column grants and RLS. It validates active taxonomy IDs, bounded arrays/text, required fields, disjoint roles and None equipment semantics. It locks an owned active row before edits, then saves the exercise and replaces links in one transaction. A failed insert/edit rolls back the whole operation. New forms validate shared rules on client and server; database checks remain authoritative.

Archiving updates only the owned active row's `archived_at`; no exercise DELETE is introduced. Archived rows stop appearing in browsing/recommendations but remain readable under existing RLS for historical references. There is no unarchive UI in this phase. A future archive manager can add a deliberate restoration flow. Actions return safe retry messages, preserve editable form fields on errors and verify identity on every write. Pages are dynamic; the server adapter retains private/no-store behavior.

Favorite and preferred/neutral/avoid are independent columns in existing `user_exercise_preferences`. Absolute favorite updates preserve preference and notes. Select/insert/update with a duplicate-insert retry avoids upserting immutable owner keys. Avoided exercises remain browseable but are excluded from recommendations. No custom/system exercise is publicly exposed.

## Deterministic recommendations

`src/features/exercises/recommendations.ts` is plain TypeScript with no React, SDK, network, AI or external API dependency. Future logging/program/substitution/trainer clients can call it. `ExerciseSelector` accepts an optional `onSelect` callback for embedding; browsing itself writes no workout or selection history.

Inputs support movement, muscle and optional exercise type; available equipment; per-exercise preference/favorite; ordered real recents; exclusions; current workout IDs; optional explicit duplicate allowance; and a limit bounded to 1–5 (default 5).

Hard eligibility rejects archived, avoided, excluded and current-workout exercises (unless explicit duplicates allowed). A specified pattern must match a declared primary/secondary pattern; a specified recommendation muscle must match a declared **primary** muscle (incidental assistance does not qualify a programming target); a specified type must match exactly, including `other`. Every equipment requirement must be available. Missing equipment configuration admits only explicit equipment-free matches. A set of IDs prevents duplicate candidates even if input rows repeat.

Eligible candidates score:

| Signal                                                   |        Weight |
| -------------------------------------------------------- | ------------: |
| Primary required pattern (secondary match receives zero) |          1000 |
| Explicit preferred                                       |           100 |
| Favorite                                                 |            10 |
| Real recent familiarity, zero-based position `i`         | `5 / (i + 1)` |

Priority tiers are intentional: a secondary movement match cannot win through favorites alone. Ties sort by canonical slug then stable ID using code-point comparisons. Input ordering does not affect results. Each result carries reasons; fewer than five valid candidates returns that pool with a limited-choice explanation. There are no fabricated filler exercises or random ranking signals.

A future slot can express compound horizontal push, isolation pectorals, compound quads or isolation arms as independent constraints. Future programming may call this service per slot while carrying forward selected IDs to avoid duplicates. This phase does **not** generate programs or prescribe suitability, intensity, sets, reps or injury-specific advice.

## History and testing

Recents come from the owner's latest 200 actual `workout_exercises` selection rows, ordered by creation time/ID and deduplicated. No browse click or recommendation writes synthetic history, and no duplicate recents table is added. Existing selection records, including in-progress selections, count as familiarity, not proof of completed reps. New users see an honest fallback and still receive deterministic recommendations. Archived exercises are excluded from the live recents list; historical snapshots remain independent of current catalog names.

Database suites retain existing invariants/grant tests with updated exact allowlists and fixture-scoped taxonomy counts. The new suite verifies seeded count/types, valid normalized links, uniqueness, authenticated reads, denied system writes, atomic private creation/edit, malformed input rejection, cross-user isolation, independent preferences and archive/history safety. Unit tests cover hard constraints, combined filters, ranking reasons, determinism, unknown equipment, no history, exclusions and duplicate/limited pools. Browser tests exercise search, combined filters, type constraints, favorites, private editing, real local recents and archives on desktop/mobile. No hosted users or production records are created.

Known limits: no exercise media, injury screening, equipment alternatives, persistent filter UI settings, unarchive UI, program generator, workout logger, OAuth, social/trainer features or offline private-data cache. Catalog content should continue to receive qualified human review; it is not a complete catalog of every exercise technique.

## Validation record — 2026-11-03

- Catalog/source SQL consistency, ESLint, strict typecheck and Prettier: passed.
- Vitest: **74 tests passed** across 12 files.
- Fresh disposable local migration replay: passed in timestamp order; old migrations unchanged.
- Local database lint: no errors; pgTAP: **1,089 tests passed** across 3 files, including an injected mid-edit failure that rolls back classifications and the exercise row together.
- Production Next.js build, OpenNext build and Wrangler dry-run: passed. No upload/deployment command was executed.
- Final-source Playwright: **22 desktop/mobile tests passed against Next.js and 22 against the local Workers emulator**. New library tests also reject browser runtime/hydration errors. Light/dark mobile layout was visually reviewed.
- Hosted migration state/advisors, real SMTP, production delivery and physical-device behavior were not verified. Local Auth's known proxy health-probe caveat and optional local Worker `Request.cf` fallback are documented in the infrastructure/authentication guides; real local auth and data flows passed.

Before enabling live use: review the authentication dependency and the two SQL migrations, confirm the target and nonconflicting catalog, obtain explicit hosted-change approval, apply through the single approved integration, verify RLS/catalog counts in that target, then approve application deployment with the existing public build/runtime configuration. This record grants no remote-write or production-deployment approval.
