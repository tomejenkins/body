# Entitlement foundation — implementation plan and authorization contract

Preflight: main ef3811fcbd2dd3ccfdadf92329fb1d1ee349b942 (PR #37).
Read AGENTS.md, auth/account/session/layout, database schema/security, continuity,
current migration chain, feature RPC inventory and MVP release gates. No hosted operations.

## Plan before implementation

1. Add private immutable account trial facts, normalized grants and session authorization
   snapshots. Use narrowly scoped identity-bound initialization and summary functions.
2. Initialize on verified authenticated app activation, including existing accounts.
   Uniqueness serializes activation; retries never rewrite facts. No signup backdating.
3. Add database mutation guards independently of routes. Preserve invoker RPCs,
   receipt-first recovery, owner RLS, session/program locks, CAS and evidence rules.
4. Add typed server integration and minimal account/access UX; preserve historical reads.
5. Replay the full migration chain, add adversarial database tests, run regression,
   builds and browser checks. Record actual outcomes and release limitations.
6. Commit/push and open a review PR; never merge, deploy or touch hosted databases.

## Action authorization matrix

All allowances retain existing identity, ownership, lifecycle and validation rules.
“Continuation” means only the same server-authorized live session, never another session.

| Actual action/path                                                      | Active grant required     | Expired allowance                                             |
| ----------------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------- |
| start_ad_hoc_workout / start_exercise_workout / start_suggested_workout | Yes                       | No new session                                                |
| start_favorite_workout                                                  | Yes                       | No new session; existing Favorite readable                    |
| start_assigned_workout / start_program_workout                          | Yes                       | No new session                                                |
| program_lifecycle start / switch                                        | Yes                       | No                                                            |
| program_lifecycle cancel_end                                            | Yes                       | No; changes future eligibility                                |
| program_lifecycle end_now / end_after_next                              | No                        | Cleanup only; no new performance                              |
| configure_program_schedule / decide_program_schedule                    | Yes                       | No new scheduling decisions                                   |
| New workout_exercises / workout_movements / selections / replacement    | Yes or continuation       | Same live session only                                        |
| log_workout_set add/save/complete/reorder                               | Yes or continuation       | Same live session only                                        |
| Set deletion/removal                                                    | Yes or continuation       | Same live session only; whole-record deletion remains cleanup |
| change_workout_group / direct group commands                            | Yes or continuation       | Same live session only                                        |
| record_workout_cardio add/save/remove                                   | Yes or continuation       | Same live session only                                        |
| edit_suggested_movement / edit_workout                                  | Yes or continuation       | Same live session only                                        |
| set_workout_pause / workout_continuity explicit resume                  | Yes or continuation       | Same live session only                                        |
| end_workout completed                                                   | Yes or continuation       | No invented completion after deadline                         |
| end_workout abandoned                                                   | No                        | Explicit cleanup allowed                                      |
| Identical committed command receipt recovery                            | No new authority          | Allowed; changed payload remains rejected                     |
| History / Program History / Look Back / PR / progress / dashboard reads | No                        | Owner reads retained                                          |
| retain_workout archive / restore / delete                               | No                        | Existing retention rules retained                             |
| Favorite creation                                                       | Yes                       | No new reusable training structure                            |
| Favorite rename / removal                                               | No                        | Owner management retained                                     |
| Custom exercise / program draft creation                                | Yes                       | Existing structures readable                                  |
| Profile/preferences/equipment/favorite exercise preference              | No                        | Account management retained                                   |
| Login/logout/confirmation/recovery/privacy access                       | No                        | Retained independently of payment                             |
| Trial/grant INSERT/UPDATE/DELETE                                        | Never ordinary client DML | Never                                                         |

## Domain and trusted time

One full-training capability, authorized by any current nonrevoked grant. Types:
trial, subscription, promotion, lifetime. Expired trial never overrides another grant.
Perpetual lifetime uses NULL expiration with explicit provenance. Future subscription
provider/source references identify authoritative periods; later signed event receipts
must handle duplicates, ordering, renewal, failure, cancellation, refund and reconciliation.
No provider, redemption, administrative minting endpoint or tier is implemented here.
Future promotion policy/redemption limits require separate atomic audited workflows.

Trial is exactly 1,209,600 seconds, UTC: valid_from <= database clock < expires_at.
Unique account identity, immutable policy/provenance and expiration. Verified accounts
without a trial receive their initial trial on first eligible activation after rollout;
no backdating, historical edits or bulk lifetime grants. This grants preexisting
production accounts fourteen days from activation, which release messaging must explain.
UUID uniqueness does not prevent multi-account abuse. Future rate limits and verified
billing/fraud controls remain separate; no fingerprinting or cross-account tracking.

## Continuation and consistency

A server snapshot at session creation binds its authorizing grant and fixed deadline:
grant expiration + four hours (perpetual grant needs no expiration grace). Existing
12-hour inactivity expiry, ownership, closure and archive rules remain stricter bounds.
No legacy session receives guessed authorization. Refresh/pause/retry cannot extend
this snapshot. Revocation must not create continuation authority. No automatic finish
or abandon occurs due to entitlement expiration; already saved facts remain unchanged.

Authorization uses clock_timestamp after the existing session lock, at the database
mutation guard. A request sent earlier but received after the boundary has no privilege
from its send time. A mutation accepted before the boundary may commit later. Receipt
recovery returns only already committed identical operations; it does not authorize a
changed payload. Privileged future grant revocation must serialize with authorization
on grant rows; document/test this before adding its workflow. No browser clock or
cross-request positive cache supplies write authority.

## Rollout contract

No hosted baseline has been verified. Before release: verify Superset grouping,
Superset catalog and manual cardio migrations are present in order; verify backup/PITR
and forward recovery readiness. Apply schema/summary expansion first, deploy app status
support, validate verified-account activation in staging, then apply enforcement in a
separate reviewed release. Do not apply the whole migration directory unattended while
an older application is serving: enforcement changes error semantics and legacy active
workouts have no authoritative start snapshot. Finish/abandon those before enforcement,
or approve a bounded migration policy with independently verified authorization facts.
Never invent a global client-editable bypass or backdate trial activation.

Validate active/expired accounts, receipt retries, concurrent devices and same-session
continuation before release. Recovery is a reviewed forward migration restoring prior
function/trigger definitions, not deleting trial/grant facts or resetting clocks. No
automatic bypass is enabled. Roll back application only against compatible database
rules. Production rollout requires separate approval and staging evidence.

## Privacy and performance

Private entitlement provenance must not be returned by owner summaries. No anonymous
reads or ordinary grant writes. Narrow initialization is the only trial minting path;
no service-role application adapter. Request-local summary deduplication is safe; shared
positive caching is not. Writes check indexed owner/grant/session facts locally in SQL,
with no extra entitlement network request per set. Reads/errors must distinguish denied
access from unavailable authority, retaining safe owner history reads during outages.

## Implemented storage and execution boundary

`body_private.account_trials` holds the immutable activation receipt (account PK,
activation/expiration, `14d-v1`, verified-activation provenance). Its duration constraint
uses 336 hours, including across DST. `body_private.access_grants` holds the one
full-training capability with type, protected source/reference, validity/revocation
and creation time. The unique trial index and unique source/reference prevent duplicate
activation and source ingestion. Both tables enable RLS with no API-role table grants
or policies. This is stricter than owner table access: only identity-bound summaries
are exposed. Trials are never deleted to restart them; account deletion remains a
separate privacy operation, not a renewal workflow.

`public.activate_account_trial()` checks the actual Auth row for confirmed email and
nonanonymous identity. A fast existing-record read avoids repeat initialization locks;
missing records serialize on the Auth account row, recheck and create both facts in one
transaction. There are no caller identity/time/duration arguments. Existing verified
clients also initialize their first trial lazily at a guarded mutation, so enforcement
does not deny every preexisting account before it visits the new UI. The app activates
on entry after existing profile onboarding. Network/database failure produces an
unavailable decision, not an expired trial message. Auth recovery and read routes remain
independent.

`public.account_access(uuid)` returns only allowed/source/state, relevant expiration,
trial dates, checked time and optional owned-session continuation fields. All grant
kinds use the same validity predicate. The longest current grant (perpetual first)
supplies the relevant end time, with deterministic ID ordering for ties. A trial record
may remain expired while another grant authorizes. This is not a second trial flag.

Session columns `access_grant_id`, `access_authorized_at`, and
`access_continuation_until` are server-owned start facts. Their composite owner FK binds
the grant to the same owner; clients have no insert/update column privileges. The
session guard stamps them at authorized creation. Ordinary updates cannot rewrite them.
Legacy rows retain NULL snapshots and can still use a current full account grant;
without such a grant they have no fabricated grace period.

Existing training RPCs and RLS remain SECURITY INVOKER. Three narrowly scoped private
SECURITY DEFINER authority/trigger functions can read private grants and stamp start
facts; they cannot be executed directly by authenticated, anonymous or service roles,
and have empty search paths and explicit identity/owner checks. They do not run the
training mutation under elevated privileges. Public activation/summary functions also
have empty search paths, explicit identity checks and authenticated-only execution.
The privilege regression suite explicitly limits this exception to those three private
functions, rather than allowing arbitrary future privileged helpers.

Guards cover sessions; exercise selections; movements; sets; group/cardio commands;
lifecycle receipts and assignment/schedule changes; schedule decisions; Favorite
creation; new custom exercises/programs; and template days/slots/groups/prescriptions,
progression rules, versions and equipment/alternative expansion. Existing validators
run first so their lifecycle/owner/CAS rejection semantics are preserved. The narrowly
retained FK cleanup that clears a deleted source slot cannot alter any actual evidence.
Favorite rename/removal, retention receipts, account settings and enrollment end
commands remain governed by their existing owner rules. Historic classification,
performance eligibility and record computation are untouched.

After session locking, authorization locks owner grant rows in ID order, records exactly
the locked grant IDs, then samples `clock_timestamp()`. Both the selected active grant
and continuation grant must be in that locked set. This closes a READ COMMITTED phantom
race: a grant inserted after the lock scan is considered on the next request, never
selected unlocked by a later query in this transaction. Revocation waits for accepted
writes, or a waiting write sees the committed revocation before acceptance. A command
must pass every applicable row guard; the last such guard is its acceptance point.
Commit can occur later. Future administrative/billing workflows must respect this lock
order and must not acquire session locks while holding grant locks.

No new receipt is inserted for a read. Existing RPC receipt lookups happen before new
training DML. A receipt retry therefore bypasses no authorization check for new work:
it performs no new work at all. Existing stale-revision conflicts, payload comparisons,
nonces and draft recovery retain their previous meaning. Abandon is allowed after grace;
Finish requires full/continuation access unless it is recovering an already committed
identical closure. Restoring access never reopens a terminal or lifecycle-expired session.

## Exact proposed release order

1. Confirm hosted migration history through `20261111230809_manual_cardio`, including
   `20261111202827_workout_exercise_groups` and `20261111204706_superset_program_catalog`.
   Verify target, backup/PITR, restore ownership, existing clients and integration settings.
2. Require a reviewed runner that can stop at a migration version. Apply only
   `20261113222401_entitlement_foundation.sql`. Do not use an unattended batch that also
   applies the pending enforcement file. If native integration cannot stage this, first
   obtain approval to pause it or split release delivery; no infrastructure was changed here.
3. Deploy the app's access-status support against that expansion. Verify a real verified
   existing/new account activates exactly once and reads History/settings. Check app
   availability before continuing. No checkout/promo/admin mechanism exists.
4. In staging, inspect legacy active sessions; let users finish/abandon or verify that
   their newly activated full trial covers existing lifecycle eligibility. No historical
   authorization is backfilled. Test trial/grant expiration and lost-ack recovery.
5. Apply `20261113222402_enforce_training_entitlements.sql` in the separately reviewed
   enforcement release. It has no client-editable/global bypass. Old verified clients
   receive their one initial trial at first guarded write, but their generic error UI
   cannot explain later denials; deploy the supported app before enforcement and require
   old tabs to refresh. Do not leave old clients serving beyond trial expiry.
6. Validate active/expired/overlapping-grant accounts, exact boundary fixtures, direct
   RPC/DML denials, same-session grace, fixed deadlines and retained History/settings.
   Observe real region latency and error rates before production authorization.
7. Forward recovery: pause rollout, preserve all trial/grant facts, and review a new
   migration removing only the new enforcement triggers/restoring compatible functions
   if necessary. Such a rollback temporarily restores pre-entitlement write policy and
   requires explicit operational approval. Never reset trials, rewrite evidence or
   destructively roll schema back. No bypass or recovery migration is automatically run.

Final physical-device/PWA, hosted email, production-region latency, billing, promotion
redemption, lifetime administrator workflows and production launch remain separate gates.

## Set-command receipt amendment

The preexisting set RPC only remembered the latest mutation UUID; it did not bind that
UUID to the submitted payload and could not recover an older acknowledgement after a
newer device edit. Phase 7.7E therefore adds `public.workout_set_receipts`, the 43rd public
model table, with authenticated owner RLS, narrow validated INSERT, owner SELECT and no
client UPDATE/DELETE. Its input trigger remains SECURITY INVOKER and verifies parent
ownership, the committed set's mutation/revision and actual fields. A receipt cannot
create set evidence, rewrite a set or authorize a future write. New receipt insertion
also passes the same training/continuation guard. Set, receipt and activity commit or
roll back together. Parent/set permanent deletion cascades receipts.

The forward replacement of `log_workout_set` retains its signature, invoker privileges,
session lock, CAS, effort/entered-unit validation, ordering and evidence behavior. It
checks the owner receipt and the complete canonical SQL-argument payload before new
mutation/lifecycle checks. An exact old request returns the current owned rows without
writing or overwriting a newer device's edit, even after grace or closure. A changed
payload with the UUID raises a reuse error. New commands still require active authority.
This does not add an entitlement HTTP call to saves.

No payload facts are invented for pre-migration commands. A legacy mutation with no
verifiable receipt returns a conflict requiring an explicit refresh of saved state;
it never becomes a new paid mutation or a false Saved acknowledgement. Deployment must
resolve uncertain old-client commands and refresh old tabs before the enforcement
cutover. Existing saved data remains readable, and it is never replayed automatically.
