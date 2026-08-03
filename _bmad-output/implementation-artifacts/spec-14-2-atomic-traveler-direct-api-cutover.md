---
title: 'Atomic traveler direct API cutover and Auth.js retirement'
type: 'feature'
created: '2026-08-03'
status: 'blocked'
baseline_revision: '330ab7ba9dc66c0dcbf8845cdc86baaaff2f163e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/planning-artifacts/sprint-change-proposal-2026-08-03-story-14-2-atomic-traveler-cutover.md'
warnings: [oversized, multiple-goals]
---

<intent-contract>

## Intent

**Problem:** The direct AI Ask/read cutover cannot preserve the traveler planning shell while its commands, referral capture, and Auth.js state remain root-owned. The present direct routes also cannot reach Nest during ordinary local development without transport-only same-origin forwarding.

**Approach:** Finish one atomic traveler cutover: Nest owns all read/write/OAuth/session/referral behavior rendered by `/ai-ask`; the browser uses only relative direct cookie-session APIs; root traveler Auth.js and server-action owners are removed. Preserve root `/admin` and `apps/admin`, and leave deployment evidence to Story 14.6.

## Boundaries & Constraints

**Always:** Preserve existing ownership, deletion, audit, proposal lock/fence/expiry/history, annotation-binding, feedback, AI Ask protocol/idempotency/atomicity, Vietnamese recovery, and safe error semantics. All browser mutations use an admitted opaque session, exact allowed Origin, and session-bound CSRF. Extract reusable domain/database ports rather than importing root `src/` into Nest. Local relative routing may only forward requests; it must not authenticate, mint credentials, interpret payloads, or own domain behavior. Validate every direct request/response strictly and preserve root-admin and `apps/admin` behavior.

**Block If:** A current traveler command cannot be moved without changing its established ownership/security transaction semantics; referral capture cannot be safely bound to the Nest OAuth transaction; or removing Auth.js has a remaining traveler caller that cannot be migrated. Stop rather than retain an Auth.js/BFF/root fallback.

**Never:** Do not migrate root `/admin` or `apps/admin`; do not add a browser token, public/private API URL, BFF credential, Next route handler, server-action domain owner, selector, shadow read, fallback, or dual writer. Do not claim deployed ingress, staging, rollback, migration ordering, or launch evidence.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Traveler command | Live browser session, exact Origin, valid CSRF, owned target and valid command payload | Nest applies exactly the established owner-scoped command and returns a strict direct result | Foreign/stale/invalid/expired input fails safely before mutation with no legacy retry |
| Referral sign-in | Public `ref` query has a valid referral code and user completes Nest Google OAuth | OAuth transaction retains validated first touch and callback records it once with the signed-in user | Invalid/refused/replayed OAuth or referral never attributes another user or leaks state |
| Local direct transport | Browser calls relative `/v1/*` or `/auth/*` in development | Transport-only same-origin forwarding reaches Nest with cookies/headers intact | No forwarding rule implements auth/domain behavior or silently falls back |
| Stream/shell boundaries | Malformed/out-of-order stream, 200-message/history shell, optional detail failure, logout uncertainty | Strict terminal stream state, bounded enrichment, project-matched history, parsable shell, and immediate local logout clearing | Invalid data fails safely without duplicate content, stale data, or another transport |

</intent-contract>

## Code Map

