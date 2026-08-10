---
story_id: 19-3
status: done
created: 2026-08-10
epic: 19
---

# Story 19.3: Review One Ranked Candidate at a Time

## Story

As an operator,
I want to inspect one ranked Discovery candidate with its safe rationale,
so that I can make an informed intake decision without reviewing raw source content.

## Acceptance Criteria

1. **Given** an authorized operator opens candidate review on desktop/tablet, **when** ranked candidates are available, **then** the API provides paginated or explicit load-more queue data and a selected-candidate safe detail projection.
    - The UI renders a scan-friendly ranked queue with a persistent inspector for exactly one candidate at a time.
    - The active review set contains only immutable recommendations with `recommendation = consider` and a Discovery-owned mutable review state of `pending`. Each candidate has at most one active review association, which identifies its exact immutable recommendation. Do not infer eligibility from scores, triage, history, or a newest candidate row.
    - Queue order is deterministic: recommendation score descending, then recommendation creation time ascending, then recommendation ID ascending. The cursor/load-more contract must preserve this order without duplicates or omissions when rows share a score.
    - The read-only API is `GET /v1/admin/knowledge/youtube-discovery/review?cursor=<opaque-cursor>` and `GET /v1/admin/knowledge/youtube-discovery/review/:recommendationId`. The root `GET /v1/admin/knowledge/youtube-discovery` remains the existing query-proposal list.
    - Queue selection is client-local: select the first returned item after initial load, fetch its detail after an explicit row selection, and make no detail request for an empty queue. Do not persist selected-candidate state.

2. **Given** an operator selects a candidate, **when** its inspector renders, **then** it shows canonical URL, safe video/channel metadata, query reason, plain-language recommendation, up to five applicable factors/penalties, derived signals, and the prior safe capture outcome.
    - Active review admission requires non-null query-proposal provenance. A recommendation without its linked safe query text and reason is historic-only and is not available from the review detail route.
    - Project only bounded safe fields from Discovery's candidate, immutable recommendation, run/appearance/query provenance, and the existing Knowledge-owned safe prior-capture boundary. Never query Knowledge tables directly or expose source/capture identifiers.
    - Never expose raw comments, model output, raw source material, provider diagnostics or payloads, source IDs, capture internals, evidence spans, transcripts, media, credentials, cookies, or traveler data.
   - Map only Story 19.2's closed factor, penalty, reason, and signal codes to Vietnamese operator copy. Recommendation/scores/signals are ranking context, never verified facts, credibility proof, capture status, or publication eligibility. Numeric scores are progressive disclosure only.

3. **Given** the selected candidate's action row renders before decision commands are available, **when** the inspector renders, **then** Accept, `Để sau`, and `Bỏ qua` are disabled read-only previews.
    - This story renders a read-only preview seam only: its labelled disabled controls explain in Vietnamese that decisions arrive in the next workflow slice. It must not implement an accept/defer/skip command, candidate-state mutation, audit event, Knowledge intake call, source write, or manual capture scheduling. Stories 19.4 and 19.5 own actual pending/reconciliation behavior and those effects.
    - The disabled preview state has an accessible name and polite live announcement, and does not open a confirmation dialog.

4. **Given** the workspace is narrow, mobile, keyboard-operated, or uses assistive technology, **when** candidate review is used, **then** all authorized read functions reflow into sequential queue/detail views without two-dimensional scrolling.
   - Queue selection, load-more, inspector details, selected-state semantics, visible focus, and concise status changes have accessible names and behavior.
   - At 320 CSS pixels and 400% zoom, queue and detail remain usable; selection does not require pointer or hover; load-more is explicit rather than infinite scroll.

## Tasks / Subtasks

