---
title: 'Story 23.2: Show Province Coverage And Propose Vietnamese Queries'
type: 'feature'
created: '2026-08-17'
status: 'done'
review_loop_iteration: 0
baseline_commit: '78fd43bfb4230a3016fa2034a061366e8d26776f'
context:
  - '_bmad-output/project-context.md'
  - '_bmad-output/implementation-artifacts/epic-23-context.md'
---

<frozen-after-approval reason="human-owned intent - do not modify unless human renegotiates">

## Intent

**Problem:** Knowledge Mission currently shows a Discovery need frontier rather than a trustworthy province/city coverage view. Operators cannot inspect active Knowledge grouped under the current administrative unit, retain legacy-name context, or request a governed Vietnamese query suggestion from aggregate-only data.

**Approach:** Add a metadata-only canonical-province coverage read and a bounded AI suggestion flow in the protected Knowledge Mission. An operator may turn an edited suggestion or self-authored text into the existing scheduled query proposal, but this story never starts a Discovery run.

## Boundaries & Constraints

**Always:** Count only `active` Knowledge cards and list every governed current province/city, including zero-card units. Group cards by canonical current-unit ID, keep official legacy aliases separate from card free text, report topic counts, `freshnessSensitive` context, and latest update without a sufficient/insufficient verdict. Selected scope uses the stable canonical ID. The AI request contains only selected canonical geography, official aliases, and bounded topic/count/freshness/latest-update aggregates; it contains no demand field, card/source/evidence text, raw location labels, traveler data, prompts, conversations, answers, or provider payloads. Validate exact bounded AI output before rendering; record governed model usage and a safe operator audit event without storing prompt or response bodies. A selected or edited result creates only the existing operator query proposal and its existing audit record.

**Ask First:** Persisting suggestion drafts, dismissals, history, expiry, or deduplication; counting a lifecycle state other than `active`; changing the official reference/version; adding a geography-specific demand source or field; adding query execution, a run ID, Worker work, retry, or progress UI.

**Never:** Infer geography from free text or AI; expose raw Knowledge/source/traveler/provider material; make an automatic coverage verdict; call YouTube, create a Discovery run/candidate/job, schedule or retry `youtube:capture`, create Knowledge lifecycle records, or publish Knowledge. `Chạy ngay`, immediate admission, and progress remain Story 23.3.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Coverage list | Authorized operator opens Mission | Every current unit appears with official aliases, active-card topic counts, freshness context, latest update, and no sufficiency label | Unresolved cards do not enter any canonical row |
| Bounded suggestion | Operator selects a canonical ID | Gateway receives aggregate-only selected-scope input and returns validated Vietnamese need/reason/query | Invalid, unavailable, or failed output renders a safe Vietnamese retry state; no draft/query/run is created |
| Query choice | Operator edits a validated query or authors one | Existing query-proposal command validates and persists the operator proposal for its normal cadence | Preserve browser draft and show validation/error copy; do not admit a run |
| Unsafe request | Missing/foreign/invalid scope or non-operator caller | No coverage scope is resolved and no gateway/query command executes | Existing protected API responses fail closed |

</frozen-after-approval>

## Code Map