- `src/features/chat-trips/actions.ts`, `src/features/feedback/actions.ts`, `src/features/chat-trips/{conversations,trip-projects,trip-change-proposals}.ts`, and `src/features/feedback/answer-usefulness.ts` -- current traveler Auth.js/root command owners to extract and retire.
- `src/auth.ts`, `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, and `src/features/auth/actions.ts` -- traveler Auth.js chain and referral event owner; preserve any root admin callers only through separately migrated admin scope.
- `packages/domain/src/index.ts`, `packages/database/src/index.ts`, and `packages/contracts/src/index.ts` -- new transport-neutral traveler command ports, PostgreSQL implementations, and strict request/result contracts.
- `apps/api/src/conversations/`, `apps/api/src/feedback/`, `apps/api/src/referrals/`, and `apps/api/src/auth/` -- direct Nest command/referral adapters protected by existing browser admission.
- `src/features/ai/direct-api-client.ts`, `src/features/chat-trips/direct-shell-loader.tsx`, `src/features/ai/ai-ask-composer.tsx`, and `src/app/ai-ask/page.tsx` -- browser direct reads, stream, command callbacks, shell state, and traveler recovery.
- `next.config.ts`, `compose.yaml`, and development documentation/configuration -- transport-only local same-origin forwarding boundary.
- `tests/ai-ask-direct-api.test.ts`, `tests/api-platform-contract.test.ts`, `tests/browser-identity.integration.test.ts`, `tests/api-request-principal.integration.test.ts`, `tests/trip-projects.test.ts`, `tests/trip-change-proposals.test.ts`, and `tests/answer-usefulness-feedback.test.ts` -- direct-client, command, security, and retained-domain regressions.

## Tasks & Acceptance

**Execution:**
- [ ] `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, and `packages/database/src/index.ts` -- strict create/delete/feedback command contracts and a principal-supplied PostgreSQL port are present; proposal apply/dismiss extraction remains required to preserve its aggregate transaction.
- [ ] `apps/api/src/conversations/`, `apps/api/src/feedback/`, `apps/api/src/referrals/`, and `apps/api/src/auth/` -- direct Nest endpoints exist for create/delete/feedback and OAuth-bound referral capture; proposal apply/dismiss endpoints remain blocked on aggregate extraction.
- [ ] `src/features/ai/direct-api-client.ts`, `src/features/chat-trips/direct-shell-loader.tsx`, `src/features/ai/ai-ask-composer.tsx`, and `src/app/ai-ask/page.tsx` -- send all traveler reads/commands directly, preserve every current control/workspace behavior, and repair stream, enrichment, history, message-bound, query, and logout review findings.
- [ ] `src/auth.ts`, `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/features/auth/actions.ts`, `src/features/chat-trips/actions.ts`, and `src/features/feedback/actions.ts` -- remove traveler Auth.js/server-action/runtime owners only after caller inventory; preserve root admin and `apps/admin` behavior.
- [x] `next.config.ts` and relevant local configuration/tests -- add a transport-only same-origin development mapping for `/v1/*` and `/auth/*` to Nest, retaining request cookie/header behavior without a domain proxy.
- [ ] `tests/` -- replace root traveler action/Auth.js coverage with serial direct browser-session integration and direct client tests for all matrix cases, including ownership, CSRF, referral, transactions, and no traveler Auth.js caller inventory.
- [ ] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- record task completion, verification, exact retained admin boundaries, and Story 14.6 operational handoff.

**Acceptance Criteria:**
- Given a signed-in traveler uses any existing `/ai-ask` shell control, when it creates/deletes a conversation or trip, applies/dismisses a proposal or annotation action, or sends feedback, then an owner-scoped Nest direct API command performs the established behavior under session/Origin/CSRF admission with no root server action, Auth.js principal, BFF, or duplicate writer.
- Given a public referral sign-in or traveler session transition, when Nest OAuth/login/logout occurs, then Nest safely captures valid first touch, issues/revokes only its opaque session, and traveler runtime has no Auth.js route/config/session/event dependency; root admin and `apps/admin` retain their current independent behavior.
- Given local direct browser traffic uses relative `/v1/*` and `/auth/*`, when development routing runs, then it reaches Nest through a transport-only same-origin forwarder and requests never resolve to a Next 404 or use a private browser API URL.
- Given malformed/reordered stream input, optional detail failures, selected historical conversations, maximum shell history, logout uncertainty, or repeated query parameters, when the direct shell processes them, then it preserves only valid owner-scoped state and fails safely without duplicate/stale content or a legacy fallback.

## Verification

**Commands:**
- `pnpm test:unit` -- expected: client/contracts/domain pure behavior passes without database infrastructure.
- `pnpm test:integration` -- expected: serial direct Nest mutation, browser-session/CSRF, referral, owner isolation, deletion, proposal, feedback, and OAuth tests pass.
- `pnpm typecheck` -- expected: all workspace strict typechecks pass.
- `pnpm lint` -- expected: no new errors.
- `pnpm build` -- expected: production builds pass.
- `git diff --check` -- expected: no whitespace errors.

## Implementation Notes

- 2026-08-03: Completed the local development-only transport mapping in `next.config.ts`: relative `/v1/*` and `/auth/*` requests forward to the local Nest listener without adding authentication, credentials, payload handling, fallback behavior, or a Next route handler. Production installs no forwarding rule.
- 2026-08-03: Hardened the direct AI Ask client so it accepts exactly one `preparing`, zero or more ordered `delta` records, and exactly one terminal `done`, `error`, or `in_progress` record. Malformed, out-of-order, post-terminal, and unterminated streams fail before a caller can treat them as complete.
- 2026-08-03 verification: `pnpm exec vitest run tests/ai-ask-direct-api.test.ts tests/local-direct-transport.test.ts` passed (2 files, 8 tests); `pnpm typecheck` passed; `pnpm lint` completed with 0 errors and 5 pre-existing unrelated warnings; `git diff --check` passed.
- 2026-08-03 broader verification: `pnpm build` passed. `pnpm test:unit` failed in pre-existing `tests/traveler-ui-foundation.test.ts` expectations for retired Inter/palette tokens (2 failures; 203 passed). `pnpm test:integration` exceeded the 120-second execution limit after unrelated failures in `tests/story-8-6-actor-isolation.test.ts` and `tests/ai-ask-stream-execution.test.ts`; it also repeatedly reset/migrated the shared test database as configured.
- 2026-08-03: Completed the Nest OAuth referral first-touch vertical slice. `browser_oauth_transactions.referral_code` carries only a normalized valid `ref` through the encrypted, one-time Nest OAuth transaction; its PostgreSQL adapter resolves the active non-self referral and inserts the unique attribution in the same Google-user transaction. The root sign-in link passes the public referral only to `/auth/google`; no browser session/token is introduced. Focused browser identity integration coverage passes 22 tests, including successful one-time attribution and malformed-referral rejection.
- Blocked remaining atomic tasks: `apps/api/src/` still has no traveler command or feedback controller/port, while `src/features/chat-trips/actions.ts` and `src/features/feedback/actions.ts` remain the root Auth.js server-action writers. The required command semantics are implemented only in root modules: `conversations.ts`, `trip-projects.ts`, `trip-change-proposals.ts`, `answer-usefulness.ts`, and root audit/AI-command helpers. In particular proposal application imports root transaction primitives, audit history, annotation validation, and session resolution. Copying or importing this into Nest would violate the package boundary and risk changing owner-scoped atomic transactions. Removing/rerouting callers before extracting these package-owned ports would violate the one-writer and transaction-preservation constraints.

