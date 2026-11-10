"use client";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useWorkoutClosure } from "./workout-closure";
export function ExerciseCompletionActions({
  onAdd,
  onHome,
  atLimit,
}: {
  onAdd: () => void;
  onHome: () => void;
  atLimit: boolean;
}) {
  const closure = useWorkoutClosure();
  return (
    <section
      className="exercise-completion-actions"
      aria-label="Exercise complete actions"
    >
      <p role="status" className="sr-only">
        All shown exercise sets are saved as complete. Next Exercise returns to
        this Workout Home.
      </p>
      <Button
        type="button"
        variant="outline"
        onClick={onAdd}
        disabled={atLimit || closure?.pending}
      >
        <Plus size={16} aria-hidden="true" /> Add Set
      </Button>
      <Button type="button" onClick={onHome} disabled={closure?.pending}>
        Next Exercise <ArrowRight size={16} aria-hidden="true" />
      </Button>
    </section>
  );
}