- [ ] Define bounded operator-review contracts and parsing (AC: 1, 2)
   - [ ] Extend `packages/contracts/src/youtube-discovery/index.ts` with exact safe queue/detail response types and strict parsers. Keep the existing query-proposal contracts unchanged.
   - [ ] Define exactly these response fields. Queue item: `recommendationId`, `canonicalUrl`, `title: string | null`, `channelName: string | null`, `publishedAt: ISO-UTC | null`, `durationSeconds: integer | null`, and closed recommendation label/context. Detail: the queue fields plus `queryText`, query `reason`, closed recommendation, score only as opt-in progressive disclosure, factors, penalties, reason, signals, and safe prior-capture outcome. Do not project candidate/video/channel IDs, description, tags, thumbnail, raw popularity metrics, run/appearance/triage/policy IDs, or any other field.
   - [ ] Reject unknown keys, invalid/duplicate/out-of-vocabulary arrays, unbounded strings, invalid UTC timestamps, non-finite/out-of-range numeric progressive-disclosure fields, and cursors that do not match the documented opaque format. Do not serialize internal run/appearance/triage/policy IDs unless the UI has a defined safe need for them; it does not in this story.
   - [ ] Define one fixed server page size and a stable versioned opaque cursor from the complete ordering tuple, not a mutable offset. Responses are exactly `{ items, nextCursor }`, where `nextCursor` is `null` at the end. The server validates/decodes it fail-closed: malformed or stale-incompatible cursors return `400 { code: "validation_error" }`.

- [ ] Establish the minimal Discovery-owned review-state foundation (AC: 1, 2)
   - [ ] Add one forward Drizzle migration and matching `packages/database/src/schema.ts` representation for a Discovery-owned candidate review state. Each row holds exactly `pending | accepted | deferred | skipped`, its candidate ID, and one non-null immutable `recommendationId`; use a same-candidate composite foreign key and uniqueness constraints to enforce one state row and one current recommendation association per candidate.
   - [ ] Backfill existing valid immutable `consider` recommendations with a single deterministic `pending` association only when they have non-null query-proposal provenance. For candidates with several historic qualifying recommendations, select exactly one during backfill by recommendation creation time descending then recommendation ID descending; this explicit one-time migration rule is not a runtime eligibility inference. Retain all recommendations as immutable history and document the rule in the migration and story implementation.
   - [ ] Do not add a decision command, state transition, audit event, Knowledge write, capture scheduling, generic review repository, or compatibility layer. Stories 19.4 and 19.5 exclusively mutate this state.

- [ ] Add a role-protected Discovery review read port and PostgreSQL projection (AC: 1, 2)
   - [ ] Add the focused read method to `packages/domain/src/youtube-discovery/admin.ts`; preserve existing query-proposal administration methods and avoid generic cross-module repository exports.
   - [ ] Implement the PostgreSQL adapter beside `packages/database/src/admin-youtube-discovery.ts`. Accept an injected `YoutubeCaptureEligibilityPort` at the API composition root for the bounded prior-outcome lookup; the adapter must not construct the port or read Knowledge tables. On `unavailable`, return only that closed safe outcome and retain the otherwise active row; do not infer eligibility or source/capture state.
   - [ ] Read only `consider` recommendations referenced by the same candidate's `pending` review-state association and with non-null query-proposal provenance. A non-active, absent, or historic recommendation returns safe `404 { code: "not_found" }`; it must not disclose its state.
   - [ ] Join recommendation provenance so a detail belongs to a queue result and cannot combine metadata, query reason, signals, or recommendation fields from another run/appearance/policy. Treat immutable recommendation rows as historic context: do not update them.
  - [ ] Use one bounded page size with an enforced server maximum, stable tuple ordering, and an explicit `nextCursor`/has-more signal. The detail endpoint must be owner-authorized and return `not found` for an ID outside the active review projection rather than leaking its historic state.
   - [ ] Do not add Discovery decision writes beyond the required review-state foundation, Worker stages, provider calls, triage/model changes, Knowledge source access, or retention behavior.

- [ ] Expose the safe read contract through the established admin API (AC: 1, 2)
   - [ ] Extend `apps/api/src/admin/admin-youtube-discovery.controller.ts` with role-protected GET queue/detail routes under its existing versioned Discovery route. Reuse `@RequiresAdminCapability("admin.knowledge.write")`, `@AllowsAdminBrowserSession()`, safe request-ID handling, and the controller's validation/unavailable envelope conventions.
   - [ ] Parse query parameters and response bodies with the contracts package. Return `400 { code: "validation_error" }` for malformed cursor/ID input, safe `404 { code: "not_found" }` for absent/non-reviewable detail, and `503 { code: "internal_error" }` for unsafe projection or repository failure. Missing capability remains under the established authorization guard. Do not return partial rows or internal details.
  - [ ] Keep API transport read-only. Do not add POST decision routes in this story.

