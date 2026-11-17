// @vitest-environment node
import { describe, it, expect, vi, afterEach } from "vitest";
import Stripe from "stripe";
import {
  billingConfig,
  parsePlan,
  verifyCatalog,
  type BillingConfig,
} from "./config";
import { BillingService } from "./service";
import { BillingDatabase, type BillingAccount } from "./database";
import { currentBilling, subscriptionSnapshot, verifyPortal } from "./provider";
import { handleWebhook, boundedBody } from "./webhook";
const config: BillingConfig = {
  mode: "test",
  key: "sk_test_fixture",
  prices: { monthly: "price_month", annual: "price_year" },
  product: "prod_body",
  portal: "bpc_body",
  secret: "whsec_fixture",
  databaseKey: "fixture",
  origin: "http://127.0.0.1:3000",
};
function fixture() {
  const account: BillingAccount = {
    owner_id: "owner",
    mode: "test",
    customer_id: "cus_owner",
    customer_operation: "customer-op",
    customer_started_at: new Date().toISOString(),
    checkout_operation: "checkout-op",
    checkout_started_at: null,
    checkout_plan: null,
    checkout_id: null,
    lease_token: "lease",
    has_lifetime: false,
    customer_retry_safe: true,
    checkout_retry_safe: true,
    refresh_allowed: true,
  };
  const sub = {
    id: "sub_owner",
    livemode: false,
    customer: "cus_owner",
    items: {
      has_more: false,
      data: [
        {
          quantity: 1,
          price: { id: "price_month", product: "prod_body" },
          current_period_start: 1800000000,
          current_period_end: 1802592000,
        },
      ],
    },
    status: "active",
    trial_end: null,
    pause_collection: null,
    cancel_at: null,
    cancel_at_period_end: false,
    ended_at: null,
  };
  const invoice = {
    id: "in_paid",
    currency: "usd",
    livemode: false,
    customer: "cus_owner",
    parent: { subscription_details: { subscription: "sub_owner" } },
    status: "paid",
  };
  const line = {
    id: "il_paid",
    parent: {
      type: "subscription_item_details",
      subscription_item_details: { proration: false },
    },
    amount: 699,
    quantity: 1,
    subscription: "sub_owner",
    pricing: { price_details: { price: "price_month", product: "prod_body" } },
    period: { start: 1800000000, end: 1802592000 },
  };
  const charge = {
    id: "ch_paid",
    livemode: false,
    customer: "cus_owner",
    paid: true,
    amount_refunded: 0,
    disputed: false,
  };
  const session = {
    id: "cs_test_owner",
    livemode: false,
    mode: "subscription",
    customer: "cus_owner",
    client_reference_id: "owner",
    metadata: { body_operation: "checkout-op" },
    status: "open",
    url: "https://checkout.stripe.com/c/pay/fixture",
  };
  const prices = {
    active: true,
    livemode: false,
    currency: "usd",
    recurring: { interval: "month", interval_count: 1, usage_type: "licensed" },
    unit_amount: 699,
    product: "prod_body",
    billing_scheme: "per_unit",
  };
  const stripe = {
    products: {
      retrieve: vi.fn().mockResolvedValue({ active: true, livemode: false }),
    },
    prices: {
      retrieve: vi.fn(async (id: string) => ({
        ...prices,
        ...(id === "price_year"
          ? {
              unit_amount: 4999,
              recurring: { ...prices.recurring, interval: "year" },
            }
          : {}),
      })),
    },
    customers: {
      retrieve: vi.fn().mockResolvedValue({ livemode: false }),
      create: vi.fn().mockResolvedValue({ id: "cus_owner" }),
    },
    subscriptions: { list: vi.fn(() => [sub]) },
    invoices: {
      list: vi.fn(() => [invoice]),
      listLineItems: vi.fn(() => [line]),
    },
    invoicePayments: {
      list: vi.fn(() => [
        { livemode: false, invoice: "in_paid", payment: { charge: "ch_paid" } },
      ]),
    },
    charges: { retrieve: vi.fn(async () => charge) },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue(session),
        retrieve: vi.fn().mockResolvedValue(session),
      },
    },
    billingPortal: {
      configurations: {
        retrieve: vi.fn().mockResolvedValue({
          active: true,
          livemode: false,
          features: {
            subscription_cancel: { enabled: true, mode: "at_period_end" },
            subscription_update: {
              enabled: true,
              default_allowed_updates: ["price"],
              proration_behavior: "always_invoice",
              schedule_at_period_end: {
                conditions: [{ type: "shortening_interval" }],
              },
              products: [
                {
                  product: "prod_body",
                  prices: ["price_month", "price_year"],
                },
              ],
            },
          },
        }),
      },
      sessions: {
        create: vi.fn().mockResolvedValue({
          url: "https://billing.stripe.com/session/fixture",
        }),
      },
    },
    webhooks: new Stripe("sk_test_fixture").webhooks,
  };
  const db = {
    claim: vi.fn(async () => ({ ...account })),
    commit: vi
      .fn<
        (
          account: BillingAccount,
          change: Record<string, unknown>,
          event?: string,
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined),
    lookup: vi.fn<() => Promise<string | null>>().mockResolvedValue("owner"),
  };
  const service = new BillingService(
    config,
    stripe as unknown as Stripe,
    db as unknown as BillingDatabase,
  );
  return {
    account,
    sub,
    invoice,
    line,
    charge,
    session,
    prices,
    stripe,
    db,
    service,
  };
}
afterEach(() => vi.unstubAllEnvs());
describe("configuration and identity", () => {
  it.each(["gold", "price_evil", null, {}, "MONTHLY"])(
    "rejects forged plan %s",
    (value) => expect(() => parsePlan(value)).toThrow(),
  );
  it("fails closed when unconfigured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(() => billingConfig()).toThrow();
  });
  it.each(["unit_amount", "currency", "active", "livemode", "product"])(
    "rejects catalog drift: %s",
    async (key) => {
      const f = fixture();
      f.stripe.prices.retrieve.mockResolvedValueOnce({
        ...f.prices,
        [key]: key === "active" ? false : key === "livemode" ? true : "wrong",
      });
      await expect(verifyCatalog(f.service.stripe, config)).rejects.toThrow();
    },
  );
  it.each(["customer", "livemode", "trial_end"])(
    "rejects mismatched subscription %s",
    (key) => {
      const f = fixture();
      expect(() =>
        subscriptionSnapshot(
          {
            ...f.sub,
            [key]: key === "livemode" ? true : "wrong",
          } as unknown as Stripe.Subscription,
          f.account,
          config,
        ),
      ).toThrow();
    },
  );
});
describe("finite paid evidence", () => {
  it("projects a finite invoice period", async () => {
    const f = fixture();
    const result = await currentBilling(f.service.stripe, f.account, config);
    expect(result.periods).toEqual([
      {
        reference: "sub_owner/il_paid",
        invoice: "in_paid",
        start: new Date(1800000000000).toISOString(),
        end: new Date(1802592000000).toISOString(),
        revoked: false,
      },
    ]);
  });
  it.each(["open", "draft", "void", "uncollectible"])(
    "does not grant from %s invoice",
    async (status) => {
      const f = fixture();
      f.invoice.status = status;
      expect(
        (await currentBilling(f.service.stripe, f.account, config)).periods,
      ).toEqual([]);
    },
  );
  it.each(["past_due", "unpaid"])(
    "%s does not extend previously paid time",
    async (status) => {
      const f = fixture();
      f.sub.status = status;
      const result = await currentBilling(f.service.stripe, f.account, config);
      expect(result.periods[0]?.revoked).toBe(false);
      expect(result.periods[0]?.end).toBe(
        new Date(1802592000000).toISOString(),
      );
    },
  );
  it.each(["incomplete", "paused", "trialing"])(
    "%s denies new paid evidence",
    async (status) => {
      const f = fixture();
      f.sub.status = status;
      expect(
        (await currentBilling(f.service.stripe, f.account, config)).periods[0]
          ?.revoked,
      ).toBe(true);
    },
  );
  it("refund revokes affected invoice", async () => {
    const f = fixture();
    f.charge.amount_refunded = 1;
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods[0]
        ?.revoked,
    ).toBe(true);
  });
  it("dispute revokes affected invoice", async () => {
    const f = fixture();
    f.charge.disputed = true;
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods[0]
        ?.revoked,
    ).toBe(true);
  });
  it("cancel-at-end retains paid time", async () => {
    const f = fixture();
    f.sub.cancel_at_period_end = true;
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods[0]
        ?.revoked,
    ).toBe(false);
  });
  it("paid prorated positive replacement line grants only its bounded period", async () => {
    const f = fixture();
    f.line.parent.subscription_item_details.proration = true;
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods,
    ).toHaveLength(1);
  });
});
describe("checkout and portal recovery", () => {
  it("never creates a duplicate subscription for an active account", async () => {
    const f = fixture();
    await expect(f.service.checkout("owner", "annual")).rejects.toThrow(
      /existing/,
    );
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("lifetime refuses paid checkout", async () => {
    const f = fixture();
    f.account.has_lifetime = true;
    await expect(f.service.checkout("owner", "monthly")).rejects.toThrow(
      /Lifetime/,
    );
    expect(f.stripe.customers.create).not.toHaveBeenCalled();
  });
  it("new checkout uses approved price, stable idempotency and no Stripe trial", async () => {
    const f = fixture();
    f.stripe.subscriptions.list.mockReturnValue([]);
    await f.service.checkout("owner", "annual");
    const [params, options] = f.stripe.checkout.sessions.create.mock
      .calls[0] as unknown as [
      Stripe.Checkout.SessionCreateParams,
      Stripe.RequestOptions,
    ];
    expect(params.line_items).toEqual([{ price: "price_year", quantity: 1 }]);
    expect(params).not.toHaveProperty("subscription_data");
    expect(options.idempotencyKey).toContain("checkout-op");
  });
  it("reuses an existing open checkout", async () => {
    const f = fixture();
    f.stripe.subscriptions.list.mockReturnValue([]);
    f.account.checkout_id = f.session.id;
    f.account.checkout_plan = "monthly";
    expect(await f.service.checkout("owner", "monthly")).toBe(f.session.url);
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("does not repeat an ambiguous operation after the retention window", async () => {
    const f = fixture();
    f.stripe.subscriptions.list.mockReturnValue([]);
    f.account.checkout_started_at = "2020-01-01T00:00:00Z";
    f.account.checkout_retry_safe = false;
    await expect(f.service.checkout("owner", "monthly")).rejects.toThrow(
      /reconciliation/,
    );
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("return session ID cannot grant another account access", async () => {
    const f = fixture();
    await expect(f.service.reconcile("owner", "cs_other")).rejects.toThrow(
      /belong/,
    );
    expect(f.db.commit).toHaveBeenCalledTimes(1);
    expect(f.db.commit.mock.calls[0]?.[1]).toEqual({ release: true });
  });
  it("portal uses mapped customer and approved return URL", async () => {
    const f = fixture();
    await f.service.portal("owner");
    expect(f.stripe.billingPortal.sessions.create).toHaveBeenCalledWith({
      customer: "cus_owner",
      configuration: "bpc_body",
      return_url: "http://127.0.0.1:3000/access/return",
    });
  });
  it("rejects portal with unapproved prices", async () => {
    const f = fixture();
    f.stripe.billingPortal.configurations.retrieve.mockResolvedValueOnce({
      active: true,
      livemode: false,
      features: {
        subscription_cancel: { enabled: true, mode: "at_period_end" },
        subscription_update: {
          enabled: true,
          default_allowed_updates: ["price"],
          proration_behavior: "always_invoice",
          schedule_at_period_end: {
            conditions: [{ type: "shortening_interval" }],
          },
          products: [],
        },
      },
    });
    await expect(verifyPortal(f.service.stripe, config)).rejects.toThrow();
  });
});
describe("real SDK signatures and raw request handling", () => {
  function request(
    f: ReturnType<typeof fixture>,
    overrides: Record<string, unknown> = {},
    secret = config.secret,
    timestamp = Math.floor(Date.now() / 1000),
  ) {
    const body = JSON.stringify({
      id: "evt_valid",
      object: "event",
      type: "invoice.paid",
      livemode: false,
      data: { object: { id: "in_paid", customer: "cus_owner" } },
      ...overrides,
    });
    return new Request("https://body.test/api/billing/webhook", {
      method: "POST",
      body,
      headers: {
        "stripe-signature": f.stripe.webhooks.generateTestHeaderString({
          payload: body,
          secret,
          timestamp,
        }),
      },
    });
  }
  it("valid signed webhook reconciles current state atomically", async () => {
    const f = fixture();
    expect((await handleWebhook(request(f), () => f.service)).status).toBe(204);
    expect(f.db.commit).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ periods: expect.any(Array), release: true }),
      "evt_valid",
    );
  });
  it.each(["wrong-secret", "old-timestamp", "wrong-mode", "connected-account"])(
    "rejects %s",
    async (kind) => {
      const f = fixture();
      const req = request(
        f,
        kind === "wrong-mode"
          ? { livemode: true }
          : kind === "connected-account"
            ? { account: "acct_other" }
            : {},
        kind === "wrong-secret" ? "whsec_wrong" : config.secret,
        kind === "old-timestamp" ? 1 : undefined,
      );
      expect((await handleWebhook(req, () => f.service)).status).toBe(400);
      expect(f.db.claim).not.toHaveBeenCalled();
    },
  );
  it("a changed raw body fails verification", async () => {
    const f = fixture();
    const req = request(f);
    const body = await req.text();
    expect(
      (
        await handleWebhook(
          new Request(req.url, {
            method: "POST",
            headers: req.headers,
            body: body + " ",
          }),
          () => f.service,
        )
      ).status,
    ).toBe(400);
  });
  it("provider error is retryable", async () => {
    const f = fixture();
    f.stripe.products.retrieve.mockRejectedValueOnce(new Error("offline"));
    expect((await handleWebhook(request(f), () => f.service)).status).toBe(503);
  });
  it("duplicate receipt does no provider work", async () => {
    const f = fixture();
    f.db.claim.mockResolvedValueOnce({ duplicate: true } as BillingAccount);
    expect((await handleWebhook(request(f), () => f.service)).status).toBe(204);
    expect(f.stripe.products.retrieve).not.toHaveBeenCalled();
  });
  it("unmapped customer is never linked from metadata", async () => {
    const f = fixture();
    f.db.lookup.mockResolvedValueOnce(null);
    expect((await handleWebhook(request(f), () => f.service)).status).toBe(204);
    expect(f.db.claim).not.toHaveBeenCalled();
  });
  it("caps actual streamed bytes", async () => {
    await expect(
      boundedBody(
        new Request("https://body.test", {
          method: "POST",
          body: "x".repeat(262145),
        }),
      ),
    ).rejects.toThrow(/large/);
  });
});

describe("retry and lifecycle adversaries", () => {
  it("retries the identical Checkout provider operation after local acknowledgement loss", async () => {
    const f = fixture();
    f.stripe.subscriptions.list.mockReturnValue([]);
    f.db.commit.mockImplementation(async (_a, change) => {
      if (change.checkout) throw new Error("lost database acknowledgement");
    });
    await expect(f.service.checkout("owner", "annual")).rejects.toThrow(
      /acknowledgement/,
    );
    f.db.commit.mockResolvedValue(undefined);
    await f.service.checkout("owner", "annual");
    expect(f.stripe.checkout.sessions.create.mock.calls[0]).toEqual(
      f.stripe.checkout.sessions.create.mock.calls[1],
    );
  });
  it("ambiguous customer creation reuses the same provider key", async () => {
    const f = fixture();
    f.account.customer_id = null;
    f.stripe.subscriptions.list.mockReturnValue([]);
    let lost = false;
    f.db.commit.mockImplementation(async (_a, change) => {
      if (change.customer && !lost) {
        lost = true;
        throw new Error("acknowledgement lost");
      }
    });
    await expect(f.service.checkout("owner", "annual")).rejects.toThrow();
    await f.service.checkout("owner", "annual");
    expect(f.stripe.customers.create.mock.calls[0]).toEqual(
      f.stripe.customers.create.mock.calls[1],
    );
  });
  it("incomplete subscription blocks another purchase without granting", async () => {
    const f = fixture();
    f.sub.status = "incomplete";
    await expect(f.service.checkout("owner", "monthly")).rejects.toThrow(
      /existing/,
    );
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("different plan cannot replace an open purchase", async () => {
    const f = fixture();
    f.stripe.subscriptions.list.mockReturnValue([]);
    f.account.checkout_id = f.session.id;
    f.account.checkout_plan = "annual";
    await expect(f.service.checkout("owner", "monthly")).rejects.toThrow(
      /previous plan/,
    );
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("expired checkout is cleared only after authoritative retrieval", async () => {
    const f = fixture();
    f.stripe.subscriptions.list.mockReturnValue([]);
    f.account.checkout_id = f.session.id;
    f.account.checkout_plan = "annual";
    f.session.status = "expired";
    await expect(f.service.checkout("owner", "monthly")).rejects.toThrow(
      /closed/,
    );
    expect(f.db.commit).toHaveBeenCalledWith(expect.anything(), {
      resetCheckout: true,
    });
    expect(f.stripe.checkout.sessions.create).not.toHaveBeenCalled();
  });
  it("a newer event followed by an older event both retrieve current state", async () => {
    const f = fixture();
    await f.service.reconcile("owner", undefined, {
      id: "evt_new",
      type: "invoice.paid",
      object: "in_paid",
    });
    f.charge.amount_refunded = 699;
    await f.service.reconcile("owner", undefined, {
      id: "evt_old",
      type: "customer.subscription.updated",
      object: "sub_owner",
    });
    const last = f.db.commit.mock.calls.at(-1)?.[1];
    expect(last).toMatchObject({
      periods: [expect.objectContaining({ revoked: true })],
    });
    expect(f.stripe.subscriptions.list).toHaveBeenCalledTimes(2);
  });
  it("immediate cancellation revokes remaining paid period", async () => {
    const f = fixture();
    f.sub.status = "canceled";
    Object.assign(f.sub, { ended_at: 1800000010 });
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods[0]
        ?.revoked,
    ).toBe(true);
  });
  it("natural period-end cancellation preserves fixed paid continuation", async () => {
    const f = fixture();
    f.sub.status = "canceled";
    Object.assign(f.sub, { ended_at: 1802592000 });
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods[0]
        ?.revoked,
    ).toBe(false);
  });
  it("manual refresh cooldown does no provider work", async () => {
    const f = fixture();
    f.account.refresh_allowed = false;
    await expect(f.service.reconcile("owner")).rejects.toThrow(/wait/);
    expect(f.stripe.products.retrieve).not.toHaveBeenCalled();
  });
  it("a missing successful payment never establishes a grant", async () => {
    const f = fixture();
    f.stripe.invoicePayments.list.mockReturnValue([]);
    expect(
      (await currentBilling(f.service.stripe, f.account, config)).periods,
    ).toHaveLength(0);
  });
  it("provider failures during projection leave event retryable", async () => {
    const f = fixture();
    f.db.commit.mockRejectedValueOnce(new Error("db unavailable"));
    await expect(
      f.service.reconcile("owner", undefined, {
        id: "evt_failed",
        type: "invoice.paid",
        object: "in_paid",
      }),
    ).rejects.toThrow();
    expect(f.db.commit.mock.calls.at(-1)?.[1]).toEqual({ release: true });
  });
});

it("deleted provider customer revokes paid periods and blocks replacement purchases", async () => {
  const f = fixture();
  f.stripe.customers.retrieve.mockResolvedValueOnce({
    deleted: true,
  } as unknown as { livemode: boolean });
  const result = await currentBilling(f.service.stripe, f.account, config);
  expect(result).toMatchObject({ periods: [], blocksPurchase: true });
});

it("a prior annual period cannot survive an unexpected shortened subscription", async () => {
  const f = fixture();
  f.line.pricing.price_details.price = "price_year";
  f.line.period.end = 1831536000;
  expect(
    (await currentBilling(f.service.stripe, f.account, config)).periods[0]
      ?.revoked,
  ).toBe(true);
});
it("Portal must defer annual-to-monthly changes until the period ends", async () => {
  const f = fixture();
  const original = await f.stripe.billingPortal.configurations.retrieve();
  original.features.subscription_update.schedule_at_period_end.conditions = [];
  f.stripe.billingPortal.configurations.retrieve.mockResolvedValueOnce(
    original,
  );
  await expect(verifyPortal(f.service.stripe, config)).rejects.toThrow();
});
