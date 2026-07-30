# Story 11.5: Serve Planning Context and Details Through the API Cutover

Status: done

## Story

As a traveler,
I want my selected trip context, answer details, and withdrawn-source behavior to remain correct through the API,
so that moving read paths does not expose stale, cross-user, or legacy-derived information.

## Acceptance Criteria

1. **Given** a BFF requests a selected Trip Project context, answer detail, or provenance read model, **when** the API resolves the request principal and ownership scope, **then** it returns only the owning user's canonical `TripAnswerContext`, safe detail projection, or localized unavailable marker. **And** its OpenAPI contract documents authorization, ownership, stable errors, and pagination/order where applicable.
2. **Given** a source is withdrawn or a descriptor is invalidated, **when** a migrated API read is requested, **then** it applies current availability at read time and never returns withdrawn URL, quote, quick fact, action, raw material, or cross-user data. **And** tests cover historic backfill, ownership denial, and stale descriptor rejection.
3. **Given** each planning-context read is cut over, **when** its route is enabled in staging, **then** only the API/BFF path owns that read behavior. **And** the matching legacy transport owner is retired after safe verification.

## Tasks / Subtasks

- [ ] Define strict, traveler-safe API contracts and extracted read ports for the selected context and answer-detail reads (AC: 1, 2)
  - [ ] Extend `packages/contracts/src/index.ts` with versioned, bounded request/response DTOs and strict parsers for the selected-trip `TripAnswerContext` projection and owner-scoped answer/provenance/annotation detail projection. Keep identifiers bounded and timestamps canonical ISO-8601 UTC where exposed.
  - [ ] Specify the exact resource semantics before implementation: current selected-project canonical context and historic answer detail/provenance are distinct read models. Do not substitute a live aggregate for immutable answer-generation evidence, or expose source-bundle `serialization`, prompt digest, `sourceSnapshot`, provider payloads, raw transcript, hidden proposal, operator material, or database rows.
  - [ ] Extract feature-neutral domain repository interfaces and pure serialization/use-case functions in `packages/domain/src/index.ts`; provide matching scoped PostgreSQL implementations from `packages/database`. Controllers must depend on those ports, never root Next modules, Auth.js, `server-only`, or direct root feature imports.
  - [ ] Preserve `TripAnswerContext v1` as the sole canonical context publisher: stable anchors, deterministically ordered plan items, structured constraints, primary conversation ID, bounded current-conversation facts, aggregate/context version, and typed conflicts as the product projection requires. Reuse `loadAnswerContext`; do not construct a competing assembler in a controller or BFF.
  - [ ] Use the existing traveler-safe provenance formatter and persisted-annotation sanitizer/capability resolver as the source of response data. A descriptor and its action are historic intent, not authority; the projection must never trust persisted/browser titles, URLs, target IDs, labels, routes, or capabilities.

- [ ] Add protected API read controllers and dependency wiring (AC: 1, 2)
  - [ ] Add owner-scoped, read-only routes under the existing `/v1` controller structure. Obtain the user only from `@Principal() RequestPrincipal`; do not accept a user ID, browser cookie, or caller-selected ownership scope.
  - [ ] Return the same non-disclosing outcome for missing and foreign conversation/project/message/descriptor state that the existing owner-scoped read path uses. Do not create a resource-existence oracle through status codes, error text, timing-dependent fallback, or response shape.
  - [ ] Wire only the required repositories through `apps/api/src/app.module.ts` and the API runtime composition root. Retain the global `ResourceServerGuard`, safe validation pipe, request ID middleware, and safe exception filter; do not add per-controller authentication variants.
  - [ ] Extend `apps/api/src/openapi.controller.ts` with every new route, bearer-only authorization, owner-derived scope, success schemas, stable safe-error responses, and explicit ordering/pagination behavior. A bounded unpaginated collection must state its stable ordering and limit; pagination requires an explicit compatible cursor/version contract.
  - [ ] Keep the private API bearer-only with no CORS allow-origin response. Browser traffic remains server-side Next BFF traffic; credential minting and private API URLs remain server-only.

