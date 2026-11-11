# Phase 7.6F — Performance and connectivity audit

## Scope and conclusion

Base: merged main `b06a850b3b8ce40b242ef3b6ba00a4465bd2cf4e` (PR #32). This review repeats current-code measurements rather than treating Phase 7.6A evidence as current validation. All accounts, workouts and scale fixtures are disposable local data. No hosted Supabase, Cloudflare configuration, schema, dependency, enrollment or performance model changes are included.

Three bounded improvements ship: an unchanged-draft uncertain-save retry correction, truthful browser-offline feedback, and a public-only offline fallback. Ordinary successful set saves are **not demonstrably faster**. A production iPhone bottleneck remains unestablished. This is not production-readiness sign-off.

## Architecture and request waterfall

Installed Next.js 16.4.4 / React 19.3.1 use App Router Server Components and Server Actions. OpenNext Cloudflare is pinned at 1.20.15; Wrangler is 4.156.2. The adapter retains Edge middleware because Node Proxy support requires a separately validated migration. The deprecation warning is not authorization to change runtimes.

`src/components/sets/workout-logger.tsx` retains the mounted per-workout serialized queue. A change updates its draft/sequence and synchronously writes the owner/workout-scoped tab recovery record. Blur or completion enqueues the command. `src/features/sets/actions.ts:mutateSet` validates it and verifies Auth before the invoker RPC. `src/lib/supabase/update-session.ts` independently verifies and refreshes authentication at the middleware boundary.

```mermaid
sequenceDiagram
    participant L as Logger queue
    participant N as Middleware / action
    participant A as Supabase Auth
    participant D as PostgREST / Postgres
    L->>N: mutateSet(command UUID, revision, exact inputs)
    N->>A: Middleware getUser
    N->>A: Action getUser
    N->>D: log_workout_set
    D->>D: Owner/parent locks, expiry, nonce, CAS, actual values
    D-->>L: Authoritative selection rows through action response
    L->>L: Sequence-aware reconciliation; Saved
    L->>N: Existing asynchronous continuity read
    N->>A: Middleware and action verification
    N->>D: workout_continuity
    D-->>L: Timer / closure facts
```

Measured ordinary edit: two browser POSTs, four upstream Auth GETs and two RPCs across the save and continuity read. There is no per-set route revalidation or whole-history/catalog refetch. Conflict recovery can add a current-row SELECT. Timer/focus reads are separate traffic. Server action serialization can make follow-up work compete with a later action; removing that read blindly would weaken current timer/expiry behavior.

Private Supabase fetches use `cache: "no-store"`; middleware sends private/no-store response headers. Protected layout, loaders and actions verify identity independently. The existing request-local React caches (Favorite keys and enrollment context) are not disk caches. No cross-request private cache is introduced.

## Measurements

[Numeric evidence](evidence/phase-7-6f/performance-summary.json) includes every profile summary. Node production server, system Chromium, loopback real Auth/PostgREST/Postgres, three rows in one exact bench selection; 12 sequential edited-set samples per profile before and after. DOM mutation observation measures input-to-Saved, rather than Playwright polling delay. Browser latency emulation does not add latency between the application server and Supabase. Runs are sequential, nonrandomized local observations, not cellular tests or an SLO.

| Browser profile                               | Baseline DOM p50 / p95 | Final DOM p50 / p95 | Samples each | Interpretation                                              |
| --------------------------------------------- | ---------------------- | ------------------- | ------------ | ----------------------------------------------------------- |
| Local, uncapped                               | 90.25 / 122.52 ms      | 79.20 / 92.57 ms    | 12           | Variable local runs; no ordinary-save optimization claimed  |
| CDP 80 ms, 1,250,000 B/s down, 250,000 B/s up | 129.10 / 142.98 ms     | 131.00 / 135.90 ms  | 12           | No demonstrated gain                                        |
| CDP 300 ms, 200,000 B/s down, 64,000 B/s up   | 357.00 / 374.69 ms     | 363.30 / 377.76 ms  | 12           | Confirmation remains sensitive to browser transport latency |

Matched final mutation spans (36 samples) have p50/p95 33.34/40.69 ms; RPC transport is 8.02/11.77 ms, including PostgREST/serialization rather than database-only execution. Each mutation span has two Auth reads and one RPC.

All ordinary saves still produce two fetches. Median request bodies total 415–416 bytes; encoded responses total approximately 1,160–1,165 bytes in this fixture. Headers/TLS are excluded. No >50 ms browser long task was observed in these small logging samples. A DOM-after-response interval is only a reconciliation proxy, not a React render/paint profile. There is no evidence here justifying logger memoization, heavy state management or animation changes.

The final controlled navigation probe blocks service workers: page-target CDP emulation does not reliably throttle fetches made by a worker target. The earlier worker-enabled navigation numbers are retained explicitly as unsuitable for this comparison. Cache behavior is tested separately with workers enabled.

Navigation probes perform five full-document visits per route/profile to Dashboard, Workout Home, focused Exercise Logger, Programs and History at 0/80/300 ms CDP latency. The numeric evidence reports readiness and transferred bytes. Readiness includes browser automation/content waiting; p95 from five samples is exploratory. Full-document visits are not proof of client Router Cache/back-forward/offline capability. The final controlled run also overlapped regression work, so executor contention differs. Warm asset/browser/OS caches and instrumentation differ between runs; navigation timing differences must not be attributed to a production request optimization. Initial login, prefetch/back-forward and all real cellular/startup latencies need separate hosted-device measurement.

A separate stress run applies 4× CPU slowdown to 48 edits across the same three profiles plus 80 ms / 32,000 B/s down / 8,000 B/s up. Its low-bandwidth profile DOM p50/p95 is 877.50/1,104.06 ms (12 samples). The entire stress run records 124 >50 ms long tasks; those are a run-wide count, not 124 in each profile. It overlaps full regression work and cannot isolate radio, CPU or executor contention. It demonstrates a slower emulated environment, not a physical iPhone diagnosis or a production regression. The 100-set probe separately tests the existing per-selection bound; its evidence records readiness, five confirmed edits, heap/node/script metrics and preserved row identity. At 100 sets, readiness was 3,947 ms and five automation-observed save/wait samples ranged 3,287–4,632 ms, with 26,543 DOM nodes and approximately 31.6 MB JS heap at the endpoint. These include automation, emulation and shared-executor load; they are not exact user paint timings. The logger maps full row/options markup (`workout-logger.tsx`), so bounded row rendering and response projection deserve a separate profiler-driven change. No render optimization is shipped without a controlled before/after proof.

## Uncertain-save defect and correction

Reproduction: edit a saved weight, commit the POST with `route.fetch()`, then drop delivery with `route.abort()`. The client retains Not saved and the entered value. Clicking Retry blurs the still-focused dirty field. Previously that blur generated another mutation UUID against the stale revision **before** the explicit retry could recover the original operation.

The baseline captured two save commands, two different UUIDs, the same revision and conflict review. The corrected queue (`src/components/sets/workout-logger.tsx:376`) recognizes an unchanged failed save/add by its sequence and reuses its exact original command on that blur. Final evidence captures two transport submissions but **one logical mutation UUID**, unchanged persisted revision, Saved only after authoritative acknowledgement, and no unnecessary own-write conflict. This is logical idempotency, not a network request reduction.

An explicit second-device edit after the uncertain commit still produces conflict review, retains the local 150 input and leaves the remotely saved 90 kg untouched. Changed draft sequences do not reuse an old command. Refresh recovery remains explicitly unconfirmed and can require review; this patch does not replace the database's last-mutation/CAS model with permanent mutation receipts. If another operation supersedes the last nonce, the safe conflict path remains necessary. Set identity/order, actual values, prescribed fields, pause durations and source attribution are unchanged.

## Cache classification and selected strategy

| Category                 | Current decision                                                                                                                                                                              |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A: public static assets  | Existing content-addressed `/_next/static/*` HTTP caching remains immutable. New worker stores only `/offline` and `/icon.svg`. No duplicate bundle cache.                                    |
| B: public reference data | Exercise/program data is authenticated/readability-dependent today. No persistent catalog/program response caching; versioning and public/private filtering need a separate contract.         |
| C: private reads         | SSR, RSC, current sessions, history, PRs, assignments and profiles remain network-only; no private service-worker/IndexedDB/localStorage cache. Existing tab drafts remain separately scoped. |
| D: mutations             | POSTs and all other non-GET requests are not intercepted. No retry replay, queue, background sync or cached response.                                                                         |

`public/body-sw.js` registers only in production, secure contexts with Service Worker support. Registration failure never blocks normal rendering. `src/app/offline/route.ts` supplies an explicitly static, account-independent HTML response without the application layout or Auth reads. A raw `.html` file was rejected during Worker validation because Workers Assets canonicalizes its extension into a redirect; this route keeps Node and Worker installation URLs identical. Its two allowlisted public resources are fetched with `credentials: "omit"`; redirected, opaque, failed and >32 KiB responses are refused. At most two entries / 64 KiB of body data are permitted (browser cache metadata is additional). There is no recurring application timer or application-initiated idle network work; the browser can check for worker updates under its own lifecycle policy. Root registration applies to navigation but **never stores the navigation response**. Same-origin GET navigation other than the public root is network-first; a transport rejection returns a public 503/no-store fallback. HTTP authentication errors/redirects and server errors are not converted into fictitious authenticated content. The worker requests manual redirect handling so the browser retains navigation authority. The public `/` redirect bypasses interception entirely: the Node adapter emits duplicate identical Location headers there, which Fetch can merge into `/dashboard, /dashboard`. A regression run caught this 404, so root navigation is explicitly excluded rather than normalizing or inventing redirect destinations. Installed `start_url` is `/dashboard`; fallback is not promised for offline `/`. RSC fetches, API calls, bundles, queries, cross-origin requests and mutations bypass interception.

The fallback says Connection unavailable, explains that unconfirmed changes are not saved, and provides Retry. It contains no account identity, previously visited URL list, workout values or token. It does not pretend to resume a private workout. The active, mounted logger remains the useful context while offline; a hard reload may instead show only this public screen. First-ever offline visits cannot install a worker. Offline fallback availability after installation is not offline training support.

## Cache lifecycle, privacy and failure handling

The cache namespace is `body-public-offline-v1`. Future shell changes must change this version with their reviewed asset contract. Installation must finish its allowlisted assets. There is no `skipWaiting`, so a new version does not force replacement under an open workout. After ordinary activation, old caches with this exact application prefix are deleted; unrelated origin caches remain intact. Hashed bundles remain the browser HTTP cache's responsibility; no stale bundle is replayed by this worker. Public `_headers` prevents a stale worker script on Cloudflare.

Storage eviction/unavailability: cache lookup failures return the network response when online. Offline navigation has a tiny inline public last resort even if the shell was evicted. An evicted shell remains the inline last resort until a later successful installation; it does not silently restore a private page. A failed first installation simply leaves the ordinary app; unsupported/disabled caching cannot authorize anything. Old app windows can delay a worker update until closed. iOS may evict storage or terminate the PWA without warning; no background-delivery promise is made.

Logout need not delete the two public assets: they are identical across accounts. Sign-out still invalidates root app state and clears the local Auth session through the existing SDK. Tests inspect every worker cache key after authenticated navigation and sign-out/back/reload: only the two public paths exist. Existing browser-memory or tab draft lifetime is not a new persistent cache. The owner prefix prevents another account's draft being rendered; this is not encryption, forensic erasure or protection from same-origin script compromise. Shared-device privacy and deliberate tab closure remain operational considerations.

## Connection feedback and draft limitations

`ConnectionStatus` listens only for browser online/offline events. It shows “Offline · saving needs a connection” when the browser reports offline, including in focused logger mode. Online merely removes that hint; it does not claim API reachability, reconnection, Saved or automatic synchronization. API failure still uses existing contextual Not saved/error/retry feedback. There is no new polling strategy.

Mounted logger state and exact selection remain intact on a failed set request. Reconnection alone does not submit a write. Existing synchronous sessionStorage recovery survives a same-tab reload after connectivity returns; browser termination, storage denial/eviction or another tab are not guaranteed. Unload/navigation/finish safeguards remain. A public fallback cannot reconstruct private state. No recovery is called synchronized until the server acknowledges it.

## Large-data findings

The isolated rolled-back synthetic fixtures cover new users, 60 sessions and 2,000 sessions with five repeated canonical-exercise selections and six sets per selection. At 2,000: 10,000 selections, 60,000 set rows, 10,000 deleted tombstones and 400 archived sessions. This intentionally dense repeated-exercise case stresses history payloads; it is not a representative production distribution or multi-user load test.

Authenticated `EXPLAIN (ANALYZE, BUFFERS)` on the large fixture: History page 21 rows executes in 8.843 ms, JSON body 9,072 bytes; exact-exercise history page 11 executes in 37.002 ms, JSON body 265,184 bytes. These are individual warm local measurements, not p95s. New/typical probe logs are retained too. Function scans/aggregation stay owner-scoped and pages bounded, but selecting every stored set column inflates Look Back payload. Do not “fix” this by dropping tombstones from logging responses without deletion reconciliation tests. No index is justified from this sample alone. Enrollment metrics and realistic multi-exercise/device memory profiles remain separate staging probes.

## Security, reliability and operational findings

- **P2, confirmed and corrected:** unchanged uncertain retry creates a fresh UUID at stale revision. Reproduction and correction above; real remote conflicts remain protected.
- **P2, confirmed:** standard `npm run db:test` recursively includes old `supabase/tests/audit/*.sql` investigation scripts, which are not TAP and include superseded assumptions. Its result fails; the explicit 26-file pgTAP invocation against the fresh isolated database passes 2,308 assertions. Fix the runner in a small tooling PR rather than weakening tests or old probes.
- **P2, confirmed stress observation:** the 100-set / 4× CPU logger probe has substantial DOM/task and save-wait cost; see measured limits above. Profile row rendering/response size on target hardware before a behavior-preserving extraction or memoization.
- **P2, confirmed scale observation:** exact-exercise history returns full set-row JSON, approximately 265 KB in the stated dense fixture (`20261110155120_workout_retention.sql:exercise_history`). Design a named projection preserving supported history before trimming it.
- **P2, code-review risk:** some lifecycle/retention/selection `useActionState` clients bind a server action directly. Their server catches cannot catch browser-to-action transport rejection; unlike closure/one-tap Favorite saving, they may fall through to the route error boundary rather than retain a contextual retry. Source: `src/components/programs/lifecycle-form.tsx:28`, `src/components/history/workout-retention.tsx:19`, `src/components/workouts/selection-form.tsx:27`. Do not infer a database transition from a UI error. Test and apply a consistent transport wrapper in an isolated follow-up, preserving redirect/control-flow throws and command IDs.
- **P2, code-review risk:** fire-and-forget continuity reads (`src/components/sets/workout-logger.tsx:447`, `:464`, `src/components/continuity/active-workout-bar.tsx:24`) can reject at the client transport boundary. Existing dirty state survives, but console/unhandled rejection behavior deserves focused hardening. No new poll interval is introduced.
- **P2, release gate:** build/lint dependency advisories remain (11 reported packages: 4 high, 7 moderate); production-only audit reports zero. Adapter/build glob command execution and cancellation paths and minimatch amplification need a compatible reviewed update or explicit build-risk exception. Audit's suggested adapter 0.3.0 is a breaking downgrade, not a safe fix. Do not run blind `audit fix --force`.
- **P1/P0:** no newly confirmed ownership/data-loss vulnerability in executed local regression. This is not a statement that hosted configuration or all threats have been cleared. Existing RLS, invoker grants, profile/session locks, one-active uniqueness, lifecycle/retention receipts, source immutability and evidence cleanup are exercised by the database suite.

Fresh replay catalog inspection additionally finds zero public ordinary tables without RLS and zero SECURITY DEFINER functions in public/body_private. This metadata check complements the behavioral role/ownership tests; it does not inspect hosted policy drift.

The production-only advisory result describes npm dependency classification, not proof that every build-tool implementation is absent from generated Worker code. Runtime bundle reachability and the CI/provider secret boundary need review with any compatible remediation; the audit does not waive the development advisories.

No auth verification was removed or replaced by caller headers/session data. No JWT, cookies, account values, raw traces or secrets are committed in measurement evidence. Hosted SMTP/redirects/rate limits, monitoring, restore drills and physical device work remain release gates in the roadmap.

## Offline-write design — proposal only

Recommendation **B**: retain current draft recovery and feedback now; build bounded durable drafts in a separately controlled phase before relying on connection-free workout capture. A may suffice for an explicitly online MVP if real device tests support it. C (a full replay queue) is not justified by these measurements and is not enabled.

A future durable-draft contract must define consent/privacy, owner/account namespace, schema version, TTL, maximum sessions/bytes and explicit purge on account removal/logout. Persist only minimum entered values and stable session/item/set UUIDs, selected canonical identity, original server revision and a command UUID. Use IndexedDB transactions only if justified, not a whole-history replica. Storage denial/quota/eviction must remain visible as unavailable durability. Never claim the browser guarantees persistence or background sync.

For eventual replay: model ordered session → selection → set dependencies, one immutable payload per mutation ID, sequence numbers for superseded edits and an explicit foreground reconciliation state machine (local, submitting, uncertain, confirmed, rejected, conflict). Exactly-once **logical** application requires server idempotency receipts that bind owner/session/intent/payload and survive intervening edits; the current last-nonce field is not a general durable operation ledger. Verify Auth and ownership on every reconciliation. Receipt replay must return its applied revision together with current authoritative state; an old receipt is not permission to display stale values as the current saved version. Never overwrite later remote revisions. Rejected/expired/closed/archived/deleted sessions and changed program assignments must stop replay and preserve a reviewable draft. Closure is a dependency barrier after all prior commands are acknowledged; offline Finish must remain an unconfirmed intent, never program completion.

Offline creation would be provisional local intent: canonical references, assignment/version and single-active constraints must be revalidated on reconnect. Device-reported occurrence time must be distinct from authoritative server receipt/closure timestamps under an explicitly approved timing contract; do not grant arbitrary timestamp writes to approximate offline history.

Logout/auth expiry must suspend submission; account switching must not expose or submit another account's entries. App termination must resume from bounded durable state only after explicit current-auth verification. Upgrade older draft schemas transactionally or offer review/export, never silently discard incompatible values. Foreground reconnect is the reliable baseline, with user-visible errors and manual retry; background delivery is optional and never required for correctness. This design requires separate threat review, multi-device/concurrent corrections, idempotency-payload mismatch, eviction, closure, retention and program-change tests before approval.

## Follow-up priorities

First validate physical iPhone Safari/PWA behavior and production-region waterfalls without recording credentials. Then isolate transport-boundary wrappers and the database test-runner correction; review dependency fixes. Profile large Look Back/enrollment payloads before adding indexes or client caching. Build bounded durable drafts only under its own approved contract. Do not conflate a public offline fallback with completed offline workout support. See [MVP roadmap](mvp-readiness-and-next-roadmap.md) and [executed validation](phase-7-6f-validation.md).
