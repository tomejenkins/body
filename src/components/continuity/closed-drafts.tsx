"use client";
import { effortSummary } from "@/features/sets/effort";
import { useEffect, useState } from "react";
import type { Workout } from "@/features/workouts/types";
export function ClosedDrafts({ workout }: { workout: Workout }) {
  const [drafts, setDrafts] = useState<
    {
      name: string;
      weight: string;
      reps: string;
      unit: string;
      advanced: string;
    }[]
  >([]);
  const [cleared, setCleared] = useState(false);
  const key = `body-set-drafts:${workout.userId}:${workout.id}`;
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw || raw.length > 1000000) return;
      const data = JSON.parse(raw);
      const entries = data.entries as Record<
        string,
        {
          row: { workout_exercise_id: string };
          draft: {
            weight: string;
            reps: string;
            effortScale?: string;
            effortValue?: string;
            toFailure?: boolean;
          };
        }
      >;
      const recovered = Object.values(entries).flatMap((e) => {
        const item = workout.items.find(
          (i) => i.id === e.row?.workout_exercise_id,
        );
        return item &&
          typeof e.draft?.weight === "string" &&
          typeof e.draft?.reps === "string"
          ? [
              {
                name: item.name,
                weight: e.draft.weight,
                reps: e.draft.reps,
                unit: data.unit === "lb" ? "lb" : "kg",
                advanced: effortSummary({
                  effort_scale: e.draft.effortScale,
                  effort_value: e.draft.effortValue
                    ? Number(e.draft.effortValue)
                    : null,
                  performed_to_failure: e.draft.toFailure,
                }),
              },
            ]
          : [];
      });
      queueMicrotask(() => setDrafts(recovered));
    } catch {
      /* Server history remains the authority. */
    }
  }, [key, workout.items]);
  if (!drafts.length || cleared) return null;
  return (
    <section className="draft-warning" aria-label="Unapplied drafts">
      <h2>Unsaved drafts on this device</h2>
      <p>
        These inputs were not confirmed saved before the workout closed. They
        are not recorded performance. Review or copy them below.
      </p>
      <ul>
        {drafts.map((d, i) => (
          <li key={i}>
            {d.name}: {d.weight || "blank"} {d.unit}, {d.reps || "blank"} reps{" "}
            {d.advanced && ` · ${d.advanced}`}
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          sessionStorage.removeItem(key);
          setCleared(true);
        }}
      >
        Discard these local drafts
      </button>
    </section>
  );
}
