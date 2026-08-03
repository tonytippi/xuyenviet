---
title: 'Atomic traveler direct API cutover and Auth.js retirement'
type: 'feature'
created: '2026-08-03'
status: 'in-progress'
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
- [ ] `packages/contracts/src/index.ts`, `packages/domain/src/index.ts`, and `packages/database/src/index.ts` -- define strict owner-scoped traveler command/referral contracts and extract PostgreSQL ports preserving established transactions, validation, audit/history, and deletion semantics.
- [ ] `apps/api/src/conversations/`, `apps/api/src/feedback/`, `apps/api/src/referrals/`, and `apps/api/src/auth/` -- expose direct Nest endpoints for all shell-rendered traveler commands and OAuth-bound referral capture under browser Origin/CSRF/principal admission.
- [ ] `src/features/ai/direct-api-client.ts`, `src/features/chat-trips/direct-shell-loader.tsx`, `src/features/ai/ai-ask-composer.tsx`, and `src/app/ai-ask/page.tsx` -- send all traveler reads/commands directly, preserve every current control/workspace behavior, and repair stream, enrichment, history, message-bound, query, and logout review findings.
- [ ] `src/auth.ts`, `src/server/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts`, `src/features/auth/actions.ts`, `src/features/chat-trips/actions.ts`, and `src/features/feedback/actions.ts` -- remove traveler Auth.js/server-action/runtime owners only after caller inventory; preserve root admin and `apps/admin` behavior.
- [ ] `next.config.ts` and relevant local configuration/tests -- add a transport-only same-origin development mapping for `/v1/*` and `/auth/*` to Nest, retaining request cookie/header behavior without a domain proxy.
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
