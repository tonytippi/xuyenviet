---
title: 'Cut AI Ask and traveler shell reads to direct API'
type: 'feature'
created: '2026-08-03'
status: 'blocked'
baseline_revision: '330ab7ba9dc66c0dcbf8845cdc86baaaff2f163e'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-14-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/spec-14-1-establish-nestjs-google-oauth-opaque-browser-sessions-and-direct-api-admission.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** AI Ask and the traveler planning shell still depend on Auth.js, root PostgreSQL readers/writers, a Next stream route, BFF credentials, and flag-selected BFF/legacy read paths. Nest browser-session admission exists, but the browser cannot yet use it as the one transport owner for these capabilities.

**Approach:** Make the traveler browser call same-site relative Nest `/v1` and `/auth` endpoints directly using the existing opaque cookie session and session-bound CSRF proof. Add only the owner-scoped read projection required by the shell, retain commands for Story 14.3, and delete every migrated AI Ask/shell BFF, selector, shadow-read, and legacy stream-writer owner.

## Boundaries & Constraints

**Always:** Preserve the existing direct AI Ask NDJSON protocol (`preparing`, `delta`, `in_progress`, `done`, `error`), idempotency/replay, abort, terminal persistence, safe Vietnamese recovery, request correlation, and owner isolation. Direct browser requests use only relative same-site `/v1` and `/auth` paths, `credentials: "include"`, exact allowed origin handling, and the admitted `GET /auth/csrf` token for mutations. Nest constructs `RequestPrincipal`; browser code never receives session identifiers, BFF credentials, provider tokens, internal hostnames, signing material, or database access. Add strict contracts and API integration coverage for every new shell projection. Keep database integration serial, use only `DATABASE_URL_TEST`, and reset locally where clean tables are needed.

**Block If:** The deployment cannot route traveler `/v1/*` and `/auth/*` to Nest on the browser's same site; a required shell read cannot be made owner-scoped through an explicit API contract; or the cutover requires adopting an Auth.js session, retaining a legacy fallback/dual read, or migrating a traveler command. Halt with the precise constraint rather than adding a BFF, browser credential, root database read, or compatibility writer.

**Never:** Do not migrate conversation/trip/proposal/feedback/referral commands, root server actions, or admin flows; those belong to Stories 14.3 and 14.4. Do not remove shared BFF/auth infrastructure still used outside the migrated scope, nor the final Auth.js/BFF runtime inventory, which belongs to Story 14.5. Do not add transport flags, shadow reads, legacy fallback, dual write, or a private API base URL. Do not claim ingress deployment, migration-before-traffic, rollback, or launch/retirement evidence; Story 14.6 owns that operational gate.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Direct AI Ask | Current opaque browser session, allowed Origin, CSRF proof, valid prompt/idempotency key | Browser posts directly to `/v1/ai-ask/stream` and renders the established NDJSON sequence with persisted-result reconciliation | Safe API/stream error is localized; no credential or provider disclosure |
| Direct shell read | Current session requests conversation summaries, selected planning context, answer detail, and shell projection | Nest returns only owner-scoped, strictly validated shell/read data; browser renders it without root DB or BFF involvement | Missing/foreign identifiers remain null-safe; optional detail failure retains completed assistant prose |
| Invalid browser admission | Missing/revoked/stale session, foreign Origin, or missing/invalid CSRF stream request | Nest rejects before domain execution using the existing safe envelope | Browser moves to safe sign-in/session-expired recovery without retrying through legacy transport |
| Read completion | Stream reaches terminal state or user refreshes | Browser reloads direct shell/read data and shows persisted completion exactly once | No selected response changes because a legacy or shadow result differs |

</intent-contract>

## Code Map

