"use client";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { changeWorkoutRetention } from "@/features/retention/actions";
export function WorkoutRetention({
  session,
  revision,
  archived,
  request,
}: {
  session: string;
  revision: number;
  archived: boolean;
  request: string;
}) {
  const [kind, setKind] = useState<"archive" | "restore" | "delete" | null>(
      null,
    ),
    [state, action, pending] = useActionState(changeWorkoutRetention, {});
  const [requests] = useState(() => ({
    archive: request,
    restore: crypto.randomUUID(),
    delete: crypto.randomUUID(),
  }));
  return (
    <section className="workout-retention" aria-label="Manage Workout">
      <h2>Manage Workout</h2>
      {kind ? (
        <form
          action={action}
          key={kind}
          aria-label={`${kind} workout confirmation`}
        >
          <input type="hidden" name="session" value={session} />
          <input type="hidden" name="revision" value={revision} />
          <input type="hidden" name="request" value={requests[kind]} />
          <input type="hidden" name="kind" value={kind} />
          <h3>
            {kind === "delete"
              ? "Delete this workout permanently?"
              : kind === "archive"
                ? "Archive this workout?"
                : "Restore this workout?"}
          </h3>
          <p>
            {kind === "delete"
              ? "Your recorded sets and performance from this workout will be removed from your history, personal records and progress calculations. This cannot be undone in Body."
              : kind === "archive"
                ? "This workout will be hidden from your normal History and excluded from your active performance statistics. You can restore it later."
                : "This workout will return to normal History. Valid training will count toward your records and progress again."}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              name="confirmed"
              value="yes"
              required
              disabled={pending}
            />{" "}
            {kind === "delete"
              ? "I understand this cannot be undone."
              : "Confirm this change."}
          </label>
          <div className="retention-actions">
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setKind(null)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              variant={kind === "delete" ? "destructive" : "default"}
              disabled={pending}
            >
              {pending
                ? "Updating workout…"
                : kind === "delete"
                  ? "Delete Permanently"
                  : kind === "archive"
                    ? "Confirm Archive"
                    : "Restore Workout"}
            </Button>
          </div>
        </form>
      ) : (
        <div className="retention-actions">
          <Button
            type="button"
            variant="outline"
            onClick={() => setKind(archived ? "restore" : "archive")}
          >
            {archived ? "Restore Workout" : "Archive Workout"}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setKind("delete")}
          >
            Delete Workout
          </Button>
        </div>
      )}
      {state.error && <p role="alert">{state.error}</p>}
    </section>
  );
}
