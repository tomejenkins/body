"use client";
import { useActionState, useState } from "react";
import { editSuggestedMovement } from "@/features/workouts/suggested-actions";
import {
  movementKey,
  type SuggestedMovement,
} from "@/features/workouts/suggested-shell";
import { SettingsSheet } from "./settings-sheet";
import { Button } from "@/components/ui/button";
export function SuggestedMovementControls({
  session,
  movement,
  options,
  disabled = false,
  inline = false,
  onSaved,
}: {
  session: string;
  movement?: string;
  options: SuggestedMovement[];
  disabled?: boolean;
  inline?: boolean;
  onSaved?: () => void;
}) {
  const [removeRequest] = useState(() => crypto.randomUUID());
  const [request, setRequest] = useState(() => crypto.randomUUID());
  const [choice, setChoice] = useState("");
  const [keep, setKeep] = useState(false);
  const [open, setOpen] = useState(false);
  const [state, action, busy] = useActionState(
    async (
      previous: import("@/features/workouts/suggested-actions").SuggestionState,
      form: FormData,
    ) => {
      try {
        const next = await editSuggestedMovement(previous, form);
        if (next.success) {
          setOpen(false);
          onSaved?.();
          setChoice("");
          setRequest(crypto.randomUUID());
        }
        return next;
      } catch {
        return {
          error: "Change could not be confirmed. Retry the same choice.",
        };
      }
    },
    {},
  );
  const form = (
    <div className="suggested-controls">
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
            <option value="">Choose a movement</option>
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
        <Button type="submit" disabled={busy || disabled || !choice}>
          {busy ? "Saving…" : movement ? "Update movement" : "Add movement"}
        </Button>
      </form>
      {movement && (
        <form action={action}>
          <input type="hidden" name="session" value={session} />
          <input type="hidden" name="request" value={removeRequest} />
          <input type="hidden" name="remove" value={movement} />
          <input type="hidden" name="choice" value="" />
          <Button variant="outline" disabled={busy || disabled}>
            Remove movement
          </Button>
        </form>
      )}
      <div>
        {state.error && <p role="alert">{state.error}</p>}
        {state.success && <p role="status">{state.success}</p>}
      </div>
    </div>
  );
  return inline ? (
    form
  ) : (
    <SettingsSheet
      label={movement ? "Change movement" : "Add movement"}
      title={movement ? "Change movement" : "Add movement"}
      triggerText={movement ? undefined : "Add movement"}
      open={open}
      onOpenChange={setOpen}
      disabled={disabled}
    >
      {form}
    </SettingsSheet>
  );
}
