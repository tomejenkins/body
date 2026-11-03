# Authentication — Phase 3.1

## Status and database preflight

Email/password signup, confirmation, sign-in, recovery, SSR sessions, sign-out and minimal display-name onboarding use real Supabase Auth. Workout routes remain placeholders. No new schema or migrations are introduced.

Repository order is `20261103165311_initial_body_schema.sql`, then `20261103174917_enable_database_security.sql`. Both are immutable. Reviewed grants permit authenticated INSERT of `profiles(id, display_name, avatar_url)` and owner preference columns; RLS requires profile `id` and preference `owner_id` to equal verified `auth.uid()`. Owner identifiers and server timestamps cannot be updated. Profile deletion is denied to clients, protecting cascading history. Account deletion is deliberately absent; a future reviewed server-side flow must explain retention, cascade effects and identity verification.

Hosted deployment is **not verified** by this implementation. No authorized connection to the correct hosted project or management API was available. Local migration tests and local signup do not prove hosted readiness. Live signup is blocked until a project administrator verifies:

1. In the intended project's migration/deployment history, both timestamps above appear in order without errors.
2. Table Editor shows the 18 expected application tables; `profiles` and `account_preferences` have RLS enabled. Compare their policies and column grants with `docs/database-security.md` and the second migration.
3. Database security advisors show no unresolved exposed-table/RLS or function privilege findings. Review every finding rather than blindly applying suggested SQL.
4. Auth settings, project URL and publishable key belong to that same project. Review logs without copying tokens or personal data into tickets.

Do not run hosted SQL, migration repair, remote reset, or `db push` as an authentication setup step.

## Local setup

Use Node 24, `npm ci`, Docker and the pinned CLI. Start the full disposable stack with `npm run supabase -- start`. Use `npm run supabase -- status` privately to obtain its local API URL and **publishable** key; never paste its secret/signing/service-role output into logs. Copy `.env.example` to ignored `.env.local` and set:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<local publishable key>
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000
```

Then `npm run dev`. Local Mailpit is normally `http://127.0.0.1:54324`. Local `supabase/config.toml` enables email confirmation, a 12-character minimum and increased synthetic-test email/sign-in limits. These are local test settings, **not** a production rate-limit recommendation. Do not sync this config to a hosted project as part of this task. Resetting the disposable database deletes local users/data.

In this managed environment, Docker BusyBox health probes incorrectly sent loopback requests through the session proxy. The tested auth-only workaround was:

```sh
SUPABASE_INTERNAL_IMAGE_REGISTRY=ghcr.io npm run supabase -- start --ignore-health-check \
  -x realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor
```

Use this only when diagnosing that specific local proxy issue. It does not establish full-stack health. Verify `GET http://127.0.0.1:54321/auth/v1/health`, Mailpit and functional auth tests independently. No production settings should be changed to work around local health probes.

## Hosted manual configuration

These steps are for an administrator; the implementation changes no hosted settings.

- Enable email/password provider and **Confirm email**. Configure the hosted minimum password length to at least 12; review password protections, signup limits and abuse controls before public rollout.
- Set Auth Site URL to the canonical HTTPS application origin. Add its exact `/auth/callback` redirect URL. Add only the local callback origins needed for development (`http://127.0.0.1:3000/auth/callback`, optionally `http://localhost:3000/auth/callback`) and explicitly approved preview origins. Do not permit unrestricted production redirect wildcards.
- Set all three public variables above in Cloudflare **Build variables and secrets** and runtime **Variables and Secrets** on the existing Worker. Use the same project and canonical HTTPS origin. Public Next.js values are inlined: rebuild after any change. A branch preview needs its own explicitly configured canonical origin and allowed callback. `keep_vars: true` preserves dashboard runtime variables; Wrangler contains no duplicated credentials.
- Configure a real transactional SMTP provider in Supabase Auth settings, with verified sending domain, required DNS records, delivery monitoring and suitable limits. Never add SMTP credentials to this app's public variables or source control.
- `no-reply@body.thomas-jenkins.net` is suitable for automated messages. Sending from it **does not create an inbox**. If testers should reply, use a functioning support mailbox/Reply-To or separately configure inbound forwarding. No mailbox, SMTP or DNS configuration was performed here.
- The default Supabase email templates using `{{ .ConfirmationURL }}` work with the PKCE callback and must be opened in the browser that initiated signup/reset. The callback also supports `token_hash` with `type=signup` or `type=recovery` for explicitly reviewed templates. Any custom template must target the trusted app callback and preserve recovery destination; test it separately. Other OTP types are rejected.

## Security and routing

`src/features/auth` holds validation, account initialization, server actions and identity checks. `src/lib/supabase` contains SDK adapters and session refresh, not SQL. The six existing URLs now live under the protected `(app)` route group. A separate `/onboarding` asks only for a display name. Owner-scoped SELECT/INSERT initializes profile/preferences, handles duplicate races and partial retries, and never overwrites an existing display name. An unavailable profile read offers retry instead of inventing a user or silently broadening permissions.

