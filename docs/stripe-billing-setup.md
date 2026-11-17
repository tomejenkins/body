# Stripe Billing setup and staged rollout

Implementation is dormant until configured. No Stripe resources, hosted database changes, secret changes, webhooks or deployments were performed by this phase. Provider-connected validation is **UNVERIFIED** without test credentials. Do not enable live billing solely because local fixtures pass.

## Server configuration

Use separate Stripe test/live accounts or modes, separate Supabase projects and separate application secrets. Never run test purchases against a live application's database. The additive migration defaults its private `billing_environment` to `test`; a reviewed operator change is required for a live target. Mode cannot be selected by a browser. Switching a used database between environments is unsupported: reconcile and migrate through a reviewed plan rather than preserving effective test grants in live.

Set these **server-only** names through the authorized environment's secret manager; no values belong in Wrangler, `.env.example`, client bundles or commits:

| Name                             | Purpose                                                                                |
| -------------------------------- | -------------------------------------------------------------------------------------- |
| `BODY_BILLING_MODE`              | `test` or `live`; no default enabling billing                                          |
| `STRIPE_SECRET_KEY`              | Correct mode's secret API key; SDK checks key prefix                                   |
| `STRIPE_WEBHOOK_SECRET`          | This endpoint's signing secret; CLI forwarding has its own secret                      |
| `STRIPE_PREMIUM_PRODUCT_ID`      | One active Body Premium product                                                        |
| `STRIPE_MONTHLY_PRICE_ID`        | Active USD 699 cents, recurring month, count 1, licensed/per-unit                      |
| `STRIPE_ANNUAL_PRICE_ID`         | Active USD 4999 cents, recurring year, count 1, licensed/per-unit                      |
| `STRIPE_PORTAL_CONFIGURATION_ID` | Explicit approved Customer Portal configuration                                        |
| `SUPABASE_BILLING_SECRET_KEY`    | Server Supabase secret/service-role credential used only by narrow billing RPC adapter |
| `BODY_BILLING_LIVE_APPROVED`     | Explicit `true` only after separately approved live rollout                            |

Existing public Supabase configuration and canonical `NEXT_PUBLIC_SITE_URL` remain required. Return/cancel URLs derive solely from that validated origin. No caller can submit a Price/customer ID or external return URL. SDK `stripe@23.1.0` pins API `2026-10-28.endive`, uses fetch transport and async SubtleCrypto signature verification for Workers. Configure the snapshot webhook destination to that API version. Upgrade SDK/API/destination together with fixture and provider regression checks.

The Supabase credential is sensitive: secret/service-role credentials can also administer Auth and may have privileges outside these RPCs. Keep this adapter server-only, rotate credentials, restrict deployment access and audit use. There are no generic SQL/grant endpoints and ordinary clients cannot execute billing projection functions. Billing RPCs intentionally do not grant direct table access even to service_role and cannot modify trial/promotion/lifetime sources. A future dedicated gateway/role could reduce credential blast radius further.

## Separately authorized test-mode provisioning

1. Verify target project/mode and backup/recovery readiness. Inspect official Stripe test-mode dashboard or CLI; never paste keys or personal billing records into validation artifacts.
2. Create one Premium product and the two exact prices above. Do not configure Stripe trials, coupons, promotion codes, tiers or a second trial clock. Runtime verifies mode, active product/price, amount, currency, interval/count and licensed per-unit billing. Adaptive Pricing is disabled for Checkout; payment methods are filtered to card. Apple Pay/Google Pay wallets may appear through Stripe's eligible card presentation.
3. Create a Portal configuration: cancellation enabled **at period end**; subscription update enabled with **only price** updates; exactly the approved Premium product and both prices; proration behavior **always_invoice** and `schedule_at_period_end.conditions` exactly `[{type: "shortening_interval"}]`. Annual-to-monthly changes must occur at period end; monthly-to-annual upgrades invoice immediately. This prevents unused annual credits from leaving a stale year-long grant. Runtime rejects configuration drift. Enable payment-method updates and invoice history for self-service payment recovery. Keep promotion codes/retention coupons off. Set support/business information and review Portal terms. Price changes can charge immediately; Stripe must show the actual proration before confirmation. Do not configure a free trial in the portal.
4. Register `/api/billing/webhook` over HTTPS using snapshot events, your account (no Connect). Local forwarding: use the official Stripe CLI `listen --forward-to http://127.0.0.1:3000/api/billing/webhook`, supplying its endpoint secret privately. CLI/provider credentials are absent here, so no connected listener was run.
5. Subscribe to customer.subscription created/updated/deleted/paused/resumed; invoice paid/payment_failed/payment_action_required/voided/marked_uncollectible/updated; checkout.session completed/expired/async_payment_succeeded/async_payment_failed; customer.deleted; charge.refunded; charge.dispute created/updated/closed; refund created/updated/failed. Unknown event types are safely acknowledged. Supported unmapped customers are ignored, never mapped by email/metadata.
6. Run real local users through monthly/annual Checkout, cancel/back/retry, separate tabs/devices, SCA, failed payment, renewal, cancellation, plan changes, refund/dispute and Portal. Use Stripe test clocks where supported by the hosted Checkout/customer flow; distinguish directly created clock-bound subscription tests from Checkout integration tests. Verify eventual DB convergence and unchanged trial/history.
7. Record object IDs privately, sanitized outcomes publicly, SDK/API versions and delivery retry evidence. Do not claim provider-connected coverage from deterministic fixtures.

