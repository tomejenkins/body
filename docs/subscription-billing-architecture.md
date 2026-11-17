# Subscription billing architecture — Phase 7.7F

## Pre-implementation assessment

Base: PR #38, `c6ec9635e6dad2c36198e5e96983bc5807d7bf61`. Stripe Billing is the web provider: hosted Checkout and Customer Portal reduce payment-data handling and provide lifecycle management. Paddle's merchant-of-record model could reduce tax/remittance obligations, but adds a different seller relationship and migration costs. Stripe does not make Body a merchant of record; tax, consumer disclosures, support and jurisdictional review remain launch prerequisites.

One Premium capability costs USD $6.99/month or $49.99/year. Annual equivalent is $4.17/month, saving 40.40% against twelve monthly payments. Supabase remains the only trial authority. Checkout charges immediately; no Stripe trials or coupon workflows.

### Intended boundaries and authorization matrix

| Action                                            | Authority                                                                  | Expired account                                         |
| ------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------- |
| Read plans, own billing summary, history/settings | Verified Auth + owner-scoped reads                                         | Allowed                                                 |
| Checkout monthly/annual                           | Verified Auth + server allowlist + serialized billing account              | Allowed, except active/pending subscription or lifetime |
| Portal                                            | Verified Auth + persisted customer mapping + approved portal configuration | Allowed                                                 |
| Return/refresh                                    | Verified Auth; provider retrieval and fenced projection                    | Grants nothing from URL                                 |
| Webhook                                           | Raw-body Stripe signature, correct mode, mapped customer, fresh retrieval  | No user session needed                                  |
| Write customer/subscription/receipt/grant facts   | Narrow server-only database RPCs                                           | Never available to ordinary clients                     |
| Start training / log workout / continuation       | Existing 7.7E database guards and fixed session snapshots                  | Existing policy unchanged                               |
| Trial, promotion or lifetime administration       | Existing protected authority                                               | No new workflow                                         |

### Concurrency and risks

Private account rows serialize customer creation, Checkout and reconciliation using expiring leases with random fencing tokens. Acquire the lease BEFORE provider reads; every database commit verifies the live token. Expired workers cannot apply stale snapshots. Provider mutations use persistent operation IDs and Stripe idempotency keys. Unknown outcomes beyond Stripe's guaranteed retention window fail closed for operator reconciliation, rather than creating duplicate customers/purchases. Open Checkout is reused; plan changes wait for its completion/expiration. Any nonterminal subscription blocks another purchase, including incomplete, unpaid, paused and cancel-at-period-end states.

Subscription projection and event completion commit together. A webhook receipt records only identifiers, type, attempts and bounded status; no raw payload, card data or billing addresses. Out-of-order events trigger current provider retrieval; event timestamps never order authority. Errors return retryable failure, with no positive access assumption. Database lock order is billing account, then existing grant rows in ID order; billing never acquires workout/session locks. Workout saves never call Stripe.

Paid grants are finite invoice-derived periods, separately identified per invoice/line. Renewal cannot extend an already-started session's fixed continuation deadline. Past-due retains only previously paid time. Incomplete/async unpaid creates no access. Immediate termination, payment pause, refund or dispute conservatively revokes affected subscription access; cancel-at-period-end retains paid access. No billing operation may modify another grant kind/source. Lifetime ownership is checked independently of the winning summary grant.

Provider credentials are absent in this workspace. Deterministic SDK-signature/provider-fixture and real local database tests can validate implementation; actual Checkout, Portal, Stripe delivery/test clocks and hosted prerequisites remain UNVERIFIED until separately configured. No hosted writes, live Stripe objects, deployment or merge are authorized.

## Sources reviewed