- [ ] Preserve current withdrawal, annotation, and ownership enforcement at the API read boundary (AC: 1, 2)
  - [ ] Rebuild provenance only through `formatAssistantMessageProvenance` and apply availability at request time. A withdrawn row returns only its localized unavailable marker and allowed safe identifiers/rank metadata; it must contain no URL, title/source identity, quote, quick fact, derived fact, raw material, action, capability, or target.
  - [ ] Run persisted annotation data through `sanitizeStoredAnswerAnnotations` against final assistant content and the current formatted, owner-scoped provenance. Omit stale, malformed, duplicate, overlapping, message-unscoped, unavailable, or otherwise invalid descriptors. Preserve valid answer-local `warning` and `trip_fact` descriptors only when they satisfy their existing source-free policy.
  - [ ] Resolve supported action capabilities only from current owner-scoped state using the existing `(user, conversation, assistant message, selected project, annotation)` binding and current pending proposal relationship. Do not add API action execution, generic command transport, capability minting, or browser/persisted target authority in this story.
  - [ ] Preserve completed assistant prose and non-blocking rendering when optional context/detail/annotation enrichment is absent, invalid, stale, or withdrawn. The API cutover is a read migration; it must not invoke a provider, write annotations, mutate trip state, change final-lock/outbox behavior, or change answer content.

- [ ] Create server-only BFF adapters and select exactly one public read owner (AC: 1, 3)
  - [ ] Follow `conversation-summary-bff.ts` and `conversation-summary-loader.ts`: mint a BFF credential server-side, call `callPrivateApi` with strict contract parsing and propagated correlation ID, and map transport DTOs into the existing page/read-model shape.
  - [ ] Add a validated boolean cutover configuration for each migrated planning-context read. The page/loader must choose legacy *or* API before either accepts the request; malformed configuration must fail closed. Do not merge results, retry through the other owner, or make both paths public behavior.
  - [ ] If read-only equivalence comparison is added, allow it only in local/staging after the selected response, tag it with the correlation ID, and ensure comparison failure cannot affect the browser response. It must not run in production and must not write state.
  - [ ] Update `src/app/ai-ask/page.tsx` and feature-owned loaders to consume the selected BFF read models while preserving URL project/conversation alignment and safe empty-shell behavior. Keep `AiAskComposer` a consumer of server-resolved persisted descriptors; do not introduce browser source lookup or answer-prose parsing.
  - [ ] Retire only the migrated legacy page-read owner after selected-owner, contract-equivalence, and rollback verification. Keep `getOwnedConversation` or extracted shared logic where `executeAnnotationAction` still needs it; do not break Story 11.4 mutation authorization while retiring the matching read transport.

- [ ] Prove contract, data, cutover, and non-disclosure behavior (AC: 1-3)
  - [ ] Extend API platform/controller tests with real guarded controller requests for valid owner reads, unauthenticated rejection, foreign/missing non-disclosure, strict parser rejection, bearer-only/no-CORS behavior, safe-error envelopes, and OpenAPI documentation for every new endpoint.
  - [ ] Add serial PostgreSQL-backed read-model tests for canonical context ordering/precedence and snapshot semantics, historic withdrawal/backfill output, source-detail allowlist, descriptor sanitization, stale descriptor omission, current capability suppression, and no cross-user data. Assert raw source/snapshot/provider/operator fields never cross the repository/controller/BFF boundary.
  - [ ] Extend BFF cutover tests for exact selected-owner routing, strict flags, malformed API response rejection, correlation propagation, local/staging-only post-response shadow comparison, production no-shadow behavior, rollback to legacy before API acceptance, and retirement of the matching legacy public read.
  - [ ] Preserve existing Story 11.1-11.4 regressions: immutable snapshot/fence/deletion cleanup, withdrawal backfill fail-closed behavior, UTF-16 persisted descriptor rules, current ownership/capability binding, and valid annotation-action delegation.
  - [ ] Run affected PostgreSQL suites serially with `DATABASE_URL_TEST`, relevant API/BFF contract suites, `pnpm typecheck`, `pnpm lint`, `pnpm build`, and `git diff --check`. Record actual commands and outcomes only after implementation.

