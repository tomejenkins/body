"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { readWorkoutContinuity } from "@/features/continuity/actions";
import type { Continuity } from "@/features/continuity/model";
export function ActiveWorkoutBar({
  userId,
  initial,
}: {
  userId: string;
  initial?: Continuity | null;
}) {
  const pathname = usePathname();
  const [workout, setWorkout] = useState<Continuity | null>(initial ?? null);
  const [error, setError] = useState(false);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const logging =
    workout?.status === "in_progress" && pathname === `/workout/${workout.id}`;
  useEffect(() => {
    let alive = true;
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      const result = await readWorkoutContinuity();
      if (!alive) return;
      setError(!!result.error);
      if (!result.error) {
        setWorkout(result.data);
        if (result.data) {
          try {
            if (
              sessionStorage.getItem(
                `body-expiry-dismissed:${userId}:${result.data.id}`,
              )
            )
              setDismissed(result.data.id);
          } catch {}
        }
      }
    }
    void refresh();
    const interval = window.setInterval(() => {
      if (!logging) void refresh();
    }, 30000);
    const focus = () => {
      void refresh();
    };
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", focus);
    return () => {
      alive = false;
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", focus);
    };
  }, [pathname, logging, userId]);
  if (!workout || logging) return null;
  if (workout.state === "expired")
    return dismissed === workout.id ? null : (
      <aside className="active-workout-bar" aria-label="Workout update">
        <div>
          <strong>Inactive workout closed</strong>
          <p>Your saved sets were kept.</p>
        </div>
        <Link href={`/history/${workout.id}`}>Review</Link>
        <button
          type="button"
          onClick={() => {
            setDismissed(workout.id);
            try {
              sessionStorage.setItem(
                `body-expiry-dismissed:${userId}:${workout.id}`,
                "1",
              );
            } catch {}
          }}
          aria-label="Dismiss workout update"
        >
          ×
        </button>
      </aside>
    );
  if (workout.status !== "in_progress") return null;
  return (
    <aside className="active-workout-bar" aria-label="Active workout">
      <span className="workout-activity-dot" aria-hidden="true" />
      <div>
        <strong>{error ? "Review your workout" : "Workout in Progress"}</strong>
        <p>
          {error
            ? "Status could not be confirmed"
            : `${workout.completed} of ${workout.total} sets completed`}
        </p>
      </div>
      <Link href={`/workout/${workout.id}`}>Resume</Link>
    </aside>
  );
}