## Exact deployment order (no deployment authorized here)

1. An authorized operator inspects the **intended hosted project's migration history**. Verify every prior migration, specifically Superset grouping/catalog, manual Cardio, `20261113222401_entitlement_foundation` and `20261113222402_enforce_training_entitlements`. Merely seeing access_grants in Table Editor is insufficient. Hosted state was not inspected here.
2. Complete 7.7E's documented expand → compatible app → enforcement release and uncertain old-command cutover if it has not already occurred. Do not skip old-client refresh or backfill historical session authorization. Review backup/PITR and forward recovery.
3. Apply only the additive `20261117052026_subscription_billing.sql` in the reviewed migration pipeline. It preserves all existing RPC signatures/training enforcement, introduces no paid grant and defaults to test billing environment. Existing app versions continue trial/history behavior; they do not display/manage subscriptions, so never activate purchases before the new app is deployed.
4. Deploy the application **with billing configuration absent**. Validate Auth, trial, history/settings, unavailable paywall and database read privacy. No client-editable bypass is introduced.
5. Configure a separately authorized test environment's secrets, prices, Portal and signed endpoint. Confirm provider-connected tests and missing-webhook manual reconciliation, monitoring and operational support. Ensure server clock/DB UTC health, HTTPS canonical origin and webhook delivery availability.
6. Review taxes, cancellation/refund terms, privacy/retention, support, financial reconciliation, endpoint rate limiting and native-policy separation. Recheck current provider/store policies. Approve live objects/settings and live database billing mode separately; do not copy test grants or IDs into production.
7. Only with explicit live approval set live secrets and `BODY_BILLING_LIVE_APPROVED=true`, verifying mode, exact live catalog/Portal and actual endpoint. Validate an authorized purchase/cancellation and a fixed active-workout continuation in staging before launch sign-off. No automatic go-live is included.

## Recovery and operations

On incident, disable new purchase initiation by removing deployment billing configuration/approval, while preserving webhook/reconciliation processing where safe in a separately reviewed configuration. Removing all credentials also stops reconciliation: paid grants remain finite but refunds/revocations would be delayed. An operator must manage that risk and Stripe retries; do not silently disable processing indefinitely. Never reset trials, delete paid facts or issue unbounded replacement access.

Reconciliation runs on signed events and authenticated manual Refresh Billing Status; there is no continuous polling, cron, socket or provider call during training. Manual refresh has a database-clock three-second minimum between successful reconciliations. Webhook failures are retryable 503 responses; pending receipts retain attempt counts. Lease timeout is 120 seconds. Persistent operation IDs survive retries. A stale worker cannot commit after lease replacement. Customer/Checkout outcomes still unknown after 23 hours fail closed for authorized operator investigation before any new operation; do not casually rotate IDs or retry a provider mutation outside its idempotency guarantee.

For a stuck operation inspect private account operation/customer/Checkout IDs, then retrieve Stripe objects and compare identity/mode. No administrative minting or repair endpoint is provided. Resolve through a separately reviewed, audited operational change. Provider list limits (100 subscriptions, 200 invoices per subscription) fail closed instead of truncating authority; long-lived accounts require a later incremental reconciliation design before these bounds are reached.

Raw webhook bodies, card data, addresses, session URLs, cookies and secrets are never persisted in billing tables or logged by this code. Receipt identifiers/attempts are retained for reconciliation; account deletion cascades private billing rows with the existing account lifecycle. Legal/financial retention and actual account-deletion workflow remain release work. No private entitlement/billing responses may be service-worker/CDN cached.