- [ ] Build the admin candidate review workspace (AC: 1-4)
   - [ ] Add the Discovery review page/client under `apps/admin/app/knowledge/` following existing direct Nest API client, auth redirect, and safe-response parsing patterns. Read requests use credentialed `GET`, `x-request-id`, `cache: "no-store"`, response parsing, and the established `401` sign-in redirect; do not fetch CSRF for this read-only slice. Add an explicit admin navigation entry only if the current shell has a matching Discovery navigation convention.
  - [ ] On desktop/tablet, render a bounded queue/list and persistent labelled inspector. Queue rows show safe title, channel, published date/duration when available, Vietnamese recommendation label, priority/ranking context, and selected state; never show raw score as the primary label.
  - [ ] Inspector renders canonical URL, safe video/channel metadata, discovery query/reason, Vietnamese recommendation explanation, at most five factor/penalty chips total, signal chips, and bounded prior-capture outcome. Do not render description, tags, thumbnail, or any field unless the contract explicitly allows it and it remains safe/scannable.
  - [ ] Make numeric score disclosure opt-in and authorized-only, with a native accessible control. It must explain ranking context without asserting correctness, verification, capture, or publication.
   - [ ] Render the future action row with explicit labelled disabled `Accept`, `Để sau`, and `Bỏ qua` controls, no click/request handler, and a concise Vietnamese read-only explanation. It must not claim a decision is pending or happened. Story 19.4 wires Accept and Story 19.5 wires defer/skip plus all post-action selection recovery.
  - [ ] On narrow/mobile layouts, replace the split pane with sequential list and detail surfaces. Preserve selection in client state, move focus to the detail heading only through an explicit detail action, and return focus predictably to the selected row/queue heading.
   - [ ] Provide empty, loading, unavailable, and pagination-end states in concise Vietnamese. Use a polite live region for loaded range, selected candidate, and read-only-preview messages; toasts must not steal focus.

