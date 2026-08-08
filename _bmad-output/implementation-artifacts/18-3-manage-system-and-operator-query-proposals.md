---
story_id: 18-3
status: ready-for-dev
created: 2026-08-07
epic: 18
---

# Story 18.3: Manage System and Operator Query Proposals

## Story

As an operator,
I want system and operator discovery queries in one manageable proposal list,
so that Discovery can pursue knowledge needs while I can steer priority and scheduling.

## Acceptance Criteria

1. **Given** Discovery needs system-generated proposal inputs, **when** the Discovery-owned planning stage reads Knowledge and AI Ask signals, **then** Knowledge and AI Ask publish explicit safe query ports for coverage gaps, freshness risk, unresolved conflicts, and aggregated anonymized demand.
   - Each port returns only bounded aggregate geography, taxonomy, priority, and reason context. It never returns traveler identity, prompts, conversation content, raw answers, raw source material, or provider payloads.

2. **Given** safe coverage-gap, freshness-risk, unresolved-conflict, or anonymized-demand signals are available, **when** the Worker-owned planning stage refreshes proposals, **then** it idempotently creates or refreshes system-origin query proposals with reason, target, priority, query text, cadence, enabled/paused state, and a safe signal summary.
   - Discovery persists none of traveler identity, prompts, conversation content, raw answers, or raw source material.

3. **Given** a signal port returns no signals or is temporarily unavailable, **when** planning runs, **then** it creates no invented proposal from that input and records a safe planning outcome.
   - Operator-managed queries and other available signal sources continue independently according to policy.

4. **Given** an authorized operator manages a proposal, **when** they create a simple query, edit text, reprioritize, pause, or resume it, **then** the command is role-protected, audited, and preserves `origin = operator | system`.
   - Do not add advanced rule builders, blocking, or exclusion policy.

5. **Given** an enabled query is globally disabled or operator-paused, **when** its next execution is calculated, **then** global disable and per-query pause remain distinguishable.
   - Neither state creates new due-query work until the applicable global or per-query control is enabled or resumed.

## Tasks / Subtasks

- [ ] Define bounded, explicit upstream signal ports and contracts (AC: 1, 3)
  - [ ] Add separate Discovery-facing Knowledge and AI Ask port types in the established domain/contracts boundaries. Each returns exactly `{ status: "available", signals: readonly SafeDiscoveryQuerySignal[] }` or `{ status: "unavailable", code: "source_unavailable" | "source_timeout" | "source_invalid" }`; do not use `null`, a thrown provider error, or a free-form summary as a result.
  - [ ] Define `SafeDiscoveryQuerySignal` with exact keys only: `reason`, `geography`, `taxonomy`, and `priority`. `reason` is closed to `coverage_gap | freshness_risk | unresolved_conflict | anonymized_demand`; `geography` and `taxonomy` are trimmed Unicode letter/number/space/hyphen strings of 1..80 characters; `priority` is an integer 1..100. Each available port returns at most 100 signals. No nested values, URLs, identifiers, timestamps, free text, or additional properties are allowed.
  - [ ] Derive the opaque target identity deterministically from the normalized `(reason, geography, taxonomy)` tuple, using a stable SHA-256 hex digest; do not accept it from upstream. Derive query text only from the allowed geography/taxonomy strings, priority directly from the signal, and cadence from the current policy. Sort by reason/geography/taxonomy, deduplicate identical tuples by retaining the highest priority, and reject conflicting/invalid values rather than choosing arbitrary input.
  - [ ] Validate every port result at the boundary with exact-key (`additionalProperties: false`) semantics. Reject unknown keys, arrays/objects not explicitly allowed, identity/prompt/conversation/answer/source/provider shapes, arbitrary JSON, and invalid bounds before planning or persistence. Empty `available` signals and `unavailable` results contribute no proposal.
  - [ ] Persist one bounded planning-outcome row or equivalent Discovery-owned planning record per completed planning lease, containing only planning identity, policy version, closed `completed | unavailable | contended | cancelled` outcome, aggregate created/refreshed count, and zero-or-more closed unavailable codes. Do not store signal values, target digests, query text, or free-form summaries in audit/telemetry.
  - [ ] Do not let Discovery query Knowledge or AI Ask tables directly, and do not add a generic cross-module query or event framework.

