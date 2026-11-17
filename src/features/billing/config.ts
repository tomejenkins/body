import "server-only";
import Stripe from "stripe";
import { getSiteOrigin } from "@/lib/supabase/config";
export const plans = {
  monthly: { cents: 699, interval: "month", label: "$6.99 / month" },
  annual: { cents: 4999, interval: "year", label: "$49.99 / year" },
} as const;
export type Plan = keyof typeof plans;
export function parsePlan(value: unknown): Plan {
  if (value !== "monthly" && value !== "annual")
    throw new Error("Choose a plan.");
  return value;
}
export function billingConfig() {
  const key = process.env.STRIPE_SECRET_KEY;
  const mode = process.env.BODY_BILLING_MODE;
  if (
    (mode !== "test" && mode !== "live") ||
    !key ||
    !key.startsWith(mode === "test" ? "sk_test_" : "sk_live_") ||
    (mode === "live" && process.env.BODY_BILLING_LIVE_APPROVED !== "true")
  )
    throw new Error("Billing is unavailable.");
  const monthly = process.env.STRIPE_MONTHLY_PRICE_ID;
  const annual = process.env.STRIPE_ANNUAL_PRICE_ID;
  const product = process.env.STRIPE_PREMIUM_PRODUCT_ID;
  const portal = process.env.STRIPE_PORTAL_CONFIGURATION_ID;
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const databaseKey = process.env.SUPABASE_BILLING_SECRET_KEY;
  if (
    !monthly?.startsWith("price_") ||
    !annual?.startsWith("price_") ||
    monthly === annual ||
    !product?.startsWith("prod_") ||
    !portal?.startsWith("bpc_") ||
    !secret?.startsWith("whsec_") ||
    !databaseKey
  )
    throw new Error("Billing is unavailable.");
  return {
    mode,
    key,
    prices: { monthly, annual },
    product,
    portal,
    secret,
    databaseKey,
    origin: getSiteOrigin(),
  };
}
export type BillingConfig = ReturnType<typeof billingConfig>;
export function stripeClient(config: BillingConfig) {
  return new Stripe(config.key, {
    apiVersion: "2026-10-28.endive",
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 2,
    timeout: 10000,
  });
}
export async function verifyCatalog(stripe: Stripe, config: BillingConfig) {
  const product = await stripe.products.retrieve(config.product);
  if (!product.active || product.livemode !== (config.mode === "live"))
    throw new Error("Billing configuration mismatch.");
  for (const plan of ["monthly", "annual"] as const) {
    const price = await stripe.prices.retrieve(config.prices[plan]);
    if (
      !price.active ||
      price.livemode !== (config.mode === "live") ||
      price.currency !== "usd" ||
      price.unit_amount !== plans[plan].cents ||
      price.recurring?.interval !== plans[plan].interval ||
      price.recurring.interval_count !== 1 ||
      price.recurring.usage_type !== "licensed" ||
      price.billing_scheme !== "per_unit" ||
      (typeof price.product === "string" ? price.product : price.product.id) !==
        config.product
    )
      throw new Error("Billing configuration mismatch.");
  }
}
