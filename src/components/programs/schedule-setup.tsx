"use client";
import { useActionState, useState } from "react";
import { configureSchedule } from "@/features/scheduling/actions";
import { localDate } from "@/features/scheduling/model";
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
  const [zone, setZone] = useState(timezone ?? "UTC"),
    [date, setDate] = useState(fallbackDate);
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
        <label>
          Scheduling timezone
          <input
            name="timezone"
            value={zone}
            onChange={(e) => setZone(e.target.value)}
            maxLength={100}
            required
            placeholder="Europe/London"
          />
        </label>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            const device = Intl.DateTimeFormat().resolvedOptions().timeZone;
            setZone(device);
            setDate(localDate(device));
          }}
        >
          Use device timezone
        </Button>
        {assignment && (
          <label>
            Local start date
            <input
              type="date"
              name="start"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
            />
          </label>
        )}
        <label className="check-label">
          <input type="checkbox" name="confirmed" value="yes" required />
          Use this timezone for scheduling
        </label>
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