- [ ] Verify authorization, safety, ordering, and accessibility boundaries (AC: 1-4)
   - [ ] Add DB-free contract/unit tests for strict safe projection parsing, all closed-code Vietnamese mappings, bounded explanation display, cursor encode/decode validation, tie ordering, no duplicate/omitted cursor pages, and prohibited-field rejection. Keep the Vietnamese mapping as one exported UI-local mapping/table with exhaustive closed-code tests.
   - [ ] Add serial PostgreSQL integration tests for review-state migration/backfill and same-candidate active association constraints, active-review predicate, immutable recommendation/run/appearance/query provenance alignment, ordering/cursor behavior, absent/non-reviewable detail denial, and the injected Knowledge safe-port boundary. Each clean-table integration file calls `resetTestDatabase()` locally.
   - [ ] Extend API integration coverage for operator authorization, unauthenticated/unauthorized denial, malformed pagination/detail input, `400`/`404`/`503` safe response envelopes, and absence of raw/internal fields.
   - [ ] Add admin UI tests for client-local first/explicit selection, empty queue without detail request, explicit load-more, inspector content, focus/selected semantics, live announcements, read-only disabled action row, and narrow sequential structural reflow. Assert no action path writes Discovery/Knowledge state or invokes capture. Reserve browser-measured 320px/400%-zoom no-horizontal-overflow evidence for the established browser/E2E harness or Epic 20.5.
  - [ ] Run focused unit tests with `pnpm exec vitest run --project unit` and the exact new/affected Discovery contract, read-model, and UI tests. Run focused serial PostgreSQL coverage with `pnpm exec vitest run --project integration` and the affected Discovery integration/API tests.
  - [ ] Run `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record exact blockers without weakening unit/integration separation.

## Dev Notes

### Scope and sequencing

- Story 19.2 is complete. It provides immutable, provenance-linked `skip | defer | consider` recommendations with bounded explanation/signal codes. Reuse those records; do not recalculate recommendation, mutate a historic recommendation, or create another ranking model.
- Story 19.3 establishes only the minimal state foundation required to read one current candidate safely, then delivers the authorized read/API/UI slice. Story 19.4 owns immediate audited Accept and the Knowledge seed-batch intake outcome matrix. Story 19.5 owns defer/skip decisions, stale/concurrent decision handling, queue refresh, and post-decision selection. Do not implement either later story early.
- The state foundation must bind exactly one current immutable recommendation to each candidate; it is not permission to mutate the state from this story. Until Story 19.4 supplies a command, controls are an explicitly read-only preview rather than a simulated pending command.

### Architecture and privacy guardrails

- Discovery is URL-only. It never creates/writes `sources`, capture versions, ingestion jobs, evidence, cards, or publication state; it never invokes, schedules, enqueues, or retries `youtube:capture`.
- Keep all persistence under `youtube_discovery_*`. The API owns role-protected read projection and `apps/admin` is a typed presentation client only. Worker lifecycle and provider calls remain Worker-owned.
- Use only bounded safe candidate metadata and the existing Knowledge-owned opaque prior-capture eligibility boundary. Do not import, query, or join Knowledge tables, and never retain or expose a Knowledge source ID/link.
- Forbidden in responses and UI: raw comments, reconstructed summaries, model prompts/responses, provider diagnostics/payloads, source/capture IDs or internals, transcripts, media, credentials, cookies, raw source material, evidence spans, and traveler data.
- Triage recommendation, candidate operator state, and Worker run state remain distinct closed enums. A rank/recommendation is not fact correctness, source verification, capture completion, publication eligibility, or traveler content.

### Existing implementation to preserve

- `apps/api/src/admin/admin-youtube-discovery.controller.ts` already owns role-protected Discovery query administration using strict contracts and safe error envelopes; extend it rather than creating a second controller or route namespace.
- `packages/contracts/src/youtube-discovery/index.ts` uses exact-key parsers and canonical ISO UTC timestamps. New review parsers must have the same fail-closed boundary.
- `packages/database/src/admin-youtube-discovery.ts` and `packages/domain/src/youtube-discovery/admin.ts` are the established admin read/command port seam. Add the narrowly typed review reads there.
- `packages/database/src/schema.ts` defines `youtubeDiscoveryCandidates`, appearances, triages, immutable recommendations, and ranking history. Preserve their cross-run/provenance constraints and read recommendation fields from the same provenance tuple.
- The request-serving API composition must inject the existing Knowledge-owned `YoutubeCaptureEligibilityPort`; do not reuse the Worker composition or construct a Knowledge reader in an admin controller/read adapter.
- Existing admin clients (`apps/admin/app/knowledge/intake/knowledge-intake.tsx` and `apps/admin/app/knowledge/facebook-captures/queue.tsx`) demonstrate the direct API request, session redirect, typed parsing, `role="status"`, and explicit pagination patterns. Preserve the established admin visual language instead of adding a new dashboard system.

### UX and accessibility guardrails

- Desktop/tablet is queue-plus-persistent-inspector, a practical workbench rather than a KPI dashboard. Use borders and tonal selected state before shadows; follow the existing green/amber/map-paper tokens.
- Do not use a modal for Accept. Future command feedback is non-blocking and does not steal focus. Only destructive behavior may eventually use a dialog, but no destructive command exists in this story.
- Status must use text plus color-independent treatment. Rows expose title, recommendation, ranking context, and selected state. Controls have explicit Vietnamese accessible names, visible focus, and 44px touch targets where mobile supports them.
- Use explicit load-more or pagination, never infinite scroll. Keep focus on load-more after append; on page/range change, announce concise range and move focus only when needed.
- Preserve all authorized reading functions at 320 CSS pixels/400% zoom through sequential queue/detail layout without horizontal two-dimensional scrolling.

### Testing requirements

- Unit tests must remain database-free. PostgreSQL tests use the `integration` project, remain serial, and each clean-state file calls `resetTestDatabase()` in local setup.
- Test response safety by injecting prohibited fields into contracts/read projections and proving parsers reject them. Test API/UI response bodies, not just database selection, to prevent accidental serialization regressions.
- Verify both stable queue paging and selection accessibility. Do not treat a client-only test as sufficient for capability enforcement or safe projection.

### Project Structure Notes

- Expected changed paths: `drizzle/migrations/<next>_add_discovery_candidate_review_state.sql`, `drizzle/migrations/meta/_journal.json`, `packages/database/src/schema.ts`, `packages/contracts/src/youtube-discovery/index.ts`, `packages/domain/src/youtube-discovery/admin.ts`, `packages/database/src/admin-youtube-discovery.ts`, the existing API composition root and `apps/api/src/admin/admin-youtube-discovery.controller.ts`, a focused `apps/admin/app/knowledge/...` Discovery page/client, and focused tests.
- Do not alter `packages/worker-domain`, `apps/worker`, AI Gateway/Gemini configuration, the canonicalizer, Knowledge persistence, manual capture runbooks, or recommendation evaluation/persistence. The only permitted persistence change is the minimal Discovery-owned review-state foundation described above.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 19 and Story 19.3]
- [Source: _bmad-output/implementation-artifacts/epic-19-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/19-2-produce-deterministic-candidate-recommendations.md#Existing implementation to preserve]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1, AD-2, AD-5, AD-6, and AD-7]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Layout & Spacing and Components]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Candidate queue, Candidate inspector, and Accessibility Floor]
- [Source: docs/proposals/ai-first-youtube-discovery.md#Deterministic Recommendation And Operator Review]
- [Source: apps/api/src/admin/admin-youtube-discovery.controller.ts]
- [Source: packages/contracts/src/youtube-discovery/index.ts]
- [Source: packages/database/src/admin-youtube-discovery.ts]
- [Source: packages/database/src/schema.ts#youtubeDiscoveryCandidates and youtubeDiscoveryRecommendations]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis and checklist validation completed 2026-08-10.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- The guide reconciles Epic 19's URL-only and safe-projection boundaries with Story 19.2's immutable recommendation provenance and the later Story 19.4/19.5 decision ownership.
- No implementation, migration, provider call, database reset, test execution, or commit was performed while creating this story.
- Implemented the read-only Discovery review slice: durable pending review associations, strict safe queue/detail contracts, microsecond keyset cursors, protected Nest reads, and a responsive Vietnamese admin inspector with disabled decision previews.
- Completed focused migration/read-model, API authorization/error-envelope, contract, UI-boundary, review-state/retention, and stale cursor regression coverage. Final independent adversarial review reported no actionable findings.
- No commit was created.

### File List

- _bmad-output/implementation-artifacts/19-3-review-one-ranked-candidate-at-a-time.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- drizzle/migrations/0057_add_discovery_candidate_review_state.sql
- drizzle/migrations/meta/_journal.json
- packages/contracts/src/index.ts
- packages/contracts/src/youtube-discovery/index.ts
- packages/domain/src/youtube-discovery/admin.ts
- packages/database/src/schema.ts
- packages/database/src/admin-youtube-discovery.ts
- packages/database/src/youtube-discovery/index.ts
- apps/api/src/admin/admin-youtube-discovery.controller.ts
- apps/api/src/main.ts
- apps/api/src/safe-api-exception.filter.ts
- apps/admin/app/admin-access-gate.tsx
- apps/admin/app/knowledge/youtube-discovery-review/page.tsx
- apps/admin/app/knowledge/youtube-discovery-review/review.tsx
- apps/admin/app/knowledge/youtube-discovery-review/review-copy.ts
- tests/admin-youtube-discovery-contract.test.ts
- tests/admin-youtube-discovery-api.integration.test.ts
- tests/admin-youtube-discovery-review-ui.test.ts
- tests/youtube-discovery-review.integration.test.ts
- tests/youtube-discovery-recommendations.integration.test.ts