## Auto Run Result

Status: blocked

Blocking condition: Referral/OAuth is now Nest-owned, but traveler command and feedback extraction remains unimplemented. Equivalent transport-neutral database/domain ports and admitted Nest controllers do not exist for conversation/project deletion, project creation, proposal apply/dismiss/annotation binding, or usefulness feedback. Root traveler actions remain their only authenticated mutation owners. The completed direct routing, direct-stream validation, and referral OAuth work are safe partial work, but no Auth.js/root-owner fallback may remain under this specification.

- 2026-08-03 continuation authorized: implement the missing extracted command/referral ports, admitted Nest controllers, and direct traveler callers as the approved atomic cutover. The prior blocker is now active implementation scope, not a reason to retain legacy owners.
- 2026-08-03 continuation inventory: the direct shell is the sole active `/ai-ask` consumer and currently passes no command callbacks into `AiAskComposer`; all create/delete/proposal/annotation/feedback controls are therefore unavailable in the direct shell rather than using a second writer. The root command implementations cannot yet be moved safely: `conversations.ts` and `trip-projects.ts` embed owner authentication, `getDb()` transactions, audit events, and AI Ask command discard; `trip-change-proposals.ts` additionally embeds the full locked aggregate transaction, annotation-to-pending-proposal binding, plan-item transaction helpers, plan history, audit, expiry, and root-only session identity; `answer-usefulness.ts` embeds its locked ownership/upsert transaction. The existing `packages/worker-domain` proposal module is intentionally a reduced AI-draft/expiry implementation and is not behaviorally equivalent to the root apply/dismiss transaction.
- 2026-08-03 continuation decision: no controller, direct-client mutation, or legacy-writer removal was added. Doing so would either duplicate the established transaction semantics or leave direct shell controls without their required admitted Nest writer, violating the no-dual-writer/no-controller-domain-logic constraints. A safe continuation requires first extracting the command aggregate, audit/history, annotation, and AI-command transaction primitives into a package-owned implementation with a principal-supplied port; that extraction is larger than the authorized partial work and remains blocked pending an approved package-boundary design.
- 2026-08-03 continuation progress: strict shared contracts, `TravelerCommandPort`, PostgreSQL command implementation, and admitted Nest endpoints now own trip-project creation, conversation/project deletion, and usefulness feedback. `DirectShellLoader` uses only those relative direct APIs for the migrated controls. Referral first touch is also transaction-bound to Nest OAuth. Proposal apply/dismiss and annotation actions remain root-owned because their single locked aggregate executor still imports root plan-item transaction helpers, root audit/history writers, and annotation/provenance policy. No incomplete bridge or direct endpoint was retained: it would be a second writer or weaken the established atomic transaction.
- 2026-08-03 continuation implementation: added strict `TravelerCommandPort` request/result contracts, the injected Nest `TravelerCommandsController`, and direct shell clients for trip creation, conversation/trip deletion, and usefulness feedback. API admission remains the existing exact-Origin/session-bound-CSRF guard for browser sessions; bearer compatibility remains only for existing root/admin infrastructure tests. Focused typecheck and API/direct-client tests pass. Proposal apply/dismiss and annotation actions remain intentionally unexposed because their root aggregate has not yet been extracted without weakening its locked transaction, audit/history, annotation binding, expiry, and plan-item semantics. Root traveler action/Auth.js removal cannot occur while those writers remain.
- 2026-08-03 final continuation verification: `pnpm typecheck` passed; `pnpm exec vitest run tests/api-platform-contract.test.ts tests/ai-ask-direct-api.test.ts tests/local-direct-transport.test.ts` passed (3 files, 14 tests); `git diff --check` passed. The remaining root Auth.js inventory is confined to the proposal aggregate and unrelated preserved admin/BFF runtime paths. The traveler aggregate remains the explicit blocking condition.