- [ ] Extend the existing proposal aggregate for safe idempotent planning (AC: 2, 3, 5)
  - [ ] Extend `youtube_discovery_query_proposals` rather than creating a second system-query table. Add only the bounded target/identity and safe-summary/state fields needed to identify and refresh a system proposal and later project scheduling context.
  - [ ] Preserve the existing closed origin, reason, priority, safe query-text, enabled, and cadence constraints. Add database checks/indexes and a unique identity appropriate to a system reason plus safe target so concurrent/repeated refreshes cannot duplicate a proposal.
  - [ ] Create the next append-only Drizzle migration (`0047_*` if the journal has not advanced) and append its journal entry. Do not hand-maintain a parallel schema ledger or alter prior migrations.
  - [ ] Model global policy disable independently from `enabled` on an individual proposal. A paused proposal remains identifiable as paused; a globally disabled enabled proposal remains enabled but has no due work or next-run projection until Discovery is re-enabled.

- [ ] Add database-owned planning leasing and idempotent due-query scheduling (AC: 2, 3, 5)
  - [ ] Add one Discovery-owned recurring planning singleton/lease record, not a generic job framework and not an untyped run. It has a fixed identity; persisted `nextRunAt`; immutable current-policy-version snapshot for each claim; `queued | running | completed | cancelled` closed state; claim owner/time/expiry; random fencing token; terminal/outcome time; and only the safe planning outcome fields above. Enforce its valid state shapes and singleton identity in PostgreSQL.
  - [ ] In each finite Worker poll, recover an expired planning lease to `queued`, claim at most one planning lease with PostgreSQL time and `FOR UPDATE SKIP LOCKED`, and guard every completion/write on planning ID, `running`, matching token, and unexpired lease. A zero-row guarded write is `contended`; stale planners cannot refresh proposals, schedule runs, or record an outcome. Planning claims may be admitted only while the current policy is enabled; current disable under the active lease cancels the planning record before each proposal upsert and due-run insert.
  - [ ] After a completed planning lease, atomically project the singleton back to `queued` with `nextRunAt` set to the first future policy-cadence boundary using PostgreSQL time. A cancelled lease remains terminal while global Discovery is disabled; on a later enabled Worker poll, re-queue it at the first future boundary. Never backfill missed planning intervals, reuse a fencing token, or create a second planning record.
  - [ ] Add proposal scheduling state sufficient to calculate a deterministic next execution: a cadence anchor/last-admitted timestamp and a next-due timestamp or an equivalent projection from persisted timestamps. Use PostgreSQL time. The next run is the first cadence boundary after an admitted run; never derive it from a caller clock.
  - [ ] Implement one atomic scheduler operation that considers enabled proposals only when the current policy is enabled. It creates at most one due run per proposal and due interval using a proposal/schedule-interval unique constraint or guarded insert, advances the schedule only after that run is admitted, and uses the existing `createYoutubeDiscoveryRun` policy/proposal admission rules rather than bypassing them.
  - [ ] While globally disabled or operator-paused, create no run and show no next run. On re-enable/resume, calculate the next future cadence boundary from the persisted anchor; do not backfill missed intervals or create duplicate overdue work. Per-query pause never changes global policy state, and global disable never changes the query's `enabled` value.

- [ ] Implement Worker-owned, fenced planning refresh (AC: 2, 3, 5)
  - [ ] Extend the finite `youtube-discovery` Worker execution path from Story 18.2 to recover/claim at most one due planning lease first; if no planning lease is due or claimed, claim at most one due Discovery run through the existing Story 18.2 path. A finite poll never executes both a planning lease and a due query run. Do not add an HTTP-triggered planner, continuous loop, cron, or UI-triggered execution.
  - [ ] Read safe port results, deterministically derive the allowed query text/cadence/priority/target identity, and upsert the same system proposal on repeated planning. A malformed, absent, or unavailable source must not synthesize a query.
  - [ ] Reuse Story 18.2 run lease/fence mechanics for due runs and the new planning lease for planning. Check current enablement under the matching active lease immediately before every system-proposal upsert and due-run insert; a disabled policy produces no new planning or due-query work.
  - [ ] Attribute automated planning mutations through `createSystemAuditActor("system-youtube-discovery")` and `recordAuditEvent` in the same transaction. Audit/telemetry summaries contain only explicit safe scalar operational fields, never query text, targets, signal summaries, or upstream content.
  - [ ] Preserve one-poll Worker behavior and safe `youtube.discovery` observations. Do not introduce provider calls, candidates, canonicalization, YouTube API credentials, Gemini, AI triage, or `youtube:capture` behavior.

