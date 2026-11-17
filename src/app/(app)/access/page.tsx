import Link from "next/link";
import { LocalTime } from "@/components/history/local-time";
import { requireUser } from "@/features/auth/session";
import { readAccess } from "@/features/entitlements/server";
import { AccessStatus } from "@/components/entitlements/access-status";
import {
  billingConfig,
  stripeClient,
  verifyCatalog,
} from "@/features/billing/config";
import { readBilling } from "@/features/billing/summary";
import {
  PremiumCheckout,
  BillingControl,
} from "@/components/billing/billing-controls";
export const metadata = { title: "Body Premium" };
export default async function Page() {
  await requireUser("/access");
  const summary = await readBilling();
  let configured = false;
  try {
    const config = billingConfig();
    await verifyCatalog(stripeClient(config), config);
    configured = true;
  } catch {
    /* Honest unavailable state. */
  }
  const managed = summary?.subscriptions.some(
    (s) => !["canceled", "incomplete_expired"].includes(s.status),
  );
  return (
    <>
      <div className="page-heading">
        <p className="eyebrow">BODY PREMIUM</p>
        <h1>
          {summary?.lifetime
            ? "Lifetime Access"
            : "Keep building your strength."}
        </h1>
        <p>
          Full access to workouts, programs, Supersets, Cardio and your
          progress.
        </p>
      </div>
      <AccessStatus result={await readAccess()} />
      {summary?.lifetime ? (
        <p>
          Your training access has no expiration date. You do not need a
          subscription.
        </p>
      ) : managed ? (
        <section className="account-group">
          <h2>Last confirmed subscription</h2>
          {summary?.subscriptions.map((s, i) => (
            <p key={i}>
              {s.plan === "annual" ? "Annual" : "Monthly"} ·{" "}
              {s.status.replaceAll("_", " ")}
              {s.cancelAtEnd ? " · Cancels at period end" : ""}
              <span className="block">
                Billing period ends <LocalTime value={s.periodEnd} />.
              </span>
            </p>
          ))}
        </section>
      ) : (
        <section className="account-group">
          <h2>One plan. Full training access.</h2>
          <PremiumCheckout enabled={configured && summary !== null} />
        </section>
      )}
      {summary?.hasCustomer && <BillingControl kind="portal" />}
      <BillingControl kind="refresh" />
      <p>
        Your saved workouts and progress remain available with or without
        Premium.
      </p>
      <Link href="/history">View Workout History</Link>
    </>
  );
}
