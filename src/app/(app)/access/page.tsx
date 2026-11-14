import Link from "next/link";
import { readAccess } from "@/features/entitlements/server";
import { AccessStatus } from "@/components/entitlements/access-status";
export const metadata = { title: "Access options" };
export default async function Page() {
  return (
    <>
      <div className="page-heading">
        <h1>Access options</h1>
        <p>
          Subscriptions are coming in a future update. Checkout is not available
          yet.
        </p>
      </div>
      <AccessStatus result={await readAccess()} />
      <p>Your saved workouts and progress remain available.</p>
      <Link href="/history">View Workout History</Link>
    </>
  );
}
