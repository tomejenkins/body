# Phase 7.7F validation

Base: merged PR #38 (`c6ec9635e6dad2c36198e5e96983bc5807d7bf61`). Branch: `feat/phase-7-7f-subscriptions-paywall`. All database work targets disposable local Docker PostgreSQL 17.11. No hosted Supabase change, production configuration change, Stripe object creation, deployment or merge was performed.

## Provider boundary

**Stripe-connected validation is UNVERIFIED.** No Stripe/billing credentials were available. Actual hosted Checkout, Customer Portal, SCA/payment failures, Stripe delivery/retry timing, real test clocks, taxes and provider reconciliation have not been exercised against a Stripe account. This phase provides integration code and deterministic provider fixtures, not evidence of operational billing activation. A separately authorized, configured test-mode run is a release prerequisite. No fictitious production Price/customer/subscription IDs are supplied; test fixture IDs stay inside tests.

Official Stripe/webhook/idempotency/Portal/testing and current Apple/Google policy documentation was reviewed; links and provider decision are in [architecture](subscription-billing-architecture.md). The SDK is pinned to 23.1.0/API 2026-10-28.endive; fetch and async SubtleCrypto verification support the Worker build. Native-store payment permission remains a separate, storefront-specific review.

## Checks

Final outcomes are recorded after execution below. The first browser attempt was deliberately stopped after one new test used the wrong History heading: 29 passed, 1 failed, 2 interrupted, 218 not run. The application correctly rendered “Workout history”; the test was corrected. That interrupted attempt is not a green full-suite run. Earlier isolated replay was also interrupted when a concurrent disposable-stack reset replaced the database container; the final replay is run after reset completes. Initial paid-continuation fixture errors (timestamp microseconds and missing Cardio add command) were corrected to use exact trial duration and the actual add → save command protocol.

A second browser attempt was stopped for the Portal downgrade correction: 47 passed, 1 skipped, 2 interrupted, 200 not run; it had no failed assertion and is not a completed full run. The original 7.7D/7.7E grouped-save timing risk remains tracked. This phase does not claim it fixed. Any focused rerun is recorded separately from the full suite and does not turn a failed full command into a passing one.

### Final-source checks

| Check                                               | Outcome                                                                                                                                                |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ESLint                                              | Passed, no warnings                                                                                                                                    |
| Strict TypeScript                                   | Passed                                                                                                                                                 |
| Vitest                                              | 477 passed across 84 files; includes 67 billing/action cases                                                                                           |
| Prettier                                            | Passed                                                                                                                                                 |
| Exercise / program catalogs                         | Passed; 14 programs, 53 training days, 238 slots                                                                                                       |
| Fresh local reset and database lint                 | Passed; both public and body_private schemas                                                                                                           |
| Fresh isolated migration replay                     | All 34 forward migrations replayed                                                                                                                     |
| Standard npm run db:test                            | 2,609 assertions, 31 files, passed                                                                                                                     |
| Explicit isolated pgTAP                             | 2,609 assertions, 31 files, passed                                                                                                                     |
| Isolated database lint                              | Passed; local-only URL, CLI emitted a flag-deprecation warning                                                                                         |
| Real multi-connection scenarios                     | All nine passed (six retained entitlement, three billing)                                                                                              |
| Next.js production build                            | Passed, including final npm run build within OpenNext                                                                                                  |
| OpenNext / Cloudflare production build              | Passed                                                                                                                                                 |
| Wrangler dry-run                                    | Passed; no upload                                                                                                                                      |
| Local Worker public smoke                           | Root 307; login 200; Access/History 307 with private/no-store; offline 200; unconfigured webhook 503                                                   |
| Desktop/mobile browser suite                        | **Not fully green:** parallel 231 passed / 15 skipped / 4 timed out; serial 234 passed / 15 skipped / 1 timed out; unchanged focused reruns all passed |
| Actual Stripe / hosted / physical-device validation | UNVERIFIED; credentials/authorization unavailable                                                                                                      |

The local Worker used the existing Miniflare fallback when its Cloudflare request-metadata fetch failed. Its canonical origin remained the local Node app on port 3000. Public preview responses establish local adapter compatibility, not authenticated hosted or real Stripe delivery validation.

