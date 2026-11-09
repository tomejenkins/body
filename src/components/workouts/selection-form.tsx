"use client";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import {
  startSelection,
  scheduleDecision,
  saveFavorite,
  manageFavorite,
} from "@/features/workout-selection/actions";
export function SelectionForm({
  kind,
  fields,
  label,
  disabled = false,
  children,
}: {
  kind: "start" | "decision" | "save" | "manage";
  fields: Record<string, string | number>;
  label: string;
  disabled?: boolean;
  children?: React.ReactNode;
}) {
  const [state, action, pending] = useActionState(
    {
      start: startSelection,
      decision: scheduleDecision,
      save: saveFavorite,
      manage: manageFavorite,
    }[kind],
    {},
  );
  return (
    <form action={action} className="selection-form">
      {Object.entries(fields).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      {children}
      <Button type="submit" disabled={disabled || pending}>
        {pending ? "Saving…" : label}
      </Button>
      {state.error && <p role="alert">{state.error}</p>}
      {state.success && <p role="status">{state.success}</p>}
    </form>
  );
}
