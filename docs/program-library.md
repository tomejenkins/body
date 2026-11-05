# Original Body program library — Phase 7.2

## Catalog and authorship

The catalog contains twelve original, independently written Body templates. Generic training methods are used without third-party names, logos, routines, affiliations, ratings or adoption claims. Program prose, exercise selection, set prescriptions and geometric SVG cover artwork were created for this repository; no stock photography or third-party program materials are used. Covers are abstract rotation studies, not diagrams of exercise form or actual performance charts.

| Program                       | Audience / goal                         | Ordered positions | Training sessions per rotation |
| ----------------------------- | --------------------------------------- | ----------------- | ------------------------------ |
| Full Body Foundation          | Beginner / general fitness              | 6                 | 3                              |
| Foundational Barbell Strength | Beginner / strength                     | 3                 | 3                              |
| Upper / Lower Strength & Size | Beginner–intermediate / strength + size | 4                 | 4                              |
| Push / Pull / Legs            | Intermediate / hypertrophy              | 8                 | 6                              |
| Classic Body-Part Split       | Intermediate / hypertrophy              | 7                 | 5                              |
| Classic Physique — Six Day    | Intermediate–advanced / hypertrophy     | 8                 | 6                              |
| High Intensity, Low Volume    | Intermediate–advanced / hypertrophy     | 9                 | 3                              |
| Powerbuilding                 | Intermediate / strength + size          | 4                 | 4                              |
| Strength 5×5                  | Beginner–intermediate / strength        | 6                 | 3                              |
| Three-Day Hypertrophy         | Beginner–intermediate / hypertrophy     | 6                 | 3                              |
| Dumbbell-Only Full Body       | Beginner–intermediate / strength + size | 6                 | 3                              |
| Functional Strength           | Beginner–intermediate / general fitness | 4                 | 3                              |

These are rotations, not calendar schedules. Nonconsecutive three-/four-workout sequences require recovery pauses. Eight positions with six training days correspond to about 5.25 sessions per week if followed daily; nine positions with three training days correspond to about 2.33. Descriptions explicitly explain flexible weekly frequencies and extra rest. There are 46 training days and 205 movement slots. Every training position contains meaningful working sets; rest positions contain no slots.

Beginner plans use moderate sets, RIR 3 guidance and no failure intent. Most other work targets RIR 2. The low-volume plan uses RIR 1 guidance and optional final-set failure intent only on selected isolation movements; those final prescriptions omit an effort target rather than asserting a relationship between failure and RIR. No actual performance is seeded or inferred. Warm-up guidance is prose separate from listed working sets. A 5×5 main movement does not mean every exercise is five sets of five. Loads are not automatically prescribed or progressed.

## Platform identity and ownership

Existing program/day/slot/prescription/version/clone entities remain authoritative. Body uses one restricted platform principal with no auth.users account, password, email, preferences, or workout history. profiles.principal_kind distinguishes person from platform; a stored generated auth_user_id equals id for every person and keeps the auth.users FK/cascade enforced. Only the Body principal can use platform kind, and ordinary grants exclude both new identity columns. Existing personal IDs, ownership boundaries and account deletion semantics remain intact. This is not a synthetic end-user account or a service-role client.

Official root reads require the Body principal as owner and publisher, body_authored origin, template flag, public visibility, published status, eligible publication, approved moderation, recommendation approval, no archive, an initial publication timestamp and a published version pointer. RLS independently enforces that boundary. Only the selected published immutable version becomes readable; mutable official draft children, withdrawn sources, old unselected source versions and other users' private programs stay hidden. Visibility public alone confers no access. All application loaders verify getUser() and use ordinary authenticated clients with invoker functions; no public private-data cache is introduced.

Ordinary users cannot write official roots/children, assign platform identity, approve media/moderation/verification, forge version JSON/projections, seed templates or set badges/publication dates. Authorized official versions can be cloned through the existing RPC into a private independent owner instance. Rich summaries/descriptions, cover and descriptive tags are retained. Cloning is not activation and has no UI action in this phase. Publishing withdrawal never changes a user's existing copied recipe or actual history.

## Metadata, tags and immutable publication

Programs add a unique slug, summary, restricted Markdown description, controlled cover reference, weekly/session-duration guidance ranges and flexible-rotation annotation. program_tags and program_tag_links normalize only split, style and equipment-context facets. Goal, experience and frequency come from program fields, not conflicting copies in a tag table. The combined strength_size objective and overlapping beginner_intermediate/intermediate_advanced experience values are explicit constrained classifications. Equipment-context tags describe setup classes; exact equipment IDs in program_equipment remain authoritative for compatibility. A home-gym tag is not a claim that every home contains the required equipment.

program_gallery prepares up to twenty ordered controlled media references without exposing uploads or a gallery editor. Version generation embeds rich metadata/tags/media in the existing immutable definition. program_versions.catalog_metadata is a protected, server-generated listing projection of that definition. Cards and details use the same published version even if a privileged draft changes later. Source versions and their listing projections cannot be edited by ordinary clients.

