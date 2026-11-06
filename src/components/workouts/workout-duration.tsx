"use client";
import { useEffect, useState } from "react";
export function WorkoutDuration({
  startedAt,
  serverNow,
  inactive,
}: {
  startedAt: string;
  serverNow?: string;
  inactive?: boolean;
}) {
  const [now, setNow] = useState(serverNow ?? startedAt);
  useEffect(() => {
    const offset = serverNow ? Date.parse(serverNow) - Date.now() : 0;
    const tick = () => setNow(new Date(Date.now() + offset).toISOString());
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [serverNow]);
  const minutes = Math.max(
    0,
    Math.floor((Date.parse(now) - Date.parse(startedAt)) / 60000),
  );
  return (
    <p className="set-source" aria-label="Current workout duration">
      Elapsed session ·{" "}
      {minutes < 60
        ? `${minutes} min`
        : `${Math.floor(minutes / 60)} hr ${minutes % 60} min`}
      {inactive ? " · Includes an inactive interval" : ""}
    </p>
  );
}
