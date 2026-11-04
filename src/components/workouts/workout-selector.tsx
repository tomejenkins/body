"use client";
import { useState, useTransition, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ExerciseSelector } from "@/components/exercises/exercise-selector";
import { Button } from "@/components/ui/button";
import { editWorkout } from "@/features/workouts/actions";
import type { BuilderFilters } from "@/features/workouts/navigation";
import type { Library } from "@/features/exercises/types";
import type { Workout, WorkoutState } from "@/features/workouts/types";
export function WorkoutSelector({
  library,
  workout,
  initialFilters,
  added = false,
}: {
  library: Library;
  workout: Workout;
  initialFilters?: BuilderFilters;
  added?: boolean;
}) {
  const [state, setState] = useState<WorkoutState>({});
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const busy = useRef(false);
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">BUILD YOUR WORKOUT</p>
        <h1>Choose your movements.</h1>
        <p className="intro">
          One tap to add. Your selections stay with this workout.
        </p>
        <div className="library-heading-actions">
          <Button asChild>
            <Link href={`/workout/${workout.id}`}>
              Done · {workout.items.length} selected
            </Link>
          </Button>
        </div>
      </div>
      {added && (
        <p role="status" className="auth-success">
          Exercise added to your workout.
        </p>
      )}
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="auth-success">
          {state.success}
        </p>
      )}
      <ExerciseSelector
        library={library}
        workoutId={workout.id}
        initialFilters={initialFilters}
        selectedIds={workout.items.map((i) => i.exerciseId)}
        selecting={pending}
        onSelect={(exercise) => {
          if (
            busy.current ||
            workout.items.some((i) => i.exerciseId === exercise.id)
          )
            return;
          busy.current = true;
          startTransition(async () => {
            const data = new FormData();
            data.set("sessionId", workout.id);
            data.set("operation", "add");
            data.set("exerciseId", exercise.id);
            try {
              const result = await editWorkout({}, data);
              setState(result);
              if (!result.error) {
                router.refresh();
              }
            } catch {
              setState({
                error:
                  "Your selection could not be confirmed. Refresh to check your workout, then retry.",
              });
            } finally {
              busy.current = false;
            }
          });
        }}
      />
    </>
  );
}