Reproduce the isolated checks with `bash scripts/validation/entitlement-database.sh`, then `python3 scripts/validation/billing-concurrency.py`; explicit pgTAP uses the pinned pg_prove 3.36 container against `body_entitlement_isolated`. These scripts never target a hosted project.

### Complete browser-run accounting

Both final-source commands ran all 250 desktop/mobile cases against the production Node server:

| Run                                       | Passed | Conditional skips | Failed | Duration     |
| ----------------------------------------- | ------ | ----------------- | ------ | ------------ |
| Full, configured two workers              | 231    | 15                | 4      | 27.9 minutes |
| Unchanged failed cases, one worker        | 4      | 0                 | 0      | 1.4 minutes  |
| Full, one worker                          | 234    | 15                | 1      | 25.3 minutes |
| Unchanged final failed case               | 1      | 0                 | 0      | 17.5 seconds |
| Separate accessibility/performance audits | 5      | 0                 | 0      | 1.5 minutes  |

The parallel failures were existing Manual Cardio Finish navigation (five seconds), Suggested Workout login navigation (five seconds), Workout Complete Finish navigation (five seconds), and the long visual-refinement workflow (180 seconds). The serial failure was an existing Workout Screens login-navigation wait (five seconds), which passed in the parallel run and its final focused rerun. The Cardio workout was authoritatively completed in the database despite its UI navigation assertion timing out. These observations do not prove the timing issues fixed or establish that all are the same root cause.

All 235 non-skipped cases passed at least once on the final source, including all six billing cases. **Neither full command was completely green.** Assertions and timeouts were not relaxed. Runner worker count was changed for diagnosis; the explicit multi-device/concurrent commands within tests and the nine independent PostgreSQL concurrency scenarios were preserved. No application/test source changed between these final full runs, focused reruns and audits. The 15 retained conditional skips are two desktop exclusions for mobile-only probes and thirteen mobile exclusions for viewport matrices already run by the desktop project. They are not failed auth setup or unconfigured-provider tests.

The five audit cases cover expired access at 200% text in both themes, entitlement navigation timing, ordinary set acknowledgement under three emulated networks, private-route/offline navigation, and ordinary versus grouped set-save request counts. Authenticated Worker/real-provider, physical-device and installed-PWA validation remain outside this evidence. The unresolved full-run timing failures remain a release gate; this record does not mark the entire phase release-validated.

### Deterministic billing behavior

67 focused Vitest cases cover forged plan inputs; deleted provider customer revocation; verified action identity and trusted destination boundaries; absent configuration; catalog drift; foreign customer/mode/trial subscription; paid finite invoice periods; unpaid/draft/void/uncollectible invoices; past-due/unpaid paid-through bounds; incomplete/paused/trialing; partial refunds/disputes; cancel-at-end and immediate/natural cancellation; paid positive prorations; deferred Portal downgrades and revocation of unexpectedly shortened prior terms; active/incomplete/lifetime duplicate purchase rejection; open Checkout reuse; changed-plan conflict; closed Checkout recovery; stale idempotency windows; lost provider/local acknowledgements; foreign return sessions; Portal allowlist and trusted redirects; real SDK raw-body signature verification; expired/wrong-secret/wrong-mode/Connect signatures; changed body; actual streamed body cap; retryable provider/projection errors; duplicate receipts; unmapped-customer isolation; out-of-order fresh retrieval; refresh throttling.

The new pgTAP tests exercise ordinary/anonymous direct-RPC and DML denial, private provenance isolation, server-role narrow grants, verified identity/mode, one live claim, forged/stale tokens, atomic snapshot/grant/event projection, duplicate/changed event identity, finite grant/source identity, no trial reset, safe owner summary, cross-owner isolation, lifetime/trial preservation, fixed continuation and stale-worker fencing. The separate paid-continuation fixture covers expired paid access, no new workout through grace, same-session Cardio add/save, renewal without deadline extension, terminal closure, identical receipt recovery and changed-payload rejection. Existing entitlement bypass/CAS/group/Cardio/retention/performance suites are retained.

