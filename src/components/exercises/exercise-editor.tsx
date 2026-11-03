"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { parseExercise } from "@/features/exercises/validation";
import { saveExercise } from "@/features/exercises/actions";
import {
  exerciseTypes,
  type Exercise,
  type Library,
  type MutationState,
  type Taxon,
} from "@/features/exercises/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
export function ExerciseEditor({
  library,
  exercise,
}: {
  library: Library;
  exercise?: Exercise;
}) {
  const [state, action, pending] = useActionState(
    async (previous: MutationState, data: FormData): Promise<MutationState> => {
      try {
        const input = parseExercise(data);
        const none = library.equipment.find((e) => e.slug === "none")?.id;
        if (
          none &&
          input.equipmentIds.includes(none) &&
          input.equipmentIds.length > 1
        )
          return {
            error: "Choose None on its own, or select the required equipment.",
          };
      } catch (error) {
        return {
          error:
            error instanceof Error
              ? error.message
              : "Check the exercise fields.",
        };
      }
      return saveExercise(previous, data);
    },
    {},
  );
  const [name, setName] = useState(exercise?.name ?? "");
  const [type, setType] = useState(exercise?.exerciseType ?? "");
  const [pattern, setPattern] = useState(exercise?.primaryPatternId ?? "");
  const [instructions, setInstructions] = useState(
    exercise?.instructions ?? "",
  );
  const [selections, setSelections] = useState<Record<string, string[]>>({
    secondaryPatternIds: exercise?.secondaryPatternIds ?? [],
    primaryMuscleIds: exercise?.primaryMuscleIds ?? [],
    secondaryMuscleIds: exercise?.secondaryMuscleIds ?? [],
    equipmentIds: exercise?.equipmentIds ?? [],
  });
  function choices(
    key: string,
    label: string,
    items: Taxon[],
    required = false,
  ) {
    return (
      <fieldset>
        <legend>
          {label}
          {required ? " · required" : " · optional"}
        </legend>
        <div className="equipment-options">
          {items.map((item) => (
            <label key={item.id} className="check-label">
              <input
                name={key}
                type="checkbox"
                value={item.id}
                checked={selections[key].includes(item.id)}
                disabled={pending}
                onChange={(e) =>
                  setSelections({
                    ...selections,
                    [key]: e.target.checked
                      ? [...selections[key], item.id]
                      : selections[key].filter((id) => id !== item.id),
                  })
                }
              />
              {item.name}
            </label>
          ))}
        </div>
      </fieldset>
    );
  }
  if (state.id)
    return (
      <section className="empty-state">
        <h2>Ready when you are.</h2>
        <p role="status">{state.success}</p>
        <Button asChild>
          <Link href={`/exercises/${state.id}`}>View exercise</Link>
        </Button>
      </section>
    );
  return (
    <form action={action} className="library-form exercise-editor">
      {exercise && <input type="hidden" name="id" value={exercise.id} />}
      <label htmlFor="exercise-name">Exercise name</label>
      <Input
        id="exercise-name"
        name="name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        maxLength={200}
        required
        disabled={pending}
      />
      <label htmlFor="exercise-type">Exercise type</label>
      <select
        id="exercise-type"
        name="exerciseType"
        value={type}
        onChange={(e) => setType(e.target.value)}
        required
        disabled={pending}
      >
        <option value="">Choose a type</option>
        {exerciseTypes.map((t) => (
          <option value={t} key={t}>
            {t[0].toUpperCase() + t.slice(1)}
          </option>
        ))}
      </select>
      <p>
        Compound: meaningful movement at multiple joints. Isolation: primarily
        one joint. Other: holds, carries or movements where that distinction
        misleads.
      </p>
      <label htmlFor="primary-pattern">Primary movement pattern</label>
      <select
        id="primary-pattern"
        name="primaryPatternId"
        value={pattern}
        onChange={(e) => setPattern(e.target.value)}
        required
        disabled={pending}
      >
        <option value="">Choose a movement</option>
        {library.patterns.map((p) => (
          <option value={p.id} key={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {choices("primaryMuscleIds", "Primary muscles", library.muscles, true)}
      {choices("equipmentIds", "Required equipment", library.equipment, true)}
      <p>
        Select every required item. Choose None on its own for equipment-free
        movements. Do not select interchangeable alternatives together.
      </p>
      <details>
        <summary>Additional classifications and instructions</summary>
        {choices(
          "secondaryPatternIds",
          "Secondary movement patterns",
          library.patterns,
        )}
        {choices("secondaryMuscleIds", "Secondary muscles", library.muscles)}
        <label htmlFor="exercise-instructions">Instructions or notes</label>
        <textarea
          id="exercise-instructions"
          name="instructions"
          maxLength={3000}
          rows={5}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={pending}
        />
      </details>
      {state.error && (
        <p role="alert" className="auth-error">
          {state.error}
        </p>
      )}
      <Button type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "Saving…" : "Save exercise"}
      </Button>
      <Link href={exercise ? `/exercises/${exercise.id}` : "/exercises"}>
        Cancel
      </Link>
      <p className="library-note">
        Only you can see and manage this custom exercise.
      </p>
    </form>
  );
}