Server Actions obtain identity with `getUser()` before account/password writes. Supabase email/password operations are real; no production mocks, custom password tables, user-metadata authorization or service-role shortcuts exist. Middleware refreshes cookies and server layouts independently verify identity; client-only routing is not an authorization boundary. Each future data loader/action must verify identity and rely on RLS even when rendered inside the protected layout.

Only internal destinations under the six protected route roots are accepted; callbacks additionally allow `/reset-password`. Canonical-origin configuration prevents forwarded-host/open-redirect attacks. Invalid/expired callbacks show a generic retry instruction. Unavailable/invalid sessions fail closed. Signup and reset messages avoid claiming whether an address exists.

Cookies use the SDK's SSR storage with host-only scope, `SameSite=Lax`, and `Secure` on HTTPS. No custom localStorage token mechanism exists. The SDK browser client may read its session cookies by design; do not claim these cookies are HttpOnly. Private pages are dynamic, SDK server fetches use `no-store`, middleware and callbacks carry private/no-store and SDK refresh headers, and Next Server Actions use framework no-cache responses. Never configure CDN cache rules or a service worker to cache private/auth responses. Do not log passwords, authorization headers, callback queries, cookies or session tokens; redact these in any future access logging/observability configuration.

The pinned OpenNext version has experimental/unmaintained Node proxy support. This implementation retains compatible Edge `middleware.ts` despite Next 16's deprecation notice; do not blindly rename it to Node `proxy.ts` without testing a supported adapter upgrade. Authorization remains enforced in server code and RLS. Existing Worker name, bindings and deployment scripts are preserved.

Sign-out revokes the current refresh session (`scope: local`) and clears its cookies. It is not an all-device logout or immediate revocation of already-issued access JWTs; those remain valid until expiry under Supabase's token model. Password recovery changes the password then signs out locally. An authenticated user can also change their own password from the reset form; reauthentication/MFA and all-device session management are future work. No account-deletion or email-change UI is introduced.

## Validation and manual smoke test

Run lint, typecheck, unit tests, formatting, build, `cf:build`, `cf:check`, `db:lint`, `db:test`, and Playwright. The browser helpers refuse hosted targets: only local Supabase at loopback port 54321 is accepted. They create unique synthetic accounts through public Auth, read local Mailpit, and exercise the real owner policies; no admin/service-role keys are used. Session-expiry tests age only synthetic local cookie metadata and invalidate a local refresh token to test fail-closed handling. Test artifacts may contain synthetic session data; keep them ignored and local.

```sh
npm run lint
npm run typecheck
npm test
npm run format:check
npm run build
npm run db:lint
npm run db:test
npm run test:e2e
npm run cf:build
npm run cf:check
npm run cf:preview
```

Playwright needs the three public variables in its process environment as well as the dev server; export them securely or use Node's env-file option with the Playwright CLI. For Worker browser checks, build with `NEXT_PUBLIC_SITE_URL=http://127.0.0.1:8787`, run local preview, then set `PLAYWRIGHT_BASE_URL=http://127.0.0.1:8787`. Return to the normal origin and rebuild before ordinary development. No `wrangler deploy` or branch upload is required for local checks.

Manually verify signup→email→display name→dashboard; reload; failed and successful login; partial setup retry; sign-out→protected redirect; forgot password→email→new password→sign-in; expired links; light/dark mode, keyboard focus and mobile inputs. Run these only against an approved development target. Hosted email delivery and actual devices require separate manual validation.

## Future OAuth and limitations

Google requires an approved provider project, consent screen, client credentials, correct Supabase provider callback and app redirect allowlist. Apple requires Apple Developer configuration, Service/App IDs, verified domains/return URLs and securely rotated signing credentials. Both require reviewed account linking, provider state/PKCE behavior, native deep links and privacy handling. Neither provider is implemented here. Offline/PWA sessions, MFA, CAPTCHA, broader abuse prevention and personalized workout onboarding remain separate work.

Publishing this branch could activate connected Supabase/Cloudflare automation. Do not push or open a PR until automation for this branch is confirmed compatible with the no-deployment scope. Previous branch exceptions are insufficient.

## Validation record (2026-11-03)

- Lint, strict typecheck and Prettier: passed.
- Vitest: 49 tests passed across 8 files.
- Local database lint: no errors; pgTAP: 1,038 tests passed across 2 files.
- Next.js production build: passed with the existing webpack builder.
- OpenNext Workers build and Wrangler deployment dry-run: passed; no upload/deployment.
- Playwright: all 18 desktop/mobile tests passed against Next development runtime, then all 18 passed against local Workers runtime, using real local Auth, Mailpit and RLS. The mobile login page was also visually reviewed.
- Expected limitations: Next's middleware deprecation warning remains for adapter compatibility; the local Worker used a fallback `Request.cf` object when its metadata fetch was unavailable. Docker health-probe proxy limitations are described above. No hosted migration/advisor inspection, real SMTP delivery, production deployment or physical-device validation was performed.

The feature branch is prepared locally. Publishing/PR creation is blocked until deployment automation for this specific branch is confirmed safe; no remote SQL, migration push, hosted test accounts or deployment was performed.
