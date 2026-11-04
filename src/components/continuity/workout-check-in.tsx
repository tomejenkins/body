"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { continueWorkout, finishCheckIn } from "@/features/continuity/actions";
import {
  recoveredDuration,
  type Continuity,
} from "@/features/continuity/model";
import { Button } from "@/components/ui/button";
export function WorkoutCheckIn({
  workout,
  onBusy,
  onState,
}: {
  workout: Continuity;
  onBusy?: (busy: boolean) => void;
  onState?: (state: Continuity) => void;
}) {
  const [pending, startTransition] = useTransition();
  const busy = useRef(false);
  const nonce = useRef<string | null>(null);
  const [error, setError] = useState("");
  const router = useRouter();
  const act = (choice: "resume" | "completed" | "abandoned") => {
    if (busy.current) return;
    busy.current = true;
    onBusy?.(true);
    setError("");
    nonce.current ??= crypto.randomUUID();
    startTransition(async () => {
      try {
        const result =
          choice === "resume"
            ? await continueWorkout(workout.id, nonce.current ?? "")
            : await finishCheckIn(workout.id, choice);
        if (result.data) onState?.(result.data);
        if (result.error) setError(result.error);
        if (result.data?.status === "completed")
          router.push(`/workout?message=completed&finished=${workout.id}`);
        else if (result.data?.status === "abandoned")
          router.push(`/history/${workout.id}`);
        else router.refresh();
      } catch {
        setError(
          "Your choice could not be confirmed. Check the saved workout before retrying.",
        );
      } finally {
        busy.current = false;
        onBusy?.(false);
      }
    });
  };
  return (
    <section className="workout-check-in" aria-label="Workout check-in">
      <h2>Did you finish your workout?</h2>
      <p>Your workout has been inactive. Your saved sets are still here.</p>
      {recoveredDuration(workout) ? (
        <>
          <p>Estimated workout duration: {recoveredDuration(workout)}</p>
          <p>
            This uses your last saved workout activity, not verified time
            exercising.
          </p>
        </>
      ) : (
        <p>
          There is not enough saved activity to estimate workout time. You can
          resume or close this workout without an activity estimate.
        </p>
      )}
      <div className="workout-check-in-actions">
        <Button disabled={pending} onClick={() => act("completed")}>
          Finish Workout
        </Button>
        <Button disabled={pending} onClick={() => act("resume")}>
          Resume Workout
        </Button>
        <Button
          variant="outline"
          disabled={pending}
          onClick={() => act("abandoned")}
        >
          Abandon Workout
        </Button>
      </div>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