- [Paddle merchant-of-record model](https://www.paddle.com/blog/what-is-merchant-of-record).

- [Stripe webhooks](https://docs.stripe.com/webhooks): signature verification, duplicate delivery and unordered events; fresh retrieval instead of timestamp ordering.
- [Stripe Node SDK](https://github.com/stripe/stripe-node): pinned SDK types/API version, fetch transport and async Web Crypto verification.
- [Subscription item billing periods](https://docs.stripe.com/changelog/basil/2025-03-31/deprecate-subscription-current-period-start-and-end).
- [Checkout duplicate subscription guidance](https://docs.stripe.com/payments/checkout/limit-subscriptions).
- [Customer Portal configuration](https://docs.stripe.com/api/customer_portal/configurations/create): restrict product/prices and explicit cancellation/proration policy.
- [Idempotent requests](https://docs.stripe.com/api/idempotent_requests), [test clocks](https://docs.stripe.com/billing/testing/test-clocks).
- [Apple guidelines 3.1.1–3.1.3](https://developer.apple.com/app-store/review/guidelines/): digital functionality generally requires IAP; US external-link rules differ from other storefronts, with regional entitlement conditions.
- [Google Play Payments policy](https://support.google.com/googleplay/android-developer/answer/9858738?hl=en), [US alternative billing](https://support.google.com/googleplay/android-developer/answer/16497028): enrollment, regional requirements, reporting and fees require current review.

This phase is web/PWA only. A native wrapper cannot assume web Checkout is permitted worldwide. Future StoreKit/Google billing must project verified provider grants into the same model and prevent cross-provider duplicate purchases; no native billing SDK is implemented here. Policies require renewed review before native release.

## Implemented data and consistency model

Five private RLS tables hold account mapping/operation leases, sanitized subscription snapshots, invoice-line provenance, event receipt attempts/completion, and the single database billing mode. There are no ordinary-client policies or DML grants. `billing_summary()` exposes only the authenticated owner's lifetime status, plan/status/period-end/cancellation and whether a customer exists. Provider IDs, receipts, operation tokens and provenance stay private. A server-only adapter uses a separately configured Supabase secret for exactly three narrow projection/lookup RPCs; its credential blast radius and rotation requirements are documented in setup.

Database time establishes lease/idempotency safety, refresh throttling and grant authorization. The mutation acceptance point remains 7.7E's post-lock database-clock check. Billing serializes on the account row and locks owner grants in ID order. A projection transaction verifies its fencing token before updating snapshots, paid invoice source facts, subscription grants and event completion atomically. A waiting training write re-evaluates after revocation under existing locks. Stripe state can change while an HTTP snapshot is read: consistency is eventual with signed delivery/retry/manual reconciliation, not a cross-system distributed transaction. No cached positive provider status bypasses training authorization.

Each paid invoice's positive, quantity-one approved subscription line establishes an immutable finite period, including a paid positive proration. Negative credits and unconfirmed/zero/out-of-band invoices do not establish access. Current successful Stripe charge evidence is required. Partial or full refunds and disputed charges conservatively revoke the affected invoice's grants. The initial MVP keeps disputed-charge access revoked even after dispute closure; support review is required rather than assuming a won dispute automatically restores access. No refund/admin action changes other sources. Past-due/unpaid do not extend paid time. Immediate cancellation before a line's paid end revokes it; natural cancellation at paid end does not remove its existing fixed continuation. A paused collection or paused subscription revokes affected paid periods until authoritative reconciliation restores an eligible state. Checkout offers card only; async/unconfirmed states cannot grant from the return page or an unpaid invoice.

Renewals add separate periods instead of extending a prior grant. A session snapshots one qualifying grant at creation; the earlier fixed deadline remains unchanged after renewal. New current grants can authorize eligible ongoing training, but never reopen a terminal session. Ordinary expiration preserves committed evidence and four-hour continuation under existing lifecycle/hard-expiry rules. Immediate revocation defeats continuation bound to the revoked grant, as in 7.7E. No training data, performance eligibility or trial facts are rewritten.

## Request and performance boundaries

Profile/Access adds one request-local-deduplicated owner summary RPC. Plan display verifies the two provider Prices and Product when configured; other training/history routes never call Stripe. Checkout/reconciliation may retrieve paginated subscriptions, invoices, payments and charges; those operations are deliberately outside the exercise logger. There are no additional provider or entitlement HTTP calls per set, group or Cardio save. Manual refresh requires interaction and has a database-clock three-second cooldown; no continuous polling/socket/background work or private service-worker caching is added.

See [setup and exact rollout/recovery ordering](stripe-billing-setup.md) and [validation evidence and limits](phase-7-7f-validation.md). Hosted 7.7E deployment is a prerequisite, not inferred from a private table screenshot.

Annual-to-monthly Portal changes are required to be scheduled at period end (`shortening_interval`); monthly-to-annual upgrades use immediate invoiced proration. Runtime rejects a Portal configuration that permits immediate interval shortening. Reconciliation revokes an older longer paid line when the current subscription has unexpectedly shortened its term and changed price, preventing stale prepaid access after credited time. Original paid timestamps remain immutable; unsupported balance/zero-payment transitions fail closed for support review.
