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
}: {
  achievements: Achievement[];
  unit: WeightUnit;
}) {
  if (!achievements.length) return null;
  return (
    <section className="workout-achievements" aria-label="Workout achievements">
      <h2>New Personal Bests</h2>
      <div className="records-grid">
        {achievements.map((a) => (
          <article
            className="record-card achievement-card"
            key={`${a.exercise_id}:${a.category}:${a.metric}:${a.load_key}`}
          >
            <h3>{a.exercise_name}</h3>
            <p>{metricLabel(a)}</p>
            <strong>{formattedMetric(a, unit)}</strong>
            <p>
              <Link href={`/exercises/${a.exercise_id}/history`}>
                Look Back →
              </Link>
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
