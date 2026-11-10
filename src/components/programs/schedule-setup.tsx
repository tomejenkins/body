"use client";
import { useActionState } from "react";
import { configureSchedule } from "@/features/scheduling/actions";
import { SchedulingFields } from "./scheduling-fields";
import { Button } from "@/components/ui/button";
export function ScheduleSetup({
  assignment,
  timezone,
  request,
  fallbackDate,
}: {
  assignment?: string;
  timezone: string | null;
  request: string;
  fallbackDate: string;
}) {
  const [state, action, pending] = useActionState(configureSchedule, {});
  return (
    <details className="schedule-setup" open={!!assignment}>
      <summary>
        {assignment ? "Initialize your calendar" : "Scheduling timezone"}
      </summary>
      <form action={action}>
        {assignment && (
          <input type="hidden" name="assignment" value={assignment} />
        )}
        <input type="hidden" name="request" value={request} />
        <SchedulingFields
          timezone={timezone}
          fallbackDate={fallbackDate}
          includeStart={!!assignment}
        />
        <p className="set-source">
          {assignment
            ? "Scheduling starts from this date without inventing past attendance. "
            : "New program assignments use this confirmed timezone. "}
          Travel does not change an existing assignment. UTC is the fallback
          until you confirm.
        </p>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Saving…"
            : assignment
              ? "Initialize schedule"
              : "Save scheduling timezone"}
        </Button>
        {state.error && <p role="alert">{state.error}</p>}
        {state.saved && <p role="status">Scheduling preference saved.</p>}
      </form>
    </details>
  );
}
