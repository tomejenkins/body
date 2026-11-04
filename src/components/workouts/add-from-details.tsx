"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { editWorkout } from "@/features/workouts/actions";
import {
  builderHref,
  type BuilderFilters,
} from "@/features/workouts/navigation";
import { Button } from "@/components/ui/button";
export function AddFromDetails({
  workoutId,
  exerciseId,
  alreadyAdded,
  filters,
}: {
  workoutId: string;
  exerciseId: string;
  alreadyAdded: boolean;
  filters?: BuilderFilters;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const busy = useRef(false);
  const router = useRouter();
  return (
    <div className="library-section">
      <Button
        disabled={pending || alreadyAdded}
        onClick={() => {
          if (busy.current || alreadyAdded) return;
          busy.current = true;
          setError("");
          startTransition(async () => {
            const data = new FormData();
            data.set("sessionId", workoutId);
            data.set("exerciseId", exerciseId);
            data.set("operation", "add");
            try {
              const result = await editWorkout({}, data);
              if (result.error) {
                setError(result.error);
                router.refresh();
                return;
              }
              const target = builderHref(workoutId, filters);
              router.push(
                `${target}${target.includes("?") ? "&" : "?"}added=${exerciseId}`,
              );
            } catch {
              setError(
                "Selection could not be confirmed. Refresh to check your workout, then retry.",
              );
              router.refresh();
            } finally {
              busy.current = false;
            }
          });
        }}
      >
        {alreadyAdded
          ? "Already Added"
          : pending
            ? "Adding…"
            : "Add to Workout"}
      </Button>
      {!alreadyAdded && error && (
        <p role="alert" className="auth-error">
          {error}
        </p>
      )}
    </div>
  );
}