## Dev Notes

### Architecture And Ownership

- **API boundary:** The private Nest API accepts only a domain-neutral bearer `RequestPrincipal`; the Next traveler app remains the server-side BFF. API safe errors contain only `code`, `message`, `requestId`, and bounded violations. Never disclose browser credentials, cookies, tokens, SQL, stack traces, raw evidence, provider payloads, or private configuration.
- **Canonical context:** Chat/Trips exclusively publishes `TripAnswerContext v1` at an aggregate version. Reuse `packages/database/src/answer-context.ts#loadAnswerContext`; structured anchors/items/constraints are canonical, and project/conversation chat only supplements missing structured fields according to the existing typed-conflict rules.
- **Immutable versus live semantics:** A selected-project context is a canonical current read model. A historic assistant answer's context/source use is immutable evidence from its snapshot and provenance. Name and project the two deliberately; never expose or silently interchange source-bundle serialization or a live aggregate as historic evidence.
- **Detail/provenance boundary:** Detail panels remain derived read models. `formatAssistantMessageProvenance` is the safe availability projection, and `sanitizeStoredAnswerAnnotations` is the hostile persisted-JSON boundary. Use their outputs, not raw provenance snapshots or text inference.
- **Withdrawal and actions:** Read-time withdrawal wins over stored data. Withdrawn provenance is unavailable-only and invalidates dependent source-backed detail/action output. Actions remain Story 11.4 feature commands with server-derived current binding; Story 11.5 transports reads only.
- **Cutover discipline:** Every selected read needs an API contract, authorization/ownership matrix, integration proof, validated routing switch, rollback route, and exactly one public transport owner. Local/staging safe read-only shadow comparison is observability only; it never changes a response or creates dual writes. Operational deployed-route/probe, migration ordering, and public-launch retirement evidence remain Epic 14 Story 14.2 work.

### Existing Implementation And Required Evolution

| File | Current state to preserve | Story 11.5 evolution |
| --- | --- | --- |
| `src/features/chat-trips/conversations.ts` | Authenticates, scopes conversation/messages/provenance by owner, formats provenance, sanitizes annotations, and derives current action capabilities. Missing/foreign state is safe `null`. | Extract/reuse its owner-scoped read behavior behind API-safe ports without changing non-disclosure or action execution semantics. Retire only page-read ownership once the selected BFF path is verified. |
| `packages/database/src/answer-context.ts` | Owns canonical `TripAnswerContext` assembly, ordering, precedence, aggregate versioning, and bounded facts. | Reuse it for a strict traveler-safe context projection. Do not duplicate the assembler or leak its persistence/snapshot internals. |
| `packages/database/src/provenance.ts` and `src/features/retrieval/provenance.ts` | Provide current formatted available/withdrawn traveler provenance. | Preserve the formatter as the only API source-detail input. Withdrawn output remains unavailable-only. |
| `src/features/ai/answer-annotations.ts` | Validates and sanitizes persisted annotation JSON against final content and provenance. | Retain it as the only descriptor boundary; do not serialize raw annotations or create a second validation path in controller/BFF code. |
| `packages/contracts/src/index.ts` | Owns safe API DTOs and strict response parsers. | Add bounded versioned planning-context/detail/provenance contracts and parsers, not database row types or `unknown` payload pass-through. |
| `packages/domain/src/index.ts` and `packages/database/src/index.ts` | Supply feature-neutral summary repository/use-case patterns and PostgreSQL implementations. | Add scoped planning-context read ports/use cases and Postgres implementations for Nest. |
| `apps/api/src/conversations/conversations.controller.ts`, `app.module.ts`, `main.ts`, `openapi.controller.ts` | Implement the guarded summary-read controller and its wiring/OpenAPI model. | Add protected read endpoints, scoped dependencies, runtime composition, and complete OpenAPI descriptions following this pattern. |
| `src/features/chat-trips/conversation-summary-bff.ts` and `conversation-summary-loader.ts` | Mint BFF credentials, parse API DTOs, choose one owner, and perform confined shadow comparison. | Implement the corresponding planning-context/read adapters and selected-owner loaders; do not add a second public path. |
| `src/app/ai-ask/page.tsx` and `src/features/ai/ai-ask-composer.tsx` | Server-composes the authenticated shell and consumes server-resolved persisted descriptors. | Replace only migrated page reads, preserving URL selection, safe empty state, persisted-only annotation rendering, and one transient detail surface. |

