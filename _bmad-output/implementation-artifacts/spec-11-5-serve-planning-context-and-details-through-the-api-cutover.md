---
title: 'Serve Planning Context and Details Through the API Cutover'
type: 'feature'
created: '2026-07-30'
status: 'done'
baseline_revision: '5d3909c5a5e1ac7415979908431505aac5aea96f'
review_loop_iteration: 0
followup_review_recommended: false
final_revision: 'PENDING_COMMIT'
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/11-5-serve-planning-context-and-details-through-the-api-cutover.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/implementation-artifacts/epic-11-context.md'
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Planning-context, provenance, and answer-detail page reads still use a root Next owner. Moving them to the private API must preserve canonical-current versus immutable-historic semantics, owner non-disclosure, withdrawal safety, and annotation/action safety.

**Approach:** Add narrow strict contracts, neutral owner-scoped read ports and PostgreSQL adapters, protected Nest controllers, and server-only BFF loaders. The page selects exactly one owner per read through validated flags, while legacy mutation authorization remains intact.

## Boundaries & Constraints

**Always:** Reuse `loadAnswerContext` as the sole `TripAnswerContext v1` assembler; serialise its non-enumerable v1 metadata explicitly. Format provenance only with `formatAssistantMessageProvenance`, sanitize persisted descriptors only with `sanitizeStoredAnswerAnnotations`, and derive capabilities only from current owner-scoped state. Scope every query by principal-derived owner, make foreign/missing outcomes non-disclosing, document bearer-only/no-CORS safe API behavior, keep identifiers/collections/strings bounded and timestamps canonical UTC, and select one public owner before invoking either read.

**Block If:** Requirements cannot be satisfied without changing the authoritative story or sprint status, changing a migration, adding action execution transport, or exposing undocumented workspace/source/snapshot data.

**Never:** Do not expose source snapshots, bundle serialization, prompt digest, provider/operator/raw/transcript material, browser credentials, stored target/route/capability authority, or cross-user state. Do not replace historic answer evidence with a live aggregate, dual-read publicly, retry through the unselected owner, mutate state, invoke providers, or retire `getOwnedConversation` while `executeAnnotationAction` depends on it.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Current selected context | Bearer principal owns selected project and context | Explicit v1 current context with deterministic ordering, aggregate version, bounded facts, and typed conflicts | Safe empty/non-disclosing outcome when absent or foreign |
| Historic answer detail | Owner requests a completed assistant answer | Final prose plus formatter-derived provenance, sanitized annotations, and current capability only | Invalid/missing optional enrichment is omitted; prose remains |
| Withdrawn or stale state | Historic source is withdrawn or descriptor/capability is no longer valid | Localized unavailable provenance marker; affected descriptors/actions omitted | Never return URL, title, quote, fact, raw material, target, or capability |
| Cutover routing | Flag is true/false, malformed, or shadow-enabled | Exactly API or legacy runs; shadow runs post-response only in local/staging | Malformed owner flag fails closed to legacy; malformed API DTO rejects selected request; shadow failures do not affect response |

</intent-contract>

## Code Map

- `packages/contracts/src/index.ts` -- strict versioned DTOs and response parsers.
- `packages/domain/src/index.ts` and `packages/database/src/index.ts` -- neutral owner-scoped ports, pure serializers, and Postgres adapters.
- `packages/database/src/answer-context.ts` and `packages/database/src/provenance.ts` -- canonical context and safe availability formatters to reuse.
- `src/features/ai/answer-annotations.ts` and `src/features/chat-trips/conversations.ts` -- sanitizer and existing owner-safe detail/capability behavior to extract/preserve.
- `apps/api/src/conversations/conversations.controller.ts`, `app.module.ts`, `main.ts`, and `openapi.controller.ts` -- guarded controller, composition, and API documentation pattern.
- `src/features/chat-trips/conversation-summary-{bff,loader}.ts`, `src/server/bff-api-client.ts`, and `src/app/ai-ask/page.tsx` -- BFF cutover template and page integration.
- `tests/api-platform-contract.test.ts`, `tests/conversation-summary-cutover.test.ts`, `tests/bff-transport.test.ts`, `tests/answer-context.test.ts`, `tests/answer-annotations.test.ts`, and `tests/ai-ask-shell.test.ts` -- controller, read-model, cutover, and shell regression seams.

## Tasks & Acceptance

