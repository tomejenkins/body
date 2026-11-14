import { Button } from "@/components/ui/button";
import Link from "next/link";
import { LocalTime } from "@/components/history/local-time";
import type { AccessResult } from "@/features/entitlements/model";
export function AccessStatus({ result }: { result: AccessResult }) {
  if (result.status !== "ready")
    return (
      <section className="account-group" role="status">
        <h2>Access could not be verified</h2>
        <p>
          Please refresh when connected. Your saved history is still available.
        </p>
        <Link href="/history">View Workout History</Link>
      </section>
    );
  const d = result.decision;
  if (!d.allowed && d.continuationAllowed)
    return (
      <p role="status">
        You can finish this workout until{" "}
        {d.continuationUntil && <LocalTime value={d.continuationUntil} />}.
      </p>
    );
  if (!d.allowed)
    return (
      <section className="account-group">
        <h2>Your free trial has ended.</h2>
        <p>Your workouts, progress and history are still here.</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Button asChild>
            <Link href="/access">View Access Options</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/history">View Workout History</Link>
          </Button>
        </div>
      </section>
    );
  return (
    <section className="account-group">
      <h2>
        {d.source === "trial"
          ? "Your 14-day trial"
          : "Training access is active"}
      </h2>
      {d.expiresAt ? (
        <p>
          Access ends <LocalTime value={d.expiresAt} />.
        </p>
      ) : (
        <p>Your access has no expiration date.</p>
      )}
    </section>
  );
}