first_published_at is assigned at the authorized publication boundary, not private creation. It is immutable, including across withdrawal/republishing. New is calculated for age >= 0 and < 30 days, expiring on read without a job. Featured requires the protected platform flag; none is invented in the initial catalog. Reusable badge presentation renders at most two badges. Popular/Trending are not shown and need distinct active adoption, growth and sample thresholds in a later phase. Descriptive tags are never badge authority.

## Seed replay and updates

supabase/catalog/programs.json is the reviewed edition-1 source with stable program/version/media IDs and real exercise/taxonomy IDs from the exercise catalog. scripts/generate-program-catalog.mjs validates it and emits only the new forward seed migration. Day, slot, rule and prescription IDs derive deterministically from stable parent identity and position. Publication/creation clocks intentionally reflect installation, not fabricated historical dates.

Run `npm run programs:check` alongside `npm run catalog:check`. The generator rejects missing/incompatible canonical exercises, substitutions, equipment omissions, beginner failure/density errors, invalid prescriptions and unreviewed program titles. Database constraints and pgTAP inspect the resulting normalized rows and immutable definitions too.

The migration-only installer is private, SECURITY INVOKER and revoked from anonymous/authenticated/service-role client roles. It runs under migration administrator authority. Temporary claim context selects the platform recipe for existing owner-scoped serialization; it does not create a login or bypass client RLS, and is restored before returning. On replay, every existing version must match its source fingerprint; nothing is replaced, republished or retimestamped. An existing root without the expected version fails closed. Future content changes require a reviewed forward migration and explicit new immutable version/publication pointer, never regeneration of a deployed migration or replacement of edition 1. No hosted seed execution is authorized by local validation.

## Search, filtering and performance

/programs uses a GET form and URL filters, with a compact expandable filter group on phones. Goal, split, experience, equipment context, session frequency and style combine conjunctively with search. Reset clears them. Invalid UI facets are dropped; server RPC independently rejects unsupported, NULL or oversized parameters. Page numbers are bounded 1–10,000; six cards per page use deterministic name/UUID order and a total count. Queries use authenticated owner-safe official selection and return card metadata only, not full definitions. Full-text search covers title/summary with the PostgreSQL simple dictionary, not fuzzy spelling or personalized recommendations.

Partial published-pointer, full-text and JSON tag indexes support the catalog. Detail loads one approved definition and batches exercise/equipment/pattern names, avoiding per-slot API calls. No lifetime private-program scan, exercise-by-exercise network loop, new database cache, materialization service or adoption telemetry is added. Offset pagination is adequate for the intended thousands of catalog entries; much larger/deeper browsing should be measured before adding keyset search.

rankPrograms is a pure future-guidance helper requiring explicit preferences: primary/secondary goal scores 6/2, experience 3, split 2, feasible frequency and duration 1 each, then UUID tie order. Explicit equipment is a hard eligibility constraint and missing requirement metadata fails closed. No guidance data is inferred or written; the current library makes no personalization claim. Current account preferences have one goal, optional frequency/split and user_equipment; multi-goal/experience/duration onboarding is deferred.

## Description and media safety

The restricted renderer supports paragraphs, headings (rendered at consistent subsection level), bold/italic, single-level ordered/bulleted lists, short quotes and links. React escapes raw HTML; no HTML parser, dangerouslySetInnerHTML, scripts, CSS, iframes, arbitrary embeds or Markdown images are enabled. Links allow HTTPS without credentials or controlled root-relative paths, rejecting javascript/data/protocol-relative URLs. This intentionally small grammar is not complete CommonMark: nested lists/formatting and parenthesized destinations may render as plain text or partially literal text. Maximum description length is 20,000 characters.

Media rows contain controlled local paths, meaningful alt text, original rights and explicit approval. The UI additionally allowlists the shipped original SVG paths and falls back to the shipped generic original cover for missing/unrecognized/failed references. SVG files contain no external resources, scripts, event handlers or foreignObject. Width/height, responsive layout, lazy card loading, eager detail loading and text alternatives are explicit. Keep shipped asset paths/content stable; a future visual revision must use a new controlled path and retain assets referenced by old copies. Gallery references are schema readiness only. There are no binary images in program rows, remote image fetches or uploads.

## Future boundaries and release

7.3 adds the program builder, independent user copies, activation, execution and scheduling; the current primary action is View Program. Detail pages explicitly explain that following arrives later. 7.4 adds progression/adherence execution. 7.5 adds reviewed community search/sharing/moderation. Verified creators and separately approved brand authorization remain later work; no fake badges or rights are inferred.

Optional cardio should use a separate typed workout-definition segment with modality and duration prescription, alongside strength slots, and a separate actual-duration entry. Planned treadmill/outdoor run/elliptical/bike/stationary bike must never become invented reps, weight, strength sets or PRs. No cardio data or logging UI is introduced; HIIT is deferred. Subscription entitlement belongs in a separate access layer (trial, monthly/annual plans, promo/access grants, lifetime grants), not immutable recipes or recorded performance. Catalog visibility, entitlement, private ownership and historical retention remain separate decisions. Billing/access enforcement is not implemented here.

Apply the reviewed metadata/security migration before the seed migration and before the app rollout, only with separate hosted approval. No new environment keys/dependencies, hosted settings, remote seed/migration, production deployment or automatic merge belongs to validation. See the Phase 7.2 validation report for actual checks and remaining hosted/physical-device verification.
