import { LocalTime } from "@/components/history/local-time";
import Link from "next/link";
import {
  formattedMetric,
  metricLabel,
  type ExerciseRecords,
} from "@/features/records/model";
import type { WeightUnit } from "@/features/sets/model";
export function RecordCard({
  record,
  unit,
  compact = false,
}: {
  record: ExerciseRecords;
  unit: WeightUnit;
  compact?: boolean;
}) {
  const metrics = record.metrics
    .filter((m) => m.metric !== "actual_rm" || m.category === "loaded")
    .filter((m) => !compact || m.metric !== "volume");
  return (
    <section className="record-card">
      {!compact && <h3>{record.name}</h3>}
      <dl>
        {metrics.map((m) => (
          <div key={`${m.category}:${m.metric}:${m.load_key}`}>
            <dt>{metricLabel(m)}</dt>
            <dd>
              {formattedMetric(m, unit)}
              <small>
                <LocalTime value={m.performed_at} />
              </small>
              <Link href={`/history/${m.session_id}`}>
                View record workout →
              </Link>
              {m.reps !== null &&
                m.metric !== "bodyweight_reps" &&
                m.metric !== "reps_at_load" && (
                  <small>
                    {m.metric === "estimated_1rm" && m.weight_kg !== null
                      ? `From ${formattedMetric({ ...m, metric: "heaviest", value: m.weight_kg }, unit)} × ${m.reps}`
                      : `${m.reps} actual reps`}
                    {m.metric === "estimated_1rm"
                      ? " · Estimate, not an actual single"
                      : ""}
                  </small>
                )}
            </dd>
          </div>
        ))}
      </dl>
      {!compact && (
        <Link href={`/exercises/${record.exercise_id}/history`}>
          Look Back →
        </Link>
      )}
    </section>
  );
}