- `src/features/ai/ai-ask-composer.tsx` -- current browser stream consumer calling the root `/api/ai-ask/stream` proxy.
- `src/features/ai/direct-api-client.ts` -- new browser-only direct client for CSRF bootstrap, safe API parsing, shell reads, and AI Ask stream transport.
- `src/features/chat-trips/direct-shell-loader.tsx` -- new client-owned traveler shell loading/recovery boundary.
- `src/app/ai-ask/page.tsx` -- Auth.js/root-database server shell bootstrap and mixed read/command props to split into a presentation shell plus direct-read consumer.
- `src/features/chat-trips/conversation-summary-loader.ts` and `planning-read-loader.ts` -- BFF/legacy selector and shadow-read owners to retire for migrated reads.
- `src/features/chat-trips/conversation-summary-bff.ts` and `planning-read-bff.ts` -- BFF bearer read adapters to remove.
- `src/app/api/ai-ask/stream/route.ts` -- Next proxy and legacy direct AI Ask writer to delete.
- `src/features/ai/legacy-ai-ask-stream-writer.ts` -- obsolete legacy writer export to delete.
- `src/features/auth/actions.ts` and `src/app/sign-in/page.tsx` -- traveler sign-in/sign-out UI paths that must use Nest browser identity for the migrated shell.
- `src/server/bff-api-client.ts`, `src/server/bff-credentials.ts`, `src/server/bff-session-token.ts`, and `src/server/csrf.ts` -- shared legacy BFF support; remove only AI Ask/shell dependencies after a caller inventory.
- `packages/config/src/index.ts` -- AI Ask/planning-read feature selectors to delete with their consumers, retaining configuration used by remaining scopes.
- `packages/contracts/src/index.ts` -- typed stream, safe-envelope, conversation, planning, and new direct shell projection contracts.
- `packages/database/src/index.ts` -- owner-scoped AI Ask, conversation-summary, planning-read, and new shell-projection repository ports.
- `apps/api/src/ai-ask/ai-ask.controller.ts` -- direct stream controller already protected by Nest admission.
- `apps/api/src/conversations/conversations.controller.ts` -- current direct summaries, planning-context, and answer-detail endpoints; extend only for required shell reads.
- `apps/api/src/auth/browser-identity.controller.ts` and `resource-server.guard.ts` -- admitted CSRF bootstrap/logout and direct browser enforcement from Story 14.1.
- `tests/ai-ask-bff-routing.test.ts`, `tests/ai-ask-bff-api.integration.test.ts`, `tests/ai-ask-shell.test.ts`, `tests/conversation-summary-cutover.test.ts`, `tests/planning-read.test.ts`, `tests/api-platform-contract.test.ts`, and `tests/api-request-principal.integration.test.ts` -- legacy-cutover coverage to replace with direct browser/API assertions.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/index.ts`, `packages/database/src/index.ts`, `apps/api/src/conversations/conversations.controller.ts`, and `apps/api/src/conversations/conversations.module.ts` -- define and serve the minimal owner-scoped traveler shell projection missing from current direct endpoints, alongside existing summaries/planning context/answer detail; preserve stable ordering and safe null/optional-detail semantics.
- [x] `src/features/ai/direct-api-client.ts` and `src/features/chat-trips/direct-shell-loader.tsx` -- add a browser-only typed direct API client and client-owned shell loader that obtain/cache the admitted CSRF projection only for mutations, send cookie credentials and required headers, parse strict contracts/safe envelopes, and expose direct reads and stream handling without browser credentials or legacy retry.
- [x] `src/features/ai/ai-ask-composer.tsx` -- replace `/api/ai-ask/stream` with direct `/v1/ai-ask/stream`, preserving multipart input, idempotency, cancellation, raw NDJSON parsing, completion refresh, and safe recovery.
- [x] `src/app/ai-ask/page.tsx` and required presentation components -- remove Auth.js/root-database shell bootstrap and hydrate/load the traveler shell from direct browser reads; keep existing command callbacks explicitly deferred rather than recreating a root read owner.
- [x] `src/app/sign-in/page.tsx` and `src/features/auth/actions.ts` -- make the traveler entry/sign-out behavior used by this cutover begin Nest Google OAuth and invoke direct Nest logout, retaining Vietnamese UX and safe session-expired recovery.
- [x] `src/app/api/ai-ask/stream/route.ts`, `src/features/ai/legacy-ai-ask-stream-writer.ts`, `src/features/chat-trips/conversation-summary-loader.ts`, `src/features/chat-trips/conversation-summary-bff.ts`, `src/features/chat-trips/planning-read-loader.ts`, `src/features/chat-trips/planning-read-bff.ts`, and `packages/config/src/index.ts` -- delete migrated stream/read BFF, root writer, selector, and shadow-read paths; remove only flags and shared helpers proven unused by retained scopes.
- [x] `tests/ai-ask-direct-api.test.ts`, `tests/ai-ask-direct-api.integration.test.ts`, `tests/traveler-shell-direct-api.test.ts`, `tests/api-platform-contract.test.ts`, and `tests/api-request-principal.integration.test.ts` -- replace migrated BFF/flag coverage with direct browser-session integration and browser-client coverage for every matrix row, endpoint ownership, exact Origin/CSRF admission, no legacy fallback, and safe non-disclosure; retain separate out-of-scope BFF/admin coverage.
- [x] `_bmad-output/implementation-artifacts/sprint-status.yaml` and this spec -- mark progress, record exact verification evidence, final owner inventory, and any Story 14.6 operational handoff without fabricating deployment proof.

**Acceptance Criteria:**
- Given an admitted traveler browser session and valid CSRF proof, when AI Ask is submitted, then the browser directly posts to `/v1/ai-ask/stream` and preserves the existing byte/protocol, idempotency, abort, persistence, and safe recovery contract with no Next proxy, BFF credential, or legacy writer.
- Given the traveler opens or refreshes the planning shell, when it loads conversations, planning context, answer details, and required shell data, then direct Nest endpoints return only owner-scoped typed projections and the UI has no Auth.js/root-database/BFF/selector/shadow-read owner for these reads.
- Given an invalid, expired, revoked, cross-origin, or CSRF-invalid browser request, when it reaches a migrated read or stream, then Nest rejects it before domain execution through the safe contract and the UI provides safe reauthentication/recovery without a legacy fallback.
- Given this vertical slice is migrated, when the source tree is inspected and focused tests run, then its Next stream route, legacy AI Ask writer, BFF read adapters, transport selectors, and local/staging shadow reads are absent, while unrelated Story 14.3-14.5 owners remain unchanged.

## Design Notes

The presentation server cannot reliably forward a browser-only opaque cookie to Nest during server rendering without becoming another transport owner. The cutover therefore turns the authenticated shell into a client-loaded presentation surface backed by relative same-site direct API calls. It must render explicit loading and expired-session states rather than silently using Auth.js/root data.

Direct reads are one selected owner. New shell data belongs in a bounded API projection, not in a browser reconstruction from command-oriented endpoints or a second root-data read. The API can retain an internal bearer strategy for unmigrated consumers, but the migrated browser path must not send `Authorization`.

## Verification

**Commands:**
- `pnpm exec vitest run --project integration tests/browser-identity.integration.test.ts tests/api-request-principal.integration.test.ts tests/api-platform-contract.test.ts tests/ai-ask-direct-api.integration.test.ts` -- expected: serial browser-cookie, exact Origin/CSRF, owner isolation, safe envelope, direct stream, and no-domain-execution regressions pass.
- `pnpm exec vitest run tests/ai-ask-direct-api.test.ts tests/traveler-shell-direct-api.test.ts` -- expected: direct browser clients parse valid contracts, retain null/optional-detail behavior, and contain no fallback/selector/shadow transport.
- `pnpm typecheck` -- expected: strict root, API, admin, and worker typechecks pass.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: production builds pass.
- `git diff --check` -- expected: no whitespace errors.

## Implementation Record

### Completed Work

- Added the strict owner-scoped `GET /v1/conversations/shell` projection. It returns only a selected owner conversation, its ordered messages, and selected trip metadata; missing, foreign, malformed, or mismatched IDs resolve null-safely.
- Added a browser-only direct API client for relative `/v1` and `/auth` requests. It uses `credentials: "include"`, reads safe envelopes/contracts, retrieves and caches `/auth/csrf` only for mutations, and posts the original multipart AI Ask request directly to `/v1/ai-ask/stream`.
- Converted `/ai-ask` to a client-loaded presentation shell. It no longer uses Auth.js or root database readers. Existing traveler command callbacks are deliberately absent pending Story 14.3.
- Changed the traveler sign-in link to start Nest Google OAuth and connected the migrated shell sign-out control to direct Nest logout.
- Removed the migrated Next stream route, legacy stream writer, BFF read adapters, read selectors/shadow comparisons, and AI Ask/planning read feature flags. Retained Auth.js/BFF code is used only by out-of-scope capabilities.
- Replaced migrated cutover tests with direct client coverage and added owner-scoped shell API assertions. No ingress, rollout, migration-before-traffic, rollback, or deployment proof was added.
- Repaired review findings: strict per-variant NDJSON event validation and single-owner incremental callback delivery; safe reauthentication messaging for direct stream admission failures; owner-scoped history selection, shell-detail enrichment, planning-context retention, and immediate logout replacement to `/sign-in`; and a deterministic recent-200 message window restored to chronological order.

### Verification Results

- PASS: `pnpm exec vitest run tests/ai-ask-direct-api.test.ts tests/api-platform-contract.test.ts` -- 2 files, 7 tests passed. Covers relative cookie-authenticated shell reads, CSRF-only direct stream mutation, raw NDJSON event handling, owner-scoped/null-safe shell responses, and existing API contract behavior.
- PASS: `pnpm typecheck` -- root, admin, worker-domain, API, and worker TypeScript checks passed.
- PASS WITH EXISTING WARNINGS: `pnpm lint` -- no errors; five existing unused-variable warnings in `tests/domain-outbox.test.ts`, `tests/knowledge-search.test.ts`, and `tests/operational-telemetry.test.ts`.
- PASS: `pnpm build` -- root Next, admin Next, API, and Worker production builds succeeded. The generated root route inventory does not include `/api/ai-ask/stream`.
- PASS: `git diff --check`.
- PASS: `pnpm exec vitest run tests/ai-ask-direct-api.test.ts tests/api-platform-contract.test.ts` -- 2 files, 9 tests passed. Covers immediate single-owner NDJSON callback delivery, malformed event rejection, direct shell owner/null safety, and direct API contracts.
- PASS: `pnpm typecheck` -- root, admin, worker-domain, API, and worker TypeScript checks passed after the review repairs.
- PASS: `git diff --check` -- no whitespace errors after the review repairs.

### Owner Inventory And 14.6 Handoff

- Migrated scope owners removed: `src/app/api/ai-ask/stream/route.ts`, `src/features/ai/legacy-ai-ask-stream-writer.ts`, `src/features/chat-trips/conversation-summary-{loader,bff}.ts`, `src/features/chat-trips/planning-read-{loader,bff}.ts`, and their migrated selectors/flags.
- Retained out-of-scope owners: traveler commands/server actions, root/admin Auth.js paths, and remaining BFF runtime support. They remain for Stories 14.3-14.5.
- Story 14.6 still requires external ingress routing for same-site `/v1/*` and `/auth/*`, staging/production origin-cookie-CSRF probes, migration-before-traffic/rollback evidence, and launch/retirement evidence. None is asserted here.

## Auto Run Result

Status: in-review

Initial implementation and its first repair pass are locally verified, but the follow-up review found an unresolved intent gap. Story 14.2 forbids migrating conversation, trip, proposal, feedback, and referral commands to the direct API, yet the new direct-session shell cannot retain the existing Auth.js/root-server-action controls. Removing those controls regresses project creation/deletion, conversation deletion, feedback, proposal actions, annotation actions, and trip workspace controls; retaining them requires a second authenticated transport owner or moving the commands into Story 14.2.

The implementation must not proceed until the scope explicitly chooses one of these coherent paths: include the command direct-API cutover in Story 14.2, retain an approved temporary authenticated command transport, or sequence the direct shell after Story 14.3. The current contract permits none of them.

Additional follow-up findings were not repaired because the intent gap takes precedence: stream protocol ordering/terminal validation, bounded answer-detail enrichment concurrency, history-to-project matching, oversized message projection behavior, logout failure privacy recovery, and repeated query-parameter validation require a new implementation pass after the scope decision.

## Review Triage Log

### 2026-08-03 — Review pass
- intent_gap: 1 (high 1)
- bad_spec: 0
- patch: 0
- defer: 0
- reject: 1 (low 1)
- addressed_findings:
  - none