- [ ] Add protected, audited operator query commands and safe projections (AC: 4, 5)
  - [ ] Add narrow command/read contracts for simple create, text edit, priority change, pause, and resume. Validate query text and numeric fields before persistence; retain immutable origin and never allow command input to select or impersonate a system actor.
  - [ ] Implement mutations in `packages/database/src/youtube-discovery/` using short transactions and the Audit-owned writer. Operator changes use the authenticated user audit actor; automated changes use only `system-youtube-discovery`.
  - [ ] Add a Discovery admin controller, application port binding, and typed request/response contracts for create, edit text, reprioritize, pause, resume, and safe list/read projection. Require `@RequiresAdminCapability("admin.knowledge.write")` and `@AllowsAdminBrowserSession()`; do not widen `AdminCapability` without an approved policy decision. Validate input and output at the controller boundary, require a `RequestPrincipal` for mutations, and map policy/validation failures to the existing safe API envelopes.
  - [ ] Provide a safe read model suitable for Epic 20: origin text, query text, reason, priority, enabled/paused state, cadence, and next-run context. Never include raw upstream inputs or unsafe operational details.
  - [ ] Do not build the Mission/control-tower UI in this story. Epic 20 owns the combined list presentation, Vietnamese labels, form focus/error behavior, and query-detail interactions.

- [ ] Prove safety, idempotency, scheduling, and command behavior (AC: 1-5)
  - [ ] Add DB-free unit coverage for every allowlisted port field/bound, unknown/nested values, identity/prompt/provider-content shapes, deterministic target/query derivation, duplicate merging, empty/unavailable/mixed-port outcomes, origin/actor enforcement, and global-disable versus query-pause scheduling projection.
  - [ ] Add serial PostgreSQL integration coverage with local `resetTestDatabase()` setup for concurrent planning claims, stale-planner fencing, expired-planning-lease recovery, policy revocation before proposal upsert and due-run insertion, one safe planning outcome per completed lease, idempotent/concurrent system refresh, and transaction-coupled audit attribution.
  - [ ] Prove a completed singleton planning lease becomes eligible exactly once at its persisted next planning boundary, repeated polls before that boundary do not claim it, disabled planning produces no catch-up refresh after re-enable, and the same singleton identity is reused with a new fencing token on each claim.
  - [ ] Prove atomic duplicate scheduling resistance, cadence advancement only after admitted work, no run creation/no next-run projection while globally disabled or paused, distinct re-enable/resume projections without backfill, and later independent due work after either control is restored.
  - [ ] Add server-side API tests for unauthenticated/traveler denial, operator/admin admission through `admin.knowledge.write`, immutable origin, real authenticated-user audit attribution, safe output parsing, and all five operator commands.
  - [ ] Assert persisted proposal, audit, and telemetry projections exclude identity, prompts, conversations, raw answers, raw source material, provider payloads, query text, target values, and arbitrary source summaries where those are not explicitly safe to expose.
  - [ ] Preserve Story 18.1 query validation/admission tests and Story 18.2 lease, terminal-audit, retry, and finite Worker-poll tests. Do not weaken disabled-query run admission.
  - [ ] Run focused `pnpm test:unit` and `pnpm test:integration` selections, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Record an exact blocker rather than claiming an unrun check passed.

## Dev Notes

### Scope and sequencing

- Stories 18.1 and 18.2 are complete. Reuse their Discovery policy/query/run aggregate, Audit/system actor boundary, finite Worker adapter, PostgreSQL lease/fence transitions, and global-enable revocation behavior.
- This story owns safe upstream query ports, idempotent system-proposal refresh, operator query commands, and scheduling context. Story 18.4 owns canonical YouTube URLs, documented search, candidate/appearance identity, and Knowledge-owned prior-capture lookup. Story 18.5 owns enrichment/retention. Epic 19 owns AI triage/review/intake handoff. Epic 20 owns the operator UI and global-switch command surface.
- The existing worker execution seam deliberately has no provider stage. Replace or extend it only with bounded planning behavior required here, retaining the finite adapter model and test seam discipline.

### Architecture and safety guardrails

