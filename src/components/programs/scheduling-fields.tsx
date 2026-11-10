"use client";
import { useState } from "react";
import { localDate } from "@/features/scheduling/model";
import { Button } from "@/components/ui/button";
export function SchedulingFields({
  timezone,
  fallbackDate,
  includeStart = true,
  confirmedDefault = false,
}: {
  timezone: string | null;
  fallbackDate: string;
  includeStart?: boolean;
  confirmedDefault?: boolean;
}) {
  const [zone, setZone] = useState(timezone ?? "UTC"),
    [date, setDate] = useState(fallbackDate);
  return (
    <>
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
      {includeStart && (
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
        <input
          type="checkbox"
          name="confirmed"
          value="yes"
          required
          defaultChecked={confirmedDefault}
        />
        Use this timezone for scheduling
      </label>
    </>
  );
}
