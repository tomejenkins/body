import Link from "next/link";
import { formattedMetric, metricLabel } from "@/features/records/model";
import {
  enrollmentDuration,
  strengthHighlights,
  comparisonChange,
  type Enrollment,
} from "@/features/programs/enrollment-model";
import type { WeightUnit } from "@/features/sets/model";
export function EnrollmentSummary({
  enrollment: a,
  unit,
  current = false,
}: {
  enrollment: Enrollment;
  unit: WeightUnit;
  current?: boolean;
}) {
  const highlights = strengthHighlights(a.comparisons);
  return (
    <article
      className={
        current ? "program-progress enrollment-card" : "enrollment-card"
      }
      aria-label={current ? "Current program" : "Program enrollment"}
    >
      <h2>
        <Link
          href={current ? "/programs/current" : `/history/programs/${a.id}`}
        >
          {a.name}
        </Link>
      </h2>
      <p>
        {a.status} · {enrollmentDuration(a)}
      </p>
      <p className="enrollment-count">
        <strong>{a.workouts}</strong> workouts completed
      </p>
      {a.provenance === "server" && (
        <p className="set-source">
          Started{" "}
          <time dateTime={a.startedAt}>
            {new Intl.DateTimeFormat("en-US", {
              dateStyle: "medium",
              timeZone: a.timezone,
            }).format(new Date(a.startedAt))}
          </time>
        </p>
      )}
      {a.state === "active" && (
        <p className="set-source">
          Rotation {a.currentRotation} · {a.completedRotations} complete
          rotations
        </p>
      )}
      {highlights.map((c) => (
        <p key={c.exerciseId}>
          <strong>{c.name}</strong> {comparisonChange(c, unit)}
        </p>
      ))}
      {a.pendingEnd && (
        <p role="status">
          Program will end after your next completed program workout.
        </p>
      )}
      {a.completionEvidenceChanged && (
        <p className="set-source">
          Your program ending is preserved. Current retained training history is
          incomplete.
        </p>
      )}
      {current && (
        <div className="enrollment-links">
          <Link href="/programs/current">Continue / View Program</Link>
          <Link href="/programs/current#manage-program">Manage Program</Link>
        </div>
      )}
    </article>
  );
}
export function EnrollmentStrength({
  enrollment: a,
  unit,
}: {
  enrollment: Enrollment;
  unit: WeightUnit;
}) {
  return (
    <section
      className="enrollment-strength"
      aria-label="Strength during this enrollment"
    >
      <h2>Strength during this enrollment</h2>
      <p className="set-source">
        First comparable session → best strictly later performance. Exact
        repetitions and estimates are separate.
      </p>
      {a.comparisons.length ? (
        <div className="enrollment-comparisons">
          {a.comparisons.map((c) => (
            <article
              key={`${c.exerciseId}:${c.category}:${c.metric}:${c.reps}`}
            >
              <h3>{c.name}</h3>
              <p>{metricLabel(c.baseline)}</p>
              <p>
                {formattedMetric(c.baseline, unit)}
                {c.metric === "actual_rm" ? ` × ${c.reps}` : ""}
                {c.later
                  ? ` → ${formattedMetric(c.later, unit)}${c.metric === "actual_rm" ? ` × ${c.reps}` : ""}`
                  : ""}
              </p>
              <strong>{comparisonChange(c, unit)}</strong>
              <p className="enrollment-links">
                <Link href={`/history/${c.baseline.session_id}`}>
                  First workout
                </Link>
                {c.later && (
                  <Link href={`/history/${c.later.session_id}`}>
                    Later workout
                  </Link>
                )}
              </p>
            </article>
          ))}
        </div>
      ) : (
        <p>No comparable strength history yet.</p>
      )}
      {a.comparisonCount > a.comparisons.length && (
        <p>
          Showing the first {a.comparisons.length} of {a.comparisonCount}{" "}
          supported comparisons.
        </p>
      )}
    </section>
  );
}
