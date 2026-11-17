"use client";
import { useActionState } from "react";
import {
  startCheckout,
  openPortal,
  refreshBilling,
  type BillingActionState,
} from "@/features/billing/actions";
import { Button } from "@/components/ui/button";
export function BillingControl({
  kind,
  session,
}: {
  kind: "portal" | "refresh";
  session?: string;
}) {
  const [state, action, pending] = useActionState<BillingActionState, FormData>(
    kind === "portal" ? openPortal : refreshBilling,
    {},
  );
  return (
    <form action={action} className="space-y-3">
      {session && <input type="hidden" name="session" value={session} />}
      <Button type="submit" variant="outline" disabled={pending}>
        {pending
          ? "Checking…"
          : kind === "portal"
            ? "Manage Billing"
            : "Refresh Billing Status"}
      </Button>
      <p role="status" aria-live="polite">
        {state.error ?? state.message}
      </p>
    </form>
  );
}
export function PremiumCheckout({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState<BillingActionState, FormData>(
    startCheckout,
    {},
  );
  return (
    <form action={action} className="space-y-5">
      <fieldset disabled={!enabled || pending} className="space-y-3">
        <legend className="mb-3 font-medium">Choose your plan</legend>
        <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4 has-[:checked]:border-current">
          <input
            type="radio"
            name="plan"
            value="monthly"
            aria-describedby="monthly-terms"
          />
          <span>
            <strong>Monthly · $6.99 / month</strong>
            <span id="monthly-terms" className="block text-sm">
              Billed monthly in USD.
            </span>
          </span>
        </label>
        <label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-xl border p-4 has-[:checked]:border-current">
          <input
            type="radio"
            name="plan"
            value="annual"
            defaultChecked
            aria-describedby="annual-terms"
          />
          <span>
            <strong>Annual · $49.99 / year</strong>
            <span id="annual-terms" className="block text-sm">
              Recommended · about $4.17/month. Save 40% compared with monthly.
            </span>
          </span>
        </label>
      </fieldset>
      <p className="text-sm">
        Payment starts today, including during your Body trial. Your selected
        plan renews automatically until canceled. Cancel in Manage Billing
        before renewal; access continues through your paid period. Taxes may
        apply. Annual-to-monthly changes take effect at period end.
        Monthly-to-annual changes may charge prorated amounts shown by Stripe
        before confirmation.
      </p>
      <Button type="submit" disabled={!enabled || pending}>
        {pending ? "Opening secure checkout…" : "Continue to Secure Checkout"}
      </Button>
      {!enabled && (
        <p role="status">
          Billing is not available in this environment yet. No payment will be
          taken here.
        </p>
      )}
      <p role="status" aria-live="polite">
        {state.error}
      </p>
    </form>
  );
}
