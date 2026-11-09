import { randomUUID } from "node:crypto";
import type { AssignedChoices } from "@/features/workout-selection/model";
import { dateOffset } from "@/features/scheduling/model";
import { SelectionForm } from "./selection-form";
export function ScheduleDecisions({
  assignment: a,
  disabled = false,
}: {
  assignment: AssignedChoices;
  disabled?: boolean;
}) {
  const c = a.cursor,
    next = a.days.find((d) => d.id === c.dayId);
  if (c.complete || !next) return null;
  const fields = {
    assignment: a.id,
    version: a.version,
    day: c.dayId,
    rotation: c.rotation,
    expected: c.workIndex,
    revision: c.decisionRevision,
  };
  return (
    <details className="schedule-decisions">
      <summary>Plan next workout</summary>
      <p>
        {next.name} · Rotation {c.rotation + 1} · {a.timezone}
      </p>
      {disabled && (
        <p>
          Finish or resume your active workout before changing the schedule.
        </p>
      )}
      {next.partialSession && (
        <section>
          <h3>Partial training recorded</h3>
          <p>
            Your saved sets stay partial. Acceptance resolves this occurrence
            for scheduling only.
          </p>
          <SelectionForm
            kind="decision"
            fields={{
              ...fields,
              kind: "accept_partial",
              session: next.partialSession,
              request: randomUUID(),
            }}
            label="Accept Partial & Continue"
            disabled={disabled}
          >
            <label className="check-label">
              <input type="checkbox" name="confirmed" value="yes" required />
              Continue without inventing the missing work
            </label>
          </SelectionForm>
        </section>
      )}
      <details>
        <summary>Postpone this workout</summary>
        <p>
          The original due date stays recorded. Later workouts shift without
          completing this one.
        </p>
        <SelectionForm
          kind="decision"
          fields={{
            ...fields,
            kind: "defer",
            request: randomUUID(),
            confirmed: "yes",
          }}
          label={c.deferredUntil ? "Replace deferral" : "Defer workout"}
          disabled={disabled}
        >
          <label>
            Future local date
            <input
              type="date"
              name="date"
              required
              defaultValue={
                c.deferredUntil ??
                dateOffset(
                  c.naturalReadyOn > a.today ? c.naturalReadyOn : a.today,
                  1,
                )
              }
            />
          </label>
        </SelectionForm>
        {c.deferredUntil && (
          <SelectionForm
            kind="decision"
            fields={{
              ...fields,
              kind: "cancel_defer",
              request: randomUUID(),
              confirmed: "yes",
            }}
            label="Cancel deferral"
            disabled={disabled}
          />
        )}
      </details>
      <details>
        <summary>Skip this workout</summary>
        <p>
          Advance past this occurrence without recording training. A skipped
          position does not count toward a fully completed rotation.
        </p>
        <SelectionForm
          kind="decision"
          fields={{ ...fields, kind: "skip", request: randomUUID() }}
          label="Confirm skip"
          disabled={disabled}
        >
          <label className="check-label">
            <input type="checkbox" name="confirmed" value="yes" required />
            Skip this occurrence without completing it
          </label>
        </SelectionForm>
      </details>
    </details>
  );
}
