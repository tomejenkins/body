"use client";
import { useActionState, useState } from "react";
import { editSuggestedMovement } from "@/features/workouts/suggested-actions";
import {
  movementKey,
  type SuggestedMovement,
} from "@/features/workouts/suggested-shell";
import { Button } from "@/components/ui/button";
export function SuggestedMovementControls({
  session,
  movement,
  options,
  disabled = false,
}: {
  session: string;
  movement?: string;
  options: SuggestedMovement[];
  disabled?: boolean;
}) {
  const [state, action, busy] = useActionState(editSuggestedMovement, {});
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [choice, setChoice] = useState("");
  const [keep, setKeep] = useState(false);
  return (
    <details className="suggested-controls">
      <summary>
        {movement ? "Change or remove movement" : "Add movement"}
      </summary>
      <form action={action}>
        <input type="hidden" name="session" value={session} />
        <input type="hidden" name="request" value={request} />
        {movement && <input type="hidden" name="remove" value={movement} />}
        <label>
          Movement
          <select
            name="choice"
            value={choice}
            onChange={(e) => {
              setChoice(e.target.value);
              setRequest(crypto.randomUUID());
              setKeep(false);
            }}
            disabled={busy || disabled}
          >
            <option value="">
              {movement ? "Remove unrecorded movement" : "Choose a movement"}
            </option>
            {options.map((o) => (
              <option value={movementKey(o)} key={movementKey(o)}>
                {o.title} · {o.exerciseType}
              </option>
            ))}
          </select>
        </label>
        {state.needsConfirmation && (
          <label className="check-label">
            <input
              type="checkbox"
              name="keep"
              value="yes"
              required
              checked={keep}
              onChange={(e) => setKeep(e.target.checked)}
            />
            Keep recorded movement and add the changed movement
          </label>
        )}
        <Button type="submit" disabled={busy || disabled}>
          {busy ? "Saving…" : movement ? "Update movement" : "Add movement"}
        </Button>
        {state.error && <p role="alert">{state.error}</p>}
        {state.success && <p role="status">{state.success}</p>}
      </form>
    </details>
  );
}
