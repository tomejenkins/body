"use client";
import { useRouter } from "next/navigation";
import { useActionState } from "react";
import {
  startWorkout,
  editWorkout,
  endWorkout,
} from "@/features/workouts/actions";
import type { WorkoutItem, WorkoutState } from "@/features/workouts/types";
import { Button } from "@/components/ui/button";
const initial: WorkoutState = {};
function Feedback({ state }: { state: WorkoutState }) {
  return (
    <>
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
      {state.success && (
        <p role="status" className="workout-feedback">
          {state.success}
        </p>
      )}
    </>
  );
}
export function StartWorkout() {
  const router = useRouter();
  return (
    <Button type="button" onClick={() => router.push("/workout/new")}>
      Record Workout
    </Button>
  );
}
export function StartBlankWorkout() {
  const [state, action, pending] = useActionState(startWorkout, initial);
  return (
    <form action={action}>
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Opening workout…" : "Start Blank Workout"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
export function CloseWorkout({
  sessionId,
  outcome,
  disabled = false,
}: {
  sessionId: string;
  outcome: "completed" | "abandoned";
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(endWorkout, initial);
  return (
    <form action={action}>
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="outcome" value={outcome} />
      <Button
        variant={outcome === "completed" ? "default" : "outline"}
        type="submit"
        disabled={pending || disabled}
        aria-busy={pending}
      >
        {pending
          ? "Closing workout…"
          : outcome === "completed"
            ? "Finish workout"
            : "Abandon workout"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
export function ItemControls({
  sessionId,
  item,
  first,
  last,
}: {
  sessionId: string;
  item: WorkoutItem;
  first: boolean;
  last: boolean;
}) {
  const [state, action, pending] = useActionState(editWorkout, initial);
  const [removed, removeAction, removing] = useActionState(
    editWorkout,
    initial,
  );
  return (
    <div className="workout-item-controls">
      <form action={action}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="operation" value="move" />
        <Button
          type="submit"
          name="direction"
          value="-1"
          variant="outline"
          disabled={first || pending || removing}
          aria-label={`Move ${item.name} up`}
        >
          ↑
        </Button>
        <Button
          type="submit"
          name="direction"
          value="1"
          variant="outline"
          disabled={last || pending || removing}
          aria-label={`Move ${item.name} down`}
        >
          ↓
        </Button>
      </form>
      <form action={removeAction}>
        <input type="hidden" name="sessionId" value={sessionId} />
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="operation" value="remove" />
        <Button
          type="submit"
          variant="outline"
          disabled={!item.canRemove || pending || removing}
          aria-label={`Remove ${item.name}`}
        >
          {removing ? "Removing…" : "Remove"}
        </Button>
      </form>
      {!item.canRemove && <p>Recorded selections stay with your workout.</p>}
      <Feedback state={state} />
      <Feedback state={removed} />
    </div>
  );
}