### Data, Security, And Concurrency Guardrails

- Scope every API query by the principal-derived owner at the persistence boundary. Do not load by resource ID first and filter in memory.
- Do not expose `assistant_response_provenance.sourceSnapshot`, `tripAnswerContextSnapshots.serialization`, prompt digests, raw transcript, source bundle serialization, provider payload, raw/operator material, hidden proposal, or an arbitrary JSON field.
- Preserve ordered context semantics and stable collection order. Do not claim pagination where a response is bounded/unpaginated; if adding pagination, document and validate a cursor contract before implementation.
- Persisted annotations and actions are untrusted historic intent. Never infer authority from Vietnamese prose, a label, title, URL, stored target ID, route, or browser input. No client-side matching, normalizing, re-searching, or source lookup.
- Do not modify applied migrations, source-removal/backfill classification, canonical context snapshot fences, deletion cleanup, annotation enrichment/outbox lifecycle, action mutation commands, or API streaming in this story.
- Do not add map/route/ETA/weather/booking/provider availability, generic place/hotel/cost aggregates, collaboration, browser-direct API access, or unrelated schema work.

### Testing Requirements

Use serial PostgreSQL execution for reset-backed suites. Select exact test files after implementation, but preserve these minimum layers:

```bash
pnpm vitest run tests/api-platform-contract.test.ts tests/conversation-summary-cutover.test.ts tests/bff-transport.test.ts --maxWorkers=1 --no-file-parallelism
pnpm vitest run tests/answer-context.test.ts tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism
pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --maxWorkers=1 --no-file-parallelism
pnpm typecheck
pnpm lint
pnpm build
git diff --check
```

### Scope Boundaries

- Story 11.1 owns canonical context construction, immutable snapshots, prompt-use ledger, fences, and deletion cleanup. Consume and preserve its outputs.
- Story 11.2 owns withdrawal backfill/remediation and source-removal classification. Enforce its availability result at read time; do not redesign its write path.
- Story 11.3 owns annotation creation, UTF-16/provenance validity, and final-lock enrichment. Keep its persisted-descriptor contract intact.
- Story 11.4 owns safe detail/action projection and annotation-action mutation authorization. Reuse its current read/capability semantics but do not add action execution transport or modify commands.
- Epic 14 Story 14.2 owns deployed staging/private-network route/probe, migration-before-traffic, selected-owner execution, rollback, and legacy-retirement evidence for public launch. This story supplies local contract and cutover implementation only.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md#Story 11.5: Serve Planning Context and Details Through the API Cutover`]
- [Source: `_bmad-output/implementation-artifacts/epic-11-context.md#Requirements & Constraints`; Source: `#Technical Decisions`]
- [Source: `_bmad-output/implementation-artifacts/11-1-publish-canonical-trip-answer-context-snapshots.md`; Source: `11-2-withdraw-historical-provenance-safely.md`; Source: `11-3-validate-persisted-answer-annotations.md`; Source: `11-4-bind-annotation-details-and-actions-to-current-ownership.md`]
- [Source: `_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-19`; Source: `#AD-20`; Source: `#AD-32`; Source: `#AD-35`; Source: `#AD-36`; Source: `#AD-37`]
- [Source: `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.8 API, Runtime, And Deployment Boundary`; Source: `#NFR-10`; Source: `#NFR-12`]
- [Source: `_bmad-output/project-context.md`]
- [Source: `src/features/chat-trips/conversations.ts`; Source: `src/features/chat-trips/conversation-summary-loader.ts`; Source: `src/features/chat-trips/conversation-summary-bff.ts`; Source: `src/app/ai-ask/page.tsx`]
- [Source: `packages/contracts/src/index.ts`; Source: `packages/domain/src/index.ts`; Source: `packages/database/src/answer-context.ts`; Source: `packages/database/src/provenance.ts`]
- [Source: `apps/api/src/conversations/conversations.controller.ts`; Source: `apps/api/src/app.module.ts`; Source: `apps/api/src/openapi.controller.ts`]
- [Source: `tests/api-platform-contract.test.ts`; Source: `tests/conversation-summary-cutover.test.ts`; Source: `tests/bff-transport.test.ts`; Source: `tests/answer-context.test.ts`; Source: `tests/answer-annotations.test.ts`; Source: `tests/ai-ask-shell.test.ts`]