- `packages/database/src/schema.ts` -- Story 23.1 canonical geography fields on `knowledgeCards` and reference rows; extend only if a dedicated safe suggestion usage/audit relation is demonstrably required.
- `packages/database/src/knowledge-geography.ts` -- official versioned current-unit/legacy-alias authority; use it for aliases and stable canonical identifiers, never `locationName` inference.
- `packages/database/src/admin-knowledge-coverage.ts` -- existing bounded admin-coverage read pattern; add a Knowledge-owned active-card canonical-province aggregate port/projection rather than exposing card content to Discovery.
- `packages/domain/src/youtube-discovery/admin.ts` -- current protected admin Discovery port and dependencies; extend typed coverage/suggestion commands at this boundary.
- `packages/contracts/src/youtube-discovery/index.ts` -- strict public request/result parsers, bounded page/detail/suggestion shapes, and safe Vietnamese query validation.
- `packages/database/src/admin-youtube-discovery.ts` -- existing operator query `create()` transaction/audit and Mission adapters; reuse proposal creation without touching run admission APIs.
- `packages/database/src/gateway.ts`, `packages/database/src/usage.ts`, and `packages/database/src/usage-constants.ts` -- governed non-streaming model invocation, dedicated purpose/prompt version, safe usage persistence, and no prompt/response-body storage.
- `apps/api/src/admin/admin-youtube-discovery.controller.ts` and `apps/api/src/main.ts` -- capability-protected HTTP endpoints and composition of Knowledge aggregate read with Discovery suggestion ownership.
- `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- existing protected Mission fetch, CSRF, draft preservation, focus/live-region, and 44px control patterns; replace/extend coverage view with sequential province detail and transient suggestion controls.
- `tests/knowledge-geography-normalization.integration.test.ts`, `tests/youtube-discovery-foundation.integration.test.ts`, and `tests/admin-youtube-discovery-api.integration.test.ts` -- serial reset/authorization/audit patterns; add Story 23.2 focused unit, integration, API-contract, and Mission accessibility coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/contracts/src/youtube-discovery/index.ts` and `packages/domain/src/youtube-discovery/admin.ts` -- define strict canonical-province coverage, bounded suggestion request/result, and query-materialization contracts -- keeps browser/API/domain input fail-closed.
- [x] `packages/database/src/admin-knowledge-coverage.ts` and related Knowledge port wiring -- project all official current units plus metadata-only aggregates from active canonical cards -- makes coverage authoritative without leaking card text or treating unresolved labels as geography.
- [x] `packages/database/src/gateway.ts`, `packages/database/src/usage-constants.ts`, `packages/contracts/src/index.ts`, and relevant schema/migration only if required -- add a dedicated governed suggestion purpose, exact output validation, safe operator-attributed usage, and audit summary -- separates this aggregate-only model use from candidate triage.
- [x] `packages/database/src/admin-youtube-discovery.ts`, `apps/api/src/admin/admin-youtube-discovery.controller.ts`, and `apps/api/src/main.ts` -- expose protected coverage/suggestion endpoints and reuse existing operator query creation for authored/edited selections -- creates no run, Worker, candidate, or Knowledge work.
- [x] `apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx` -- render province coverage/search by current or official legacy name, selected detail, transient edit/dismiss/suggestion controls, and explicit `Tạo truy vấn` copy -- preserves drafts, keyboard/focus/live updates, responsive sequential layout, and clearly defers running.
- [x] Focused `tests/*23-2*`, Discovery API/contract tests, and Mission UI tests -- cover the matrix, aggregate-only gateway boundary, exact output rejection, authorization/audit/usage, no-run invariant, query creation, and accessibility -- proves safe behavior across layers.

**Acceptance Criteria:**
- Given an operator loads Knowledge Mission, when province coverage is returned, then every current unit has its official legacy names, active-card topic/freshness/latest-update context, and search matches current or official legacy names without presenting card counts as a coverage verdict.
- Given an operator requests a suggestion for one valid canonical unit, when the gateway call is assembled, then it receives only bounded canonical geography, alias, topic/count/freshness/latest-update aggregates and no demand, raw Knowledge, source, traveler, prompt, conversation, answer, or provider content.
- Given a gateway result is valid, when it is rendered, then it exactly binds to the selected geography and provides a concise Vietnamese knowledge need, reason, and safe natural Vietnamese YouTube query; the operator can edit, dismiss transiently, or create a scheduled query proposal without starting Discovery.
- Given malformed input/output, unavailable model service, unauthorized access, or a failed query command, when the flow handles it, then it fails closed with practical Vietnamese recovery, retains any browser draft, records no unsafe payload, and creates no Discovery run, candidate, capture, or Knowledge record.