- Discovery is URL-only and is not a Knowledge lifecycle owner. Never write `sources`, capture versions, ingestion jobs, evidence, cards, source bundles, publication/lifecycle state, or traveler content. Never invoke, schedule, enqueue, or retry `youtube:capture` or Gemini video analysis.
- Use one `youtube_discovery_query_proposal` aggregate for `system` and `operator` origins. Do not add a second proposal aggregate, a generic jobs/workflow framework, process-local coordination, a separate scheduler, or an advanced-rule/blocking/exclusion subsystem.
- System planning reads only explicit aggregate ports. Discovery must not directly read Knowledge or AI Ask persistence. Treat raw upstream data as prohibited, not merely hidden: do not accept, log, audit, serialize, or persist it.
- Safe input validation must be allowlist-based. Audit writer truncation is not sanitization. Generate audit/telemetry summaries from known safe scalar fields only; omit query text, target identity, free-form reason text, and signal summary unless a separately bounded contract explicitly authorizes it.
- Automated planning requires the immutable `system-youtube-discovery` actor. Operator commands require the authenticated user actor. Preserve origin across every edit, reprioritize, pause, and resume operation; a system proposal must not become operator-origin or vice versa.
- Global policy enablement and per-query pause are separate controls. Current global disable fences all new planning/runs; a per-query pause only blocks that proposal's future due work. Neither revives terminal runs when re-enabled/resumed.
- Use database-owned short transactions, PostgreSQL time, existing lease/fence guards, and guarded writes. A zero-row guarded write is contention, never a successful refresh or schedule.

### Existing implementation details to preserve