A post-replay privilege audit confirmed empty search_path on all four billing definer functions: only service_role may execute claim/commit/customer lookup; only authenticated may execute the owner summary. A scan of .next/static found no private billing environment names or webhook fixture secret. Multi-connection validation uses eight concurrent billing claims, checks persistent provider operation IDs after acknowledgement loss, and proves an older worker cannot overwrite the newer mapping. Existing eight-activation, two-device set/Cardio CAS, revocation ordering, new-grant phantom and committed-receipt recovery scenarios are also rerun. These are real local PostgreSQL connections; provider concurrency uses deterministic fixtures, not real simultaneous Stripe requests.

### Browser scope

Real disposable local Supabase Auth/Mailpit users cover transparent pricing, unavailable checkout, 375/390/430 px, light/dark/reduced motion, 200% text, keyboard focus, manual-refresh failure, retained History, forged return URLs with unchanged trial facts, lifetime purchase prevention and auth return destinations. Existing trial expiration, same-session save/retry and full exercise/program/History suites remain in the desktop/mobile Chromium run. Screenshots: [375 px light](screenshots/phase-7-7f-premium-375.png), [390 px dark](screenshots/phase-7-7f-premium-390.png), [430 px light](screenshots/phase-7-7f-premium-430.png).

These browser tests deliberately exercise the unconfigured environment and protected fixture grants. They do not simulate a fake functional Stripe checkout or claim provider-connected E2E coverage. Chromium's iPhone viewport is not a physical iPhone, installed PWA, native store app or hosted validation. Slow/offline transport and uncertain logging continue through retained regression coverage; no new offline billing cache/queue exists.

### Performance

There are no Stripe calls or extra billing RPCs in training mutation paths. Profile/Access adds a request-local-deduplicated owner summary; configured plan display checks Product/two Prices. Local database benchmarks rerun account_access, workout start, set saves, Superset edits, Cardio saves and expired History. The final isolated fixture measured account summaries at 0.079 ms mean, new workout creation at 8.046 ms, set saves at 4.460 ms mean, Superset edits at 1.869 ms mean, Cardio saves at 2.443 ms mean and expired History at 4.830 ms mean. This is a disposable trial-account fixture, not a paid-account scale or provider-network benchmark. Local measurements are not hosted-region latency or actual Stripe timing. Final browser navigation samples were Dashboard 340 ms, Workout entry 702 ms, Profile 690 ms, new-workout RPC 33 ms, Workout Home 666 ms, Cardio-save RPC 31 ms and expired History 302 ms. There is no controlled before/after comparison, so these samples do not prove a speed improvement.

Across 12 acknowledged edits per profile, median acknowledgement was 182 ms locally, 193 ms with the 80 ms CDP profile and 874 ms with the 300 ms profile. Every sample had the existing two action requests; none added a billing/provider request. Ordinary and grouped cells each used six requests for three saves (three completed set-save requests plus existing companion requests), with zero grouping writes during set logging. Local grouped acknowledgements ranged 214–342 ms, ordinary 154–208 ms; at 150 ms CDP latency grouped ranged 546–760 ms and ordinary 516–657 ms. These are descriptive local Chromium samples, not physical-cellular or production-region measurements. No entitlement polling or browser-triggered background writes were added.

## Deployment prerequisites and release risks

Follow [the exact staged setup/rollout and recovery sequence](stripe-billing-setup.md). Hosted 7.7E migration history is unverified; the connected Supabase account did not expose a clearly identifiable Body project. No unrelated database was queried, and the project identity was requested for the read-only check. A table screenshot is not deployment evidence. Verify all earlier migrations, staged enforcement/client refresh, backups/PITR, financial support/retention, secret rotation, webhook retries/monitoring, taxes/consumer terms and current native policies before activation. Live mode requires separately approved provider objects/secrets plus the protected database environment and explicit server approval. Keep test/live projects separate.

Known conservative policies: any partial refund revokes that invoice's grants; disputed charges require support review before restoration; no zero/out-of-band/customer-balance paid evidence; card-only Checkout; an open Checkout must use its original plan until terminal; uncertain provider operations beyond 23 hours require audited operator reconciliation; provider history bounds fail rather than truncate (100 subscriptions, 200 invoices each). There is no admin grant/repair UI or public manual paid/lifetime granting endpoint. Service-role/secret credential scope remains a sensitive operational boundary described in setup.