### Review Findings
- [x] [Review][Patch] Reject coverage lists whose IDs are not exactly the governed canonical set [packages/contracts/src/youtube-discovery/index.ts:88]
- [x] [Review][Patch] Record safe usage and audit outcomes when the province-suggestion gateway throws [packages/database/src/admin-youtube-discovery.ts:35]
- [x] [Review][Patch] Run the pure province coverage contract suite under `pnpm test:unit` [vitest.config.ts:6]
- [x] [Review][Patch] Verify the successful selected-province suggestion-to-query UI flow [tests/admin-youtube-discovery-mission-ui.test.ts:37]

## Design Notes

Suggestions are transient because the approved scope requires only edit/dismiss before an operator creates a query, not durable suggestion workflow state. The UI must label the next action `Tạo truy vấn`; it must not render or invoke `Chạy ngay` until Story 23.3 owns immediate admission.

## Verification

**Commands:**
- `pnpm test:unit` -- expected: aggregate serializers, strict suggestion parsing, and no-run command boundary pass without database configuration.
- `pnpm test:integration` -- expected: serial PostgreSQL coverage proves active-only canonical aggregation, official aliases, protected/audited usage, query creation, and no Discovery/Knowledge side effects.
- `pnpm lint` -- expected: no new lint errors.
- `pnpm typecheck` -- expected: strict TypeScript succeeds.
- `pnpm build` -- expected: production builds succeed.

## Implementation Evidence

- Province aggregation now receives the injected admin port database and maps governed legacy reference IDs to their current unit before aggregating active-card metadata.
- Province request/result parsers accept only the 34 governed current-unit IDs, require non-null strings, and apply a deterministic Vietnamese-character boundary to suggestion text.
- The controller fails closed when a port response is valid-shaped but belongs to a different canonical province than the request.
- Mission preserves prior query management and Mission context, while suggestion requests are scoped to the current selection and cannot race into a different province or begin during query creation.
- Focused contract, API, integration, and Mission UI tests cover foreign scope rejection, response mismatch rejection, legacy rollup, no-run creation, and local official-name search.

## Suggested Review Order

**Coverage And Model Boundary**

- Start with the metadata-only aggregate and legacy-to-current rollup.
  [`admin-knowledge-coverage.ts:14`](../../packages/database/src/admin-knowledge-coverage.ts#L14)

- Inspect selected-scope model invocation, safe usage, and audit persistence.
  [`admin-youtube-discovery.ts:31`](../../packages/database/src/admin-youtube-discovery.ts#L31)

- Confirm contracts reject ungoverned scopes, null fields, and non-Vietnamese suggestions.
  [`youtube-discovery/index.ts:87`](../../packages/contracts/src/youtube-discovery/index.ts#L87)

**Protected Operator Flow**

- Verify HTTP endpoints fail closed before and after port admission.
  [`admin-youtube-discovery.controller.ts:10`](../../apps/api/src/admin/admin-youtube-discovery.controller.ts#L10)

- Review province selection, transient suggestion, and scheduled-query-only UI behavior.
  [`mission.tsx:149`](../../apps/admin/app/knowledge/youtube-discovery/mission/mission.tsx#L149)

- Check model-purpose persistence matches the model catalog contract.
  [`0074_add_province_suggestion_model_purpose.sql:1`](../../drizzle/migrations/0074_add_province_suggestion_model_purpose.sql#L1)

**Evidence**

- Validate active-only aggregation, safe model inputs, and no-run invariants.
  [`story-23-2-province-coverage.integration.test.ts:25`](../../tests/story-23-2-province-coverage.integration.test.ts#L25)

- Validate protected endpoint and mismatched-scope failure behavior.
  [`admin-youtube-discovery-api.integration.test.ts:49`](../../tests/admin-youtube-discovery-api.integration.test.ts#L49)
