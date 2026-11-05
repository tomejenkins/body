"use client";
import Link from "next/link";
import { useActionState } from "react";
import { startProgramWorkout } from "@/features/programs/execution-actions";
import { Button } from "@/components/ui/button";
export function StartProgramWorkout({
  version,
  day,
  number,
  request,
}: {
  version: string;
  day: number;
  number: number;
  request: string;
}) {
  const [state, action, pending] = useActionState(startProgramWorkout, {});
  return (
    <form action={action}>
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="workout" value={day} />
      <input type="hidden" name="request" value={request} />
      <Button type="submit" disabled={pending}>
        {pending ? "Opening workout…" : `Start Workout ${number}`}
      </Button>
      {state.error && (
        <p role="alert">
          {state.error} <Link href="/workout">Resume Workout</Link>
        </p>
      )}
      <p className="program-meta">Choose each exercise inside your workout.</p>
    </form>
  );
}