## Story Validation

### BMad Checklist Validation

- [x] All three authoritative BDD acceptance criteria are reproduced exactly and mapped to concrete tasks.
- [x] The guide distinguishes canonical current TripAnswerContext from immutable historic answer evidence and prevents raw snapshot/source-bundle disclosure.
- [x] API contracts, strict parsers, extracted domain/database ports, controller wiring, OpenAPI, and BFF adapters are named with existing implementation patterns.
- [x] Principal-derived ownership, missing/foreign non-disclosure, bearer-only private API behavior, no-CORS, and stable safe-error requirements are explicit.
- [x] Current formatted provenance, withdrawal unavailable-only output, descriptor sanitization, stale suppression, and server-derived action-capability constraints are preserved.
- [x] Cutover routing selects exactly one public owner before request handling; shadow comparison is local/staging, post-response, correlation-tagged, and read-only.
- [x] Legacy retirement is bounded to the migrated page read and cannot break Story 11.4 annotation-action authorization.
- [x] Regression coverage includes controller/API, BFF/cutover, PostgreSQL read-model, historic backfill, ownership denial, stale descriptor rejection, raw-data non-disclosure, and prior Story 11 invariants.
- [x] Scope excludes action transport, mutation ownership, migrations, source-removal write behavior, snapshot construction, browser-direct API access, and unrelated travel domains.

### Validation Outcome

Validation passed. The story is complete, traceable, and ready for development. It routes planning-context and answer-detail reads through strict contracts, principal-scoped extracted read ports, Nest API controllers, and server-only BFF adapters while preserving canonical context semantics, read-time withdrawal, persisted annotation sanitization, and current action-capability safety. The selected-owner cutover is explicit and confines legacy retirement to the migrated page read.

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra-review

### Debug Log References

- Story context created and validated on 2026-07-30 from the authoritative Epic 11 BDD contract, complete Epic 11 context, project context, PRD API boundary, architecture decisions AD-19/20/32/35/36/37, completed Stories 11.1-11.4, sprint status, current API/BFF cutover implementation, and focused test seams.

### Completion Notes List

