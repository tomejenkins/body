# Intelligent PR recognition — Phase 6.3

Performance records and achievement recognition are separate. Exact records retain what actually happened. Highlight suppression cannot erase a Best Triple, rewrite a set, substitute another repetition count, or change a record's source workout/date. Best Single/Triple/Five-Rep Set describes observed exact reps; it is not proof the set was a true maximal-effort attempt. Estimated 1RM stays separately labeled with the existing validated Epley calculation.

## Dominance

For the same exact exercise ID and category, A dominates B when canonical load(A) >= load(B), actual reps(A) >= reps(B), and at least one comparison is strict. Compare stored 0.001-kg precision, never rounded display pounds. Thus 225 × 5 dominates 225 × 3; neither 235 × 3 nor 185 × 10 dominates 225 × 5. Equal points are ties, not dominance or a new PR.

Loaded, added-bodyweight and unweighted bodyweight categories never compete. Unweighted bodyweight compares reps with NULL external resistance; it never assumes body mass. Different exercises, families, machine/barbell variants, assistance and duration do not share identities. Only the established completed actual nonwarmup source participates. These observations do not establish effort or physiological equivalence.

## Historical and temporal rules

The batch `achievement_candidates` first applies the retained strict improvement rules against earlier eligible history of the same metric/category/key, using actual performance time and stable session IDs, never administrative finish time. Baselines, ties, unrecognized historical imports and abandoned sessions stay uncelebrated.

Strength/rep/estimate candidates whose source set is dominated by an earlier eligible performance from a different session are suppressed from recognition only. Session-volume records use their aggregate improvement rule; a single-set dominance test cannot erase an actual session-volume improvement. Both history and postfinish use the same candidate engine.

A second stronger point in the current session does not delete a genuine historical improvement candidate. Instead dominated_in_session annotates it for ranking. Both exact triples and fives remain available as records; the UI can highlight the stronger comparable demonstration without multiple redundant cards. Historical corrections can rebuild both candidates and current records from source; no announcement table or performance rewrite exists.

## Deterministic selection

At most three cards, at most one per exercise. Existing metric weights remain: heaviest/added/bodyweight reps 40, exact rep 35, reps-at-load 30, Estimated 1RM 25, volume 20. Score adds capped relative improvement percentage × 0.5 and hidden prominence bonus (10/5/0). A current-session-dominated candidate receives a 30-point ranking penalty, not invalidation.

Greedy selection adds 10 points for a not-yet-represented achievement category (strength, reps, estimate or volume), then selects the best remaining exercise. Stable exercise/metric/category/load-key ties make input ordering irrelevant. Existing prominence can influence placement but any exercise can qualify; no tier labels appear in UI. History counts use the same meaningful candidates, capped at three distinct exercises, matching the UI count.

Refreshes and repeated closes return derived stable results without duplicate announcement events. A future authorized historical correction/deletion re-evaluates earlier bests, dominance and candidates. Full historical editing is not introduced here.

## Validation

SQL tests prove prior five-rep dominance suppresses a triple celebration while preserving the exact triple value, relevant older history is consulted, load/rep tradeoffs remain eligible, current stronger points do not erase candidates, baselines/ties remain excluded and owner isolation survives aggregate reads. TypeScript tests cover precision, incomparable identities/modes, deterministic category/exercise diversity and the top-three cap. Browser tests cover suppressed recognition alongside visible exact records, a genuine heavier triple celebration, refresh stability and record provenance.
