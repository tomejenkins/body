import "server-only";
import type Stripe from "stripe";
import {
  type BillingConfig,
  type Plan,
  billingConfig,
  stripeClient,
} from "./config";
import { BillingDatabase, type BillingAccount } from "./database";
import { currentBilling, providerId, verifyPortal } from "./provider";
export class BillingService {
  constructor(
    readonly config: BillingConfig,
    readonly stripe: Stripe,
    readonly db: BillingDatabase,
  ) {}
  private async release(account: BillingAccount) {
    // Failure here leaves only a bounded lease. Never replace the original outcome.
    try {
      await this.db.commit(account, { release: true });
    } catch {
      /* Retry after lease expiry. */
    }
  }
  async checkout(owner: string, plan: Plan): Promise<string> {
    const account = await this.db.claim(owner);
    try {
      if (account.has_lifetime)
        throw new Error("Lifetime access does not need a subscription.");
      if (!account.customer_id) {
        if (!account.customer_retry_safe)
          throw new Error("Customer creation needs reconciliation.");
        await this.db.commit(account, { startCustomer: true });
        const customer = await this.stripe.customers.create(
          { metadata: { body_account: owner } },
          {
            idempotencyKey: `body-customer-${this.config.mode}-${account.customer_operation}`,
          },
        );
        await this.db.commit(account, { customer: customer.id });
        account.customer_id = customer.id;
      }
      const snapshot = await currentBilling(this.stripe, account, this.config);
      await this.db.commit(account, snapshot);
      if (snapshot.blocksPurchase)
        throw new Error(
          "Manage your existing subscription in billing settings.",
        );
      if (account.checkout_id) {
        const existing = await this.stripe.checkout.sessions.retrieve(
          account.checkout_id,
        );
        this.verifySession(existing, account);
        if (existing.status === "open" && existing.url) {
          if (account.checkout_plan !== plan)
            throw new Error("A checkout for your previous plan is still open.");
          return existing.url;
        }
        if (
          existing.status === "complete" &&
          snapshot.subscriptions.length === 0
        )
          throw new Error(
            "Payment confirmation is pending. Refresh your billing status.",
          );
        if (existing.status !== "expired" && existing.status !== "complete")
          throw new Error("Checkout confirmation is pending.");
        await this.db.commit(account, { resetCheckout: true });
        // A fresh claim must read the DB-generated operation identity; never guess it.
        throw new Error("Your previous checkout has closed. Please try again.");
      }
      if (account.checkout_plan && account.checkout_plan !== plan)
        throw new Error(
          "Continue the pending plan before creating another checkout.",
        );
      if (!account.checkout_retry_safe)
        throw new Error(
          "Checkout needs reconciliation before another purchase.",
        );
      await this.db.commit(account, { plan });
      const checkout = await this.stripe.checkout.sessions.create(
        {
          mode: "subscription",
          currency: "usd",
          customer: account.customer_id,
          client_reference_id: owner,
          line_items: [{ price: this.config.prices[plan], quantity: 1 }],
          allowed_payment_method_types: ["card"],
          adaptive_pricing: { enabled: false },
          allow_promotion_codes: false,
          success_url:
            this.config.origin +
            "/access/return?session_id={CHECKOUT_SESSION_ID}",
          cancel_url: this.config.origin + "/access?checkout=canceled",
          metadata: { body_operation: account.checkout_operation },
        },
        {
          idempotencyKey: `body-checkout-${this.config.mode}-${account.checkout_operation}`,
        },
      );
      this.verifySession(checkout, account);
      await this.db.commit(account, { checkout: checkout.id });
      if (!checkout.url) throw new Error("Checkout is not ready.");
      return checkout.url;
    } finally {
      await this.release(account);
    }
  }
  verifySession(session: Stripe.Checkout.Session, account: BillingAccount) {
    if (
      session.livemode !== (this.config.mode === "live") ||
      session.mode !== "subscription" ||
      providerId(session.customer) !== account.customer_id ||
      session.client_reference_id !== account.owner_id ||
      session.metadata?.body_operation !== account.checkout_operation
    )
      throw new Error("Checkout identity mismatch.");
  }
  async reconcile(
    owner: string,
    sessionId?: string,
    event?: { id: string; type: string; object: string },
  ) {
    const account = await this.db.claim(owner, event);
    if (account.duplicate) return;
    try {
      if (!event && !account.refresh_allowed)
        throw new Error("Please wait before refreshing billing again.");
      if (sessionId) {
        if (sessionId !== account.checkout_id)
          throw new Error("Checkout does not belong to this account.");
        this.verifySession(
          await this.stripe.checkout.sessions.retrieve(sessionId),
          account,
        );
      }
      const snapshot = await currentBilling(this.stripe, account, this.config);
      await this.db.commit(account, { ...snapshot, release: true }, event?.id);
    } catch (error) {
      await this.release(account);
      throw error;
    }
  }
  async portal(owner: string) {
    const account = await this.db.claim(owner);
    try {
      if (!account.customer_id)
        throw new Error("No billing account is available.");
      await verifyPortal(this.stripe, this.config);
      const session = await this.stripe.billingPortal.sessions.create({
        customer: account.customer_id,
        configuration: this.config.portal,
        return_url: this.config.origin + "/access/return",
      });
      return session.url;
    } finally {
      await this.release(account);
    }
  }
}
export function billingService() {
  const config = billingConfig();
  return new BillingService(
    config,
    stripeClient(config),
    new BillingDatabase(config),
  );
}
