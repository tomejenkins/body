# Internal record prominence — Phase 6.1

`src/features/records/prominence.ts` defines strict **primary**, **secondary** and **standard** display metadata by explicit canonical exercise UUID. It is a small internal registry, not a difficulty/training-quality ranking or record-calculation engine. It is not imported into product UI and its labels are never shown to users. No tiers, scores, estimated 1RM, achievements or progress charts are added.

## Initial assignments

Primary is exactly:

- Barbell bench press (`e8dc24a5-fac6-5190-8366-0426849f3dfb`).
- Barbell back squat (`c894e1c0-dd77-529b-86d9-3cb07bfcf5c7`).
- Conventional deadlift (`8a050222-28da-5a97-8ec2-88600106046a`).

Secondary explicitly includes incline barbell bench press, incline dumbbell press, standing barbell overhead press, standing dumbbell shoulder press, barbell front squat, barbell rack pull, sumo deadlift, barbell Romanian deadlift and trap-bar deadlift. All remaining system and custom exercises default to standard. No substring, broad movement pattern, equipment or compound/isolation classification can make a lift primary. Unknown/custom IDs still receive an ordinary valid profile; there is no eligibility exclusion or penalty for bodyweight/isolation work.

No database column is needed for this release: the metadata is versioned, validated, read-only and not yet personalized or edited at runtime. This avoids adding catalog write grants or modifying previously applied catalog SQL. If it later needs administrative editing or user configuration, use a reviewed forward schema/ownership model, not editable user metadata or broad system-catalog grants.

## Families remain separate from records

The optional bench_press family includes explicitly listed flat/incline barbell and dumbbell presses, Smith bench, close-grip and paused bench. The squat family includes back/front/Smith squats, hack/pendulum machines and dumbbell goblet squat. The hinge family includes conventional/sumo/Romanian deadlift, rack pull, trap bar and dumbbell Romanian deadlift. Family membership and display prominence are independent.

Families support navigation and future summaries only. `recordProfile(id)` always retains the original exercise ID; it never substitutes a family identity or merges set data. Incline versus flat, rack pull versus deadlift, dumbbell versus barbell, machines and Smith variations retain separate canonical histories and future PR keys. Bodyweight, added resistance and future assistance/time metrics must additionally retain their measurement distinction. No unlike loads or variations become one record.

## Future display and personalization

Phase 6.2 can use prominence to arrange featured lifts while showing achievements for every exercise, including bodyweight rep records. Personalization should allow later featured-lift choices without changing exercise identity, actual performance or record validity. Recent meaningful improvements should be highlighted from a separately tested record engine, not inferred from prominence or a rule that favors barbell-only training. The current registry does not choose weights, prescribe progression, detect records or calculate volume.

Tests prove the exact three primary IDs, variant independence, shared-family/separate-ID behavior, default custom eligibility and complete catalog coverage. Browser history tests check that internal tier/ranking terminology is absent. Future assignments require explicit reviewed catalog identities and tests, not label matching. [Workout history](workout-history.md) documents the actual-data, ownership, set-state and measurement prerequisites for Phase 6.2.