- Ultimate context-engine analysis completed - comprehensive developer guide created.
- Validation passed before implementation: canonical/current versus immutable/historic read semantics, strict safe DTOs, principal-derived ownership, read-time withdrawal, annotation sanitization, current capability derivation, single-owner BFF cutover, legacy-read retirement boundary, and verification layers are complete and traceable.
- No production code, migration, test execution, deployment, or non-story artifact was modified by this story-creation workflow.
- 2026-07-30 independent review of `5d3909c5a5e1ac7415979908431505aac5aea96f..935217f4f8cfc93e223e87e75079ee66bb159ae2` completed synchronously with Blind Hunter, Edge Case Hunter, and Acceptance Auditor. Four actionable patches remain: API-mode detail failure blanks completed assistant prose; an invalid optional detail enrichment can fail the entire API read instead of preserving prose; guarded controller coverage omits a valid foreign-principal non-disclosure request; and page detail loading launches unbounded concurrent BFF requests for assistant-history messages. AC1 passes; AC2 and AC3 are partial. No code changes were made during review.
- 2026-07-30 repaired only the four independent-review findings. API shells retain persisted completed assistant prose when the selected API detail request is unavailable, while provenance and annotations remain empty and no legacy detail request is made. PostgreSQL detail projection now falls back to a contract-validated prose-only detail when optional provenance/annotation enrichment is invalid or unavailable. Guarded controller coverage uses a valid foreign principal and observes the same null response. Page detail BFF work is bounded to four concurrent requests. Focused serial tests: 168 passed; typecheck and build passed; lint had zero errors and five pre-existing unrelated warnings; `git diff --check` passed. Status is ready-for-dev, not done.
- 2026-07-30 second and final unattended independent review of exact range `5d3909c5a5e1ac7415979908431505aac5aea96f..488f746` completed synchronously with Blind Hunter, Edge Case Hunter, and Acceptance Auditor; no layer failed. BLOCKED with one MEDIUM decision-needed and seven patches: decide whether completed assistant prose retained by `getOwnedConversationShell` is an authorized BFF shell exception or must move behind the API, deterministically order and cap provenance before the 100-item contract boundary, preserve annotation labels from the selected answer text, omit/clip long URL quick facts so strict parsing does not discard all enrichment, extract the existing persisted-annotation sanitizer and current capability resolver into the shared API-safe boundary rather than maintain a second policy, make malformed planning-read cutover configuration fail closed, and add required withdrawal/backfill plus foreign-project controller non-disclosure proof. AC1/AC2/AC3 are partial; scope is partial because the duplicated sanitizer/resolver violates the mandated reuse boundary. Focused serial regression command passed 168 tests and requested-range `git diff --check` passed. No implementation changes were made during review.
- 2026-07-30 product-owner decision log: Option 2 is approved. `getOwnedConversationShell` may render owner-scoped immutable persisted `messages.content` solely as completed assistant prose. API/BFF remains the sole authority for provenance, annotations, current action capabilities, and historic detail enrichment. On API/BFF detail failure, retain only that prose with no enrichment and never invoke a legacy detail reader.
- 2026-07-30 bounded final recovery repaired all seven review findings. The API read repository orders, deduplicates ranks, and caps provenance before the 100-item contract parser; rebuilt annotations retain the answer-selected label and omit overlong URL facts before parsing. The hostile persisted-descriptor sanitizer and current capability resolver are now the shared `@xuyenviet/domain` API-safe boundary, with root compatibility delegation and parity coverage. Malformed planning-read configuration rejects before either owner runs. Migration-backed historic withdrawal/backfill read proof returns unavailable-only provenance, and guarded API proof covers a valid foreign principal's own project alongside non-disclosure of that project to the owner.
- 2026-07-30 final serial verification passed: `pnpm vitest run tests/planning-read.test.ts tests/answer-annotations.test.ts tests/knowledge-source-removal.test.ts tests/api-platform-contract.test.ts tests/ai-ask-shell.test.ts --maxWorkers=1 --no-file-parallelism` (203 tests), `pnpm typecheck`, `pnpm lint` (0 errors; 5 unrelated existing warnings), `pnpm build`, and `git diff --check`. Final synchronous Blind Hunter, Edge Case Hunter, and Acceptance Auditor passes found no actionable in-scope findings. Status synchronized to done.
- 2026-07-30 Epic 11 completion-review repair shared with Story 11.1: allowlisted typed conflicts now survive normal fact selection when their canonical structured value is selected. The lower-priority conversational value remains conflict-section-only, and execution-level coverage proves the exact final prompt conflict reaches the persisted snapshot/digest path without becoming a normal fact. Story status remains done; Epic 11 remains in-progress pending rerun of the Epic completion review.

### File List

- `_bmad-output/implementation-artifacts/11-5-serve-planning-context-and-details-through-the-api-cutover.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `src/app/ai-ask/page.tsx`
- `src/features/chat-trips/conversations.ts`
- `packages/database/src/index.ts`
- `tests/ai-ask-shell.test.ts`
- `tests/api-platform-contract.test.ts`
- `tests/planning-read.test.ts`
- `tests/answer-annotations.test.ts`
- `tests/knowledge-source-removal.test.ts`
- `packages/config/src/index.ts`
- `packages/domain/src/planning-detail.ts`
- `src/features/ai/answer-annotations.ts`
