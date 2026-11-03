# Exercise visuals — Phase 4.2 / 5.1

Body uses original, local SVG pictograms, with no stock photography, image service, media database columns, uploads or new dependencies. They are symbolic movement hints, not exercise-specific coaching or animated demonstrations. Shapes are intentionally simple at 48–128px, with explicit dimensions and system light/dark palettes.

## Resolution and coverage

`src/features/exercises/visuals.ts` is a UI-independent allowlisted resolver. It returns ordered descriptors, not arbitrary user-supplied paths:

1. System exercise-specific slug override, when registered.
2. Known primary movement-pattern slug.
3. Generic exercise pictogram.

Custom exercises always start with their chosen primary movement pattern, even if a name/slug resembles a system exercise. Legacy/unclassified or unavailable sources use generic art. The rendering component also advances through fallbacks on a failed image request; if every file fails, an inline accessible placeholder prevents a broken-image loop.

The 183-entry initial system catalog resolves to **8 specific mappings and 175 movement fallbacks**. There are **29 movement-pattern files and one generic file**, for 38 SVG assets total. Some related families reuse a pose; file/mapping counts do not imply 38 distinct anatomical illustrations. No seeded exercise needs the generic fallback in normal operation.

- `public/exercise-thumbnails/`: eight registered specific overrides.
- `public/movement-patterns/`: 29 family fallbacks.
- `public/ui/exercise.svg`: generic fallback.
- `src/components/exercises/exercise-thumbnail.tsx`: reusable Next Image wrapper, unoptimized for local SVG delivery on Workers.

The specific-image namespace deliberately avoids `/exercises/`, which is an authenticated application route. Static image requests therefore do not perform session refresh or conflict with library detail routing. SVGs contain no scripts, remote resources, fonts or user content. The browser reuses cached family assets across cards; intrinsic sizes avoid layout shifts and default lazy loading avoids eagerly loading the whole catalog.

## Usage and authoring

Library cards and the reusable selector share the same thumbnail component. Details show a larger, labeled image. Workout selections carry only a minimal visual descriptor derived from the visible source exercise's current primary classification; names/instructions remain the saved workout snapshots. Archived source exercises remain resolvable under owner/system RLS. An unavailable source safely falls back.

Adjacent exercise names make card/list images decorative (`alt=""`); the detail visual has descriptive alternative text identifying the exercise or movement family. Thumbnails do not replace labels, equipment requirements or instructions. Exercise type remains independent of media.

To improve art, replace the relevant reviewed local SVG without changing catalog IDs. Register a new specific slug in the resolver only for a system catalog exercise. Keep palettes, intrinsic viewBox, small payloads and no external/script content. Add resolver/asset tests for any new mapping; never construct paths directly from arbitrary custom input. Future catalog snapshots need an updated coverage test; do not regenerate an applied catalog migration to attach media.

## Future media

The resolver/component boundary can later return a richer media descriptor while library, workout and native clients keep the same domain exercise identity. Improved illustrations can replace local assets first. Animations/video need explicit playback, reduced-motion and loading behavior. Trainer/custom uploads require separately reviewed storage ownership/RLS, validated content and sizes, moderation and private/signed delivery where needed. None of that infrastructure or upload UI exists in this phase.
