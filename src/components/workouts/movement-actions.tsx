"use client";
import { useState } from "react";
import type { Workout, WorkoutItem } from "@/features/workouts/types";
import type { WorkoutMovement } from "@/features/programs/execution-types";
import { Button } from "@/components/ui/button";
import { SettingsSheet } from "./settings-sheet";
import { SuggestedMovementControls } from "./suggested-movement-controls";
import { ItemControls } from "./workout-controls";
export function MovementActions({
  workout,
  movement,
  item,
  disabled,
  grouped,
  onChooseExercise,
}: {
  workout: Workout;
  movement?: WorkoutMovement;
  item?: WorkoutItem;
  disabled: boolean;
  grouped: boolean;
  onChooseExercise?: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <SettingsSheet
      label={`Manage ${movement?.label ?? item?.name ?? "movement"}`}
      title="Movement settings"
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      {movement?.suggested ? (
        <SuggestedMovementControls
          session={workout.id}
          movement={movement.id}
          options={workout.movementOptions ?? []}
          disabled={disabled || grouped}
          inline
          onSaved={() => setOpen(false)}
        />
      ) : movement ? (
        <Button
          onClick={() => {
            setOpen(false);
            onChooseExercise?.();
          }}
        >
          Change exercise
        </Button>
      ) : item ? (
        <ItemControls
          sessionId={workout.id}
          item={{ ...item, canRemove: item.canRemove && !disabled && !grouped }}
          first={workout.items[0]?.id === item.id}
          last={workout.items.at(-1)?.id === item.id}
        />
      ) : null}
    </SettingsSheet>
  );
}
