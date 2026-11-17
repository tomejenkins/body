import Link from "next/link";
import { requireUser } from "@/features/auth/session";
import { readAccess } from "@/features/entitlements/server";
import { AccessStatus } from "@/components/entitlements/access-status";
import { BillingControl } from "@/components/billing/billing-controls";
export const metadata = { title: "Payment confirmation" };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  await requireUser("/access/return");
  const params = await searchParams;
  const access = await readAccess();
  const paid =
    access.status === "ready" &&
    access.decision.source === "subscription" &&
    access.decision.allowed;
  return (
    <>
      <div className="page-heading">
        <h1>
          {paid ? "Premium access is active" : "Confirming your billing status"}
        </h1>
        <p>
          {paid
            ? "You're ready to train."
            : "Returning from checkout does not confirm payment. If your purchase is still processing, wait a moment and refresh below. Your history is always available."}
        </p>
      </div>
      <BillingControl
        kind="refresh"
        session={
          typeof params.session_id === "string" ? params.session_id : undefined
        }
      />
      <AccessStatus result={access} />
      <Link href="/access">View Access Options</Link>
      <Link href="/history">View Workout History</Link>
    </>
  );
}
