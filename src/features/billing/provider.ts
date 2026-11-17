import "server-only";
import type Stripe from "stripe";
import { type BillingConfig, type Plan, verifyCatalog } from "./config";
import type {
  BillingAccount,
  PaidPeriod,
  SubscriptionSnapshot,
} from "./database";
export const providerId = (
  value: string | { id: string } | null | undefined,
) => (typeof value === "string" ? value : value?.id);
const iso = (seconds: number) => {
  if (!Number.isSafeInteger(seconds) || seconds <= 0)
    throw new Error("Invalid billing period.");
  return new Date(seconds * 1000).toISOString();
};
export function approvedPlan(price: string, config: BillingConfig): Plan {
  if (price === config.prices.monthly) return "monthly";
  if (price === config.prices.annual) return "annual";
  throw new Error("Unapproved billing price.");
}
export function subscriptionSnapshot(
  sub: Stripe.Subscription,
  account: BillingAccount,
  config: BillingConfig,
): SubscriptionSnapshot {
  if (
    sub.livemode !== (config.mode === "live") ||
    providerId(sub.customer) !== account.customer_id ||
    sub.items.has_more ||
    sub.items.data.length !== 1
  )
    throw new Error("Subscription identity mismatch.");
  const item = sub.items.data[0];
  if (
    !item ||
    item.quantity !== 1 ||
    providerId(item.price.product) !== config.product ||
    sub.trial_end !== null
  )
    throw new Error("Unsupported subscription.");
  return {
    id: sub.id,
    price: item.price.id,
    plan: approvedPlan(item.price.id, config),
    status: sub.status,
    start: iso(item.current_period_start),
    end: iso(item.current_period_end),
    cancelAtEnd: sub.cancel_at_period_end,
    cancelAt: sub.cancel_at ? iso(sub.cancel_at) : null,
  };
}
export async function currentBilling(
  stripe: Stripe,
  account: BillingAccount,
  config: BillingConfig,
) {
  await verifyCatalog(stripe, config);
  const subscriptions: SubscriptionSnapshot[] = [];
  const periods: PaidPeriod[] = [];
  if (!account.customer_id)
    return { subscriptions, periods, blocksPurchase: false };
  const customer = await stripe.customers.retrieve(account.customer_id);
  if (customer.deleted) return { subscriptions, periods, blocksPurchase: true };
  if (customer.livemode !== (config.mode === "live"))
    throw new Error("Customer identity mismatch.");
  let count = 0;
  for await (const sub of stripe.subscriptions.list({
    customer: account.customer_id,
    status: "all",
    limit: 100,
  })) {
    if (++count > 100)
      throw new Error("Billing reconciliation requires operator review.");
    const snapshot = subscriptionSnapshot(sub, account, config);
    subscriptions.push(snapshot);
    const terminated =
      ["paused", "incomplete", "incomplete_expired", "trialing"].includes(
        sub.status,
      ) || sub.pause_collection !== null;
    let invoiceCount = 0;
    for await (const invoice of stripe.invoices.list({
      subscription: sub.id,
      limit: 100,
    })) {
      if (++invoiceCount > 200)
        throw new Error("Billing reconciliation requires operator review.");
      if (
        invoice.currency !== "usd" ||
        invoice.livemode !== (config.mode === "live") ||
        providerId(invoice.customer) !== account.customer_id ||
        providerId(invoice.parent?.subscription_details?.subscription) !==
          sub.id
      )
        throw new Error("Invoice identity mismatch.");
      if (invoice.status !== "paid") continue;
      // Only successful card charges from Stripe's own payment records establish paid evidence.
      // Customer balance/out-of-band/zero-value invoices require a separately reviewed future policy.
      let paid = false;
      let refundedOrDisputed = false;
      for await (const payment of stripe.invoicePayments.list({
        invoice: invoice.id,
        status: "paid",
        limit: 100,
      })) {
        if (
          payment.livemode !== (config.mode === "live") ||
          providerId(payment.invoice) !== invoice.id
        )
          throw new Error("Payment identity mismatch.");
        let chargeId = providerId(payment.payment.charge);
        if (payment.payment.payment_intent) {
          const intent = await stripe.paymentIntents.retrieve(
            providerId(payment.payment.payment_intent) ?? "",
          );
          if (
            providerId(intent.customer) !== account.customer_id ||
            intent.status !== "succeeded"
          )
            throw new Error("Payment is not confirmed.");
          chargeId = providerId(intent.latest_charge);
        }
        if (!chargeId) throw new Error("Unsupported payment evidence.");
        const charge = await stripe.charges.retrieve(chargeId);
        if (
          charge.livemode !== (config.mode === "live") ||
          providerId(charge.customer) !== account.customer_id ||
          !charge.paid
        )
          throw new Error("Charge identity mismatch.");
        paid = true;
        refundedOrDisputed ||= charge.amount_refunded > 0 || charge.disputed;
      }
      if (!paid) continue;
      for await (const line of stripe.invoices.listLineItems(invoice.id, {
        limit: 100,
      })) {
        if (
          line.parent?.type !== "subscription_item_details" ||
          line.amount <= 0
        )
          continue;
        if (
          providerId(line.subscription) !== sub.id ||
          line.pricing?.price_details?.product !== config.product ||
          line.quantity !== 1
        )
          throw new Error("Invoice line identity mismatch.");
        approvedPlan(
          providerId(line.pricing.price_details.price) ?? "",
          config,
        );
        const start = iso(line.period.start),
          end = iso(line.period.end);
        if (start >= end) throw new Error("Invalid paid period.");
        periods.push({
          reference: `${sub.id}/${line.id}`,
          invoice: invoice.id,
          start,
          end,
          revoked:
            (line.period.end > sub.items.data[0].current_period_end &&
              providerId(line.pricing.price_details.price) !==
                snapshot.price) ||
            terminated ||
            refundedOrDisputed ||
            (sub.status === "canceled" &&
              sub.ended_at !== null &&
              sub.ended_at < line.period.end),
        });
      }
    }
  }
  return {
    subscriptions,
    periods,
    blocksPurchase: subscriptions.some(
      (s) => !["canceled", "incomplete_expired"].includes(s.status),
    ),
  };
}
export async function verifyPortal(stripe: Stripe, config: BillingConfig) {
  await verifyCatalog(stripe, config);
  const portal = await stripe.billingPortal.configurations.retrieve(
    config.portal,
  );
  const update = portal.features.subscription_update;
  const products = update.products ?? [];
  if (
    !portal.active ||
    portal.livemode !== (config.mode === "live") ||
    !portal.features.subscription_cancel.enabled ||
    portal.features.subscription_cancel.mode !== "at_period_end" ||
    !update.enabled ||
    update.default_allowed_updates.length !== 1 ||
    update.default_allowed_updates[0] !== "price" ||
    update.proration_behavior !== "always_invoice" ||
    update.schedule_at_period_end?.conditions.length !== 1 ||
    update.schedule_at_period_end.conditions[0]?.type !==
      "shortening_interval" ||
    products.length !== 1 ||
    products[0]?.product !== config.product ||
    products[0].prices.length !== 2 ||
    !Object.values(config.prices).every((id) =>
      products[0]?.prices.includes(id),
    )
  )
    throw new Error("Portal configuration mismatch.");
}
