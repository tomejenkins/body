"use client";
import { unstable_rethrow } from "next/navigation";
import { useActionState } from "react";
import { changeProgram } from "@/features/programs/lifecycle-actions";
import type { LifecycleKind } from "@/features/programs/enrollment-model";
import { Button } from "@/components/ui/button";
import { SchedulingFields } from "./scheduling-fields";
export function LifecycleForm({
  kind,
  assignment,
  revision = 0,
  version,
  request,
  label,
  timezone = null,
  fallbackDate,
  blocked = false,
}: {
  kind: LifecycleKind;
  assignment?: string;
  revision?: number;
  version?: string;
  request: string;
  label: string;
  timezone?: string | null;
  fallbackDate?: string;
  blocked?: boolean;
}) {
  const [state, action, pending] = useActionState(
      async (previous: { error?: string }, form: FormData) => {
        try {
          return await changeProgram(previous, form);
        } catch (error) {
          unstable_rethrow(error);
          return {
            error:
              "The program change could not be confirmed. Retry the same action when connected, or refresh to check its current state.",
          };
        }
      },
      {},
    ),
    enrolling = kind === "start" || kind === "switch";
  return (
    <form
      action={action}
      className="program-lifecycle-form"
      onReset={(event) => event.preventDefault()}
    >
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="request" value={request} />
      <input type="hidden" name="revision" value={revision} />
      {assignment && (
        <input type="hidden" name="assignment" value={assignment} />
      )}
      {version && <input type="hidden" name="version" value={version} />}
      {enrolling && fallbackDate && (
        <details className="schedule-setup" open={!timezone}>
          <summary>
            Schedule · {fallbackDate} · {timezone ?? "Confirm timezone"}
          </summary>
          <SchedulingFields
            timezone={timezone}
            fallbackDate={fallbackDate}
            confirmedDefault={!!timezone}
          />
        </details>
      )}
      {(kind === "end_now" || kind === "switch") && (
        <label className="check-label">
          <input
            type="checkbox"
            name="confirm_transition"
            value="yes"
            required
          />
          {kind === "switch"
            ? "Confirm switching programs. My existing history will be kept."
            : "Confirm ending this program now. My workouts and progress will be kept."}
        </label>
      )}
      <Button
        type="submit"
        variant={enrolling ? "default" : "outline"}
        disabled={pending || blocked}
      >
        {pending ? "Updating program…" : label}
      </Button>
      {state.error && <p role="alert">{state.error}</p>}
    </form>
  );
}