- `packages/database/src/schema.ts` currently constrains proposal origins to `system | operator`, reasons to the five closed values, priorities to `1..100`, query text to trimmed safe text with no URL/credential shape, and cadence to `15..10080`. Preserve and extend these checks instead of duplicating validation elsewhere.
- `packages/database/src/youtube-discovery/index.ts` already verifies matching query actor/origin, creates proposals and audits in one transaction, prevents runs for disabled proposals, and records only origin/priority/enabled/cadence in proposal audits. Extend this module and maintain those exclusion properties.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` claims at most one run per finite poll, checks policy disable before its stage, maps closed outcomes to a safe observation, and uses a private test-only seam. Planning must preserve those properties and recheck disable before its own write boundary.
- Use `recordAuditEvent` rather than direct protected-table inserts. Use `createSystemAuditActor("system-youtube-discovery")` rather than a free-form executor identifier.
- The migration journal currently ends at `0046_discovery_run_execution`; append the next migration only after confirming the active journal at implementation time.

### API and UX constraints

- Commands are server-side, role-protected Nest adapters. Follow `apps/api/src/admin/admin-knowledge-intake.controller.ts` and the admin-capability decorators if transport is added. Do not give presentation code a domain/database writer.
- The future Mission query list is a single combined list: `Hệ thống đề xuất` and `Operator tạo` are textual origin labels, not separate products or color-only states. Its row requires query text, reason, priority, enabled/paused state, and next run.
- A global-off enabled query projects `Tạm dừng do Discovery đang tắt`; a paused query projects `Tạm dừng bởi operator`; neither has a next run while blocked. Preserve enough typed state to make these future projections possible, but do not build the UI now.

### Testing requirements

- Use `pnpm test:unit` only for infrastructure-free tests; unit tests must not read database URLs, migrate Drizzle, or connect to PostgreSQL.
- Use `pnpm test:integration` only for PostgreSQL behavior. Integration tests remain serial, and each clean-table suite explicitly calls `resetTestDatabase()` locally. Do not restore a global database-reset hook or enable parallel workers.
- Expected focused test areas include `tests/youtube-discovery-policy.test.ts`, a new planning unit test, `tests/youtube-discovery-foundation.integration.test.ts`, `tests/youtube-discovery-execution.integration.test.ts`, and a new planning integration test as warranted by the final design.
- No external research or dependency upgrade is required: use the repository's existing TypeScript 5.8.3, PostgreSQL/Drizzle 0.44.5, NestJS, Worker, Audit, and contracts stack.

### Project Structure Notes

- Keep domain ports/validation in `packages/domain/src/youtube-discovery/`, persistence and mutation operations in `packages/database/src/youtube-discovery/`, shared contracts/read models in `packages/contracts/src/youtube-discovery/`, and Worker execution in `packages/worker-domain/src/features/youtube-discovery/`.
- Update package barrel exports only in their existing owners. Schema changes belong in `packages/database/src/schema.ts`, with one append-only migration and its journal entry.
- Add an API controller only when required for the role-protected command boundary; do not create an admin UI, a new service, package, or deployment component.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 18.3: Manage System and Operator Query Proposals]
- [Source: _bmad-output/implementation-artifacts/epic-18-context.md#Requirements & Constraints, Technical Decisions, and Cross-Story Dependencies]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-3, AD-4, AD-6, AD-7, and AD-8]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/EXPERIENCE.md#Query proposal list, State Patterns, and Interaction Primitives]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-youtube-discovery-2026-08-06/DESIGN.md#Query proposal row]
- [Source: _bmad-output/implementation-artifacts/18-1-establish-discovery-ownership-policy-and-audit-foundation.md#Existing implementation patterns to preserve]
- [Source: _bmad-output/implementation-artifacts/18-2-execute-fenced-scheduled-discovery-runs.md#Required implementation patterns and Testing requirements]
- [Source: _bmad-output/project-context.md#Testing Rules, Code Quality & Style Rules, and Critical Don't-Miss Rules]
- [Source: packages/database/src/schema.ts#youtubeDiscoveryQueryProposals]
- [Source: packages/database/src/youtube-discovery/index.ts#createYoutubeDiscoveryQueryProposal and createYoutubeDiscoveryRun]
- [Source: packages/worker-domain/src/features/youtube-discovery/execution.ts#runYoutubeDiscoveryPoll]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis completed 2026-08-07.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Independent BMad validation passed after resolving the planning lease lifecycle, due-query scheduling, safe-port contract, and protected API command boundary. No implementation, test execution, migration, or application-code change was performed.
- 2026-08-07: Unattended independent review of `bbc752d79fb48927571beb4fe9f9ce0019b84db9..10c352b22c79bd10eb951f27eb6740ed57297b4d` ran Blind Hunter, Edge Case Hunter, and Acceptance Auditor synchronously. Actionable findings: migration `0047` rewrites legacy system `operator_request` rows to operator origin; the concrete Knowledge port queries Knowledge tables directly and treats healthy empty results as unavailable; system target identity differs between the generic create API and planner; new planning tables are missing from the exported schema aggregate; system-upsert audits can report an unpreserved enabled state; duplicate scheduling relies on driver error text; required bounded ports do not provide all required signal categories; and required API/concurrency/scheduling integration coverage is incomplete. Status set to in-progress; no implementation changes made.
- 2026-08-07: Repaired the supplied independent-review findings only. Legacy system origins remain immutable; Discovery adapts owner-published bounded ports, including healthy empty signals; direct system creation derives the planner tuple identity; planning tables are exported; refresh audits retain persisted enablement; due scheduling uses conflict-safe insertion; and focused command/lease/fence/scheduling coverage was added. Status returned to ready-for-dev pending follow-up review.
- 2026-08-08: Second unattended independent review of `bbc752d79fb48927571beb4fe9f9ce0019b84db9..eb5bd887dd496fc230eb4825abd362e3e5949ae7` ran the adversarial and edge-case layers synchronously; the required Acceptance Auditor failed to provide an auditable AC/scope result and is recorded as a failed layer. Actionable findings: production Worker composition permanently binds both upstream planning ports as unavailable, existing system-proposal refreshes can retain a next due timestamp projected using a superseded cadence, and the safe admin read parser rejects enabled proposals with no next run after global re-enable. Decision needed: migration 0047 permits legacy `operator_request` as a system safe-signal summary to preserve existing immutable system rows, which conflicts with the new four-reason system input contract. Status set to in-progress; no application code or tests changed.
- 2026-08-08: Repaired only the final independent-review findings. Production Worker composition now binds Knowledge- and AI Ask-owned bounded aggregate projections without Discovery table access; system refreshes re-project next due time at the first future boundary when cadence changes; safe admin projections allow an enabled, unpaused proposal with no next run during the global re-enable transition. User-authorized migration 0047 clean break converts legacy system `operator_request` rows to operator origin before enforcing the four system reasons. Focused cadence, contract, owner-port, and migration evidence was added. Acceptance Auditor evidence is concrete through the targeted tests and migration assertion. Status returned to ready-for-dev pending follow-up review.

### File List

- _bmad-output/implementation-artifacts/18-3-manage-system-and-operator-query-proposals.md
- _bmad-output/implementation-artifacts/spec-18-3-manage-system-and-operator-query-proposals.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/worker/src/adapters.ts
- drizzle/migrations/0047_discovery_query_planning.sql
- packages/database/src/schema.ts
- packages/database/src/youtube-discovery/index.ts
- packages/database/src/youtube-discovery/planning-ports.ts
- packages/database/src/knowledge-discovery-signals.ts
- packages/database/src/ai-ask-discovery-signals.ts
- tests/admin-youtube-discovery-api.integration.test.ts
- tests/youtube-discovery-foundation.integration.test.ts
- tests/youtube-discovery-planning.test.ts
- tests/youtube-discovery-policy.test.ts
- tests/admin-youtube-discovery-contract.test.ts
- tests/story-18-3-clean-break.test.ts