**Execution:**
 - [x] `packages/contracts/src/index.ts` -- add bounded versioned current-context and historic answer-detail/provenance DTOs with strict parsers and safe null/non-disclosure representation.
 - [x] `packages/domain/src/index.ts`, `packages/database/src/index.ts`, `packages/database/src/answer-context.ts`, and focused database modules -- expose feature-neutral owner-scoped current-context/detail read ports and pure safe serializers that reuse canonical context, safe provenance formatting, descriptor sanitization, and live capability resolution without raw egress.
 - [x] `apps/api/src/conversations/*`, `apps/api/src/app.module.ts`, `apps/api/src/main.ts`, and `apps/api/src/openapi.controller.ts` -- add principal-only protected `/v1` read endpoints, runtime wiring, safe errors, bearer ownership, ordering/limit documentation, and no-CORS-preserving behavior.
 - [x] `src/features/chat-trips/*-bff.ts`, `src/features/chat-trips/*-loader.ts`, `packages/config/src/index.ts`, and `src/app/ai-ask/page.tsx` -- add server-only strict BFF adapters and validated single-owner cutovers; replace only migrated page reads while retaining URL alignment, empty-shell behavior, and mutation authorization dependencies.
 - [x] `tests/api-platform-contract.test.ts`, `tests/conversation-summary-cutover.test.ts`, `tests/bff-transport.test.ts`, `tests/answer-context.test.ts`, `tests/answer-annotations.test.ts`, `tests/ai-ask-shell.test.ts`, and affected proposal/command tests -- prove API, PostgreSQL, BFF, withdrawal, descriptor, capability, non-disclosure, raw-field exclusion, and previous Story 11 behavior serially.

**Acceptance Criteria:**
- Given a BFF requests selected current context or historic answer detail, when the API resolves its bearer principal and owner scope, then it emits only the owner’s canonical context or safe projection and documents authorization, ownership, errors, order, and limits.
- Given source withdrawal, historic backfill, or invalid/stale descriptor state, when a migrated API read occurs, then current availability suppresses all unsafe source/action content and no foreign data can be inferred.
- Given an enabled staging/local cutover, when a planning read is requested, then precisely one API/BFF or legacy public owner handles it; confined post-response comparison never affects the browser and only migrated legacy page reads are retired.

## Spec Change Log

## Review Triage Log

### 2026-07-30 — Review passes
- intent_gap: 0
- bad_spec: 0
- patch: 20 (high 2, medium 14, low 4)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high]` `[patch]` Made the selected API path the sole owner of historic planning-detail content, provenance, annotations, and capabilities; removed legacy detail fallbacks.
  - `[medium]` `[patch]` Added strict DTO identity, ordering, range, provenance-reference, URL, and action-ID binding validation with matching OpenAPI schemas.
  - `[medium]` `[patch]` Added guarded route non-disclosure/no-CORS coverage, PostgreSQL adapter coverage, safe optional-detail failure behavior, and bounded database test-client lifecycle handling.
  - `[low]` `[patch]` Corrected OpenAPI 3.0 nullable and recursive JSON unions to match parser behavior.

## Auto Run Result

**Summary:** Added owner-scoped planning-context and historic answer-detail API contracts, Nest controllers, PostgreSQL read adapters, and server-only BFF cutover loaders. API-mode page reads now select the API before historic planning detail handling, preserve withdrawal and annotation safety, and never use legacy detail fallback.

**Review:** Synchronous Blind Hunter and Edge Case Hunter passes identified and repaired cutover ownership, strict parser, OpenAPI, guarded route, PostgreSQL adapter, and lifecycle issues. The final remaining OpenAPI parity repair was verified with focused contract tests.

**Verification:**
- `pnpm vitest run tests/api-platform-contract.test.ts tests/conversation-summary-cutover.test.ts tests/bff-transport.test.ts tests/planning-read.test.ts --maxWorkers=1 --no-file-parallelism` -- passed, 56 tests.
- `pnpm vitest run tests/answer-context.test.ts tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism` -- passed, 352 tests.
- `pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --maxWorkers=1 --no-file-parallelism` -- passed, 62 tests.
- `pnpm typecheck` -- passed.
- `pnpm lint` -- passed with 0 errors and five pre-existing warnings.
- `pnpm build` -- passed.
- `git diff --check` -- passed.

**Residual risks:** API detail transport failure intentionally produces a safe empty historic-answer shell rather than retrying or reading the retired legacy detail owner. Deployed staging/private-route and public-launch verification remain outside this story.

## Design Notes

Current selected-project context and historic answer evidence are intentionally different projections. The controller must not construct either from raw rows: the context serializer reads v1 fields explicitly from `loadAnswerContext`, while historic detail flows through the established provenance formatter and descriptor sanitizer before contract serialization. The selected BFF owner is fixed before data handling; optional comparison is observability, not fallback.

## Verification

**Commands:**
- `pnpm vitest run tests/api-platform-contract.test.ts tests/conversation-summary-cutover.test.ts tests/bff-transport.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: guarded transport, strict parsing, safe OpenAPI, and cutover routing pass.
- `pnpm vitest run tests/answer-context.test.ts tests/answer-annotations.test.ts tests/ai-ask-shell.test.ts tests/trip-change-proposals.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: serial context/detail/withdrawal/descriptor/capability/page regressions pass.
- `pnpm vitest run tests/domain-outbox.test.ts tests/ai-ask-commands.test.ts tests/ai-ask-stream-execution.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: previous AI lifecycle and command behavior pass.
- `pnpm typecheck` -- expected: strict TypeScript passes.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm build` -- expected: production build passes.
- `git diff --check` -- expected: no whitespace errors.
