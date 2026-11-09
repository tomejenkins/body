import Link from "next/link";
import {
  metricLabel,
  formattedMetric,
  type Achievement,
} from "@/features/records/model";
import type { WeightUnit } from "@/features/sets/model";
export function Achievements({
  achievements,
  unit,
  compact = false,
  heading = "New Personal Bests",
}: {
  achievements: Achievement[];
  unit: WeightUnit;
  compact?: boolean;
  heading?: string;
}) {
  if (!achievements.length) return null;
  return (
    <section className="workout-achievements" aria-label="Workout achievements">
      <h2>{heading}</h2>
      <div className="records-grid">
        {achievements.map((a) => (
          <article
            className="record-card achievement-card"
            key={`${a.exercise_id}:${a.category}:${a.metric}:${a.load_key}`}
          >
            <h3>{a.exercise_name}</h3>
            <p>{metricLabel(a)}</p>
            <strong>
              {formattedMetric(a, unit)}
              {["actual_rm", "heaviest", "added_load"].includes(a.metric) &&
              a.reps
                ? ` × ${a.reps}`
                : ""}
            </strong>
            {!compact && (
              <p>
                <Link href={`/exercises/${a.exercise_id}/history`}>
                  Look Back →
                </Link>
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
