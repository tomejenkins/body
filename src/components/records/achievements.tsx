import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
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
  presentation = "standard",
}: {
  achievements: Achievement[];
  unit: WeightUnit;
  compact?: boolean;
  heading?: string;
  presentation?: "standard" | "completion";
}) {
  if (!achievements.length) return null;
  return (
    <section
      className={cn(
        "workout-achievements",
        presentation === "completion" && "completion-achievements",
      )}
      aria-label="Workout achievements"
    >
      <h2>{heading}</h2>
      <div className="records-grid">
        {achievements.map((a) => {
          const result = (
            <>
              <h3>{a.exercise_name}</h3>
              <p>{metricLabel(a)}</p>
              <strong>
                {formattedMetric(a, unit)}
                {["actual_rm", "heaviest", "added_load"].includes(a.metric) &&
                a.reps
                  ? ` × ${a.reps}`
                  : ""}
              </strong>
            </>
          );
          return (
            <article
              className="record-card achievement-card"
              key={`${a.exercise_id}:${a.category}:${a.metric}:${a.load_key}`}
            >
              {presentation === "completion" ? (
                <>
                  <span className="completion-record-symbol" aria-hidden="true">
                    <Trophy size={21} strokeWidth={1.6} />
                  </span>
                  <div className="completion-record-result">{result}</div>
                </>
              ) : (
                result
              )}
              {!compact && (
                <p>
                  <Link href={`/exercises/${a.exercise_id}/history`}>
                    Look Back →
                  </Link>
                </p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
