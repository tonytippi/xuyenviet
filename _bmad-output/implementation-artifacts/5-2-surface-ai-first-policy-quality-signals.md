---
baseline_commit: e48723a5ff2fd109303df2e187510b84f7533d42
---

# Story 5.2: Surface AI-First Policy Quality Signals

Status: review

## Story

As an operator,
I want quality views to expose evidence and policy failure patterns,
so that I can prioritize suppression, verification, or stricter sampling before travelers are affected.

## Acceptance Criteria

1. **Given** sampling recommendations, evaluation results, and card state transitions exist, **when** an operator views quality signals, **then** they can inspect active-card sampling pass/fail, policy cohort, evidence-grounding failure, caveat violation, verification-required state, and suppression/escalation signals, **and** usefulness and generic-answer comparison remain linked to stored retrieval decisions/provenance.
2. **Given** a high-severity sampled or evaluated policy failure is recorded, **when** the affected cohort is shown, **then** the view identifies the prompt/model/category/cohort and recommended safe action, **and** it does not expose raw source material, provider payloads, or traveler-private content.
3. **Given** no data is sufficient to calculate a quality signal, **when** the dashboard renders, **then** it reports the missing signal rather than claiming readiness, **and** it preserves role-gated operator access.

## Tasks / Subtasks

- [x] Extend the Feedback/Eval-owned safe quality-dashboard read model (AC: 1-3)
  - [x] Extended `src/features/feedback/quality-dashboard.ts` without a parallel dashboard or persistence aggregate.
  - [x] Preserved server-side authorization before protected reads.
  - [x] Preserved evaluation filters and explicitly scopes sampling as all sampling policies.
  - [x] Added bounded aggregates/diagnostics for evaluation failures, version-bound sampling outcomes, current verification state, cohort escalation/suppression, and existing retrieval/provenance signals.
  - [x] Batched the required safe evaluation, policy, cohort, recommendation, and card reads.
  - [x] Preserved policy flag meanings, version fences, durable severity limits, and deterministic safe-action labels.

- [x] Preserve privacy, provenance, and feature ownership boundaries (AC: 1-3)
  - [x] Feedback/Eval owns the dashboard query/projection; Knowledge continues to own sampling, recommendation resolution, card state, and suppression/escalation commands. Do not bypass module ownership with dashboard mutation code.
  - [x] Reuse persisted answer-time retrieval decisions and row-per-source provenance only as safe identifiers/category-use signals. Do not parse answer prose or reconstruct policy state from mutable cards as a substitute for evaluation-time snapshots.
  - [x] Never select, return, serialize, log, or render `publicMvpEvaluationResults.answerText`, messages/conversation content, raw source/capture text, bounded evidence quote text, source URLs/snippets, full `sourceSnapshot` JSON, provider payloads, query bodies, traveler identity/context, credential-bearing URLs, or sampling rationale. Safe IDs alone are acceptable only where existing diagnostics already use them.
  - [x] Keep all result/cohort data bounded. Reuse the Story 5.1 policy-snapshot limits of at most five selected knowledge items and ten reason codes; aggregate/count rather than expanding JSON payloads.
  - [x] Do not change baseline score aggregation, feedback aggregation, existing counter metrics, the five canonical prompts, the six rubric dimensions, or `buildReadiness()`. Story 5.3 owns active evidence-grounded readiness-gate changes.

- [x] Render additive, read-only operator quality signals (AC: 1-3)
  - [x] Extended `src/app/admin/quality/page.tsx` using the existing Vietnamese-first operator dashboard visual language and its current filter form, counter metrics, readiness panel, and recent diagnostics.
   - [x] Added concise policy-signal summaries plus bounded cohort/result diagnostics showing category, prompt, model version, scenario/category, cohort key when available, severity/state, and recommended safe action. No free-form source/answer/detail content or inert action controls are rendered.
  - [x] Clearly labels missing, unavailable, or uncorrelated signals in Vietnamese without changing readiness behavior.
  - [x] Preserves semantic labels, focus styling inherited from existing controls, adequate contrast, non-color state text, and smaller-width readability.

- [x] Add focused regression coverage and run required verification (AC: 1-3)
  - [x] Extended `tests/public-mvp-quality-dashboard.test.ts` with Story 5.1 policy flags/snapshots and version-bound sampling fixtures.
  - [x] Proved anonymous/traveler role denial before aggregates are returned.
   - [x] Proved sampling pass/fail, cohort state, verification-required cards, evidence/caveat failures, durable escalation/suppression, prompt/model/category, safe actions, unselected members, non-member verification recommendations, and unavailable per-result severity.
  - [x] Proved a later card version does not contaminate historical cohort results and the existing missing-signal/readiness regression remains intact.
  - [x] Preserved usefulness, generic-answer, retrieval/provenance, and filter behavior while exposing sampling as unfiltered scope.
  - [x] Extended serialization-leak assertions for answer text, sampling rationale, provenance snapshot, provider, and raw-source markers.
  - [x] Reused `tests/public-mvp-evaluation.test.ts` and `tests/knowledge-recommendation-queue.test.ts` as ownership regressions.
  - [x] Ran DB-backed focused suites serially using normal repository commands, then lint, typecheck, and build; no `db:reset` was used.

## Dev Notes

### Scope And Business Context

- This is the current Epic 5 AI-first quality-learning delta. Story 5.1 has already persisted six versioned policy scenarios and safe result snapshots; Story 5.2 makes those stored signals actionable to operators without changing evaluation generation, Knowledge commands, or readiness gates.
- The objective is an operator-only, safe projection for early intervention: suppression/escalation, verification, or stricter sampling. It is not a generic analytics product, an answer/source viewer, a new review queue, or a card mutation surface.
- Story 5.3 alone changes the public-evaluation readiness gate. Keep the current dashboard readiness rules intact even when Story 5.2 reports a serious policy signal.

### Existing Implementation To Extend

- `src/features/feedback/quality-dashboard.ts` is the owning server-only read model. It already performs role gating, filters evaluation rows, aggregates feedback/rubric/counter metrics, batches retrieval/provenance reads, and returns safe recent diagnostics. Extend this contract rather than adding a second read path.
- `src/app/admin/quality/page.tsx` is the existing read-only Vietnamese operator dashboard. Preserve its filters, existing metrics, readiness display, counter metrics, and safe recent-result diagnostics while adding policy-quality signals.
- `src/features/feedback/evaluation.ts` provides the authoritative Story 5.1 persistence semantics. `buildPolicySnapshot()` stores selected safe card/version/state/use-policy metadata, excluded counts/reasons, source/evidence outcome, fallback metadata, and finalization outcome. Do not reimplement or overwrite it.
- `src/features/knowledge/recommendations.ts` owns version-fenced sampling and high-severity escalation. A `sampling_fail` with approved high severity suppresses only the policy cohort, disables applicable projections, and writes audits. Story 5.2 reads those durable policy/recommendation/card outcomes only.
- Existing schema supports the required inputs: `publicMvpEvaluationResults`, `publicMvpEvaluationResultPolicySnapshots`, `knowledgeSamplingPolicies`, `knowledgeSamplingCohortMembers`, `knowledgeRecommendations`, and `knowledgeCards`. No migration is expected unless implementation identifies a concrete persisted-data gap.

### Data And Policy Guardrails

- Evaluation policy failure data: `unsupportedCommunityWordingFlag`, `requiredCaveatOmittedFlag`, `staleWithdrawnSourceExposureFlag`, and `rawEvidenceLeakageFlag` represent failures. `conflictedKnowledgeExcludedFlag` and `fallbackVerificationGuidanceMetFlag` represent the required safe behavior and become a failure signal only when false.
- Sampling outcomes are recommendation/version based. Use `resolution` (`sampling_passed`/`sampling_failed`), `samplingDispositionReason`, `policyId`, and matching cohort member `(knowledgeCardId, contentVersion, evidenceSetRevision)`. Do not expose `samplingRationale`.
- `knowledgeSamplingCohortMembers` is the cohort denominator for `sample` policy work; deterministic selection may leave a member without a sampling recommendation. `verify_first` may reference a sampling policy but does not create cohort membership. Join sampling outcomes only by the complete policy/card/version/revision fence.
- Policy state comes from `knowledgeSamplingPolicies.escalatedAt` and `.suppressedAt`; card state must remain current-state information. Do not reconstruct unrecorded historical transitions.
- `escalatedAt`/`suppressedAt` is durable cohort-level evidence of a high-severity sampling escalation, not evidence that every recommendation in the cohort was high severity. Evaluation results have failure flags, not a persisted severity classification.
- The current `PublicMvpQualityDashboard.recentResults` safely exposes source-category booleans and existing safe identifiers. Retain this contract; no full provenance snapshot or answer detail belongs in the dashboard payload.
- Query and render only bounded safe fields. The dashboard must never contain raw/operator-only evidence, provider data, web content/query bodies, traveler conversations/context, or evaluation answer text.

### Architecture Compliance

- PostgreSQL and Drizzle remain the system of record. If persistence truly changes, use a forward-only Drizzle migration and journal update; do not add untracked JSON conventions or modify historical migrations.
- Keep server-only code and `@/*` imports. The app remains a Next.js modular monolith with a feature-owned server read entrypoint.
- Server-side role validation is required for every admin/operator read. Preserve both the dashboard read-model gate and the admin layout gate.
- Stored answer-time provenance and retrieval decisions are the source of truth for quality/evaluation. Do not derive policy from free-form Vietnamese answer text or mutable live Knowledge rows.
- Preserve fail-closed retrieval and Knowledge ownership. A dashboard read must never repair eligibility, publish/suppress a card, or create review/sampling work.

### Project Structure Notes

- Expected production files: `src/features/feedback/quality-dashboard.ts` and `src/app/admin/quality/page.tsx`.
- Expected test file: `tests/public-mvp-quality-dashboard.test.ts`; read existing evaluation and recommendation-queue tests before adding fixtures.
- No separate API, client state store, dashboard component library, background worker, provider integration, or test framework is required.
- Do not modify Story 5.1 evaluation orchestration except for a concrete dashboard-read compatibility defect discovered during implementation. Do not begin Story 5.3.

### Testing Requirements

- Vitest is configured serially (`fileParallelism: false`, `maxWorkers: 1`). Run DB-backed suites one command at a time using `DATABASE_URL_TEST`; never run them concurrently and never use `pnpm db:reset`.
- Start with `DATABASE_URL_TEST="$DATABASE_URL_TEST" pnpm test:run tests/public-mvp-quality-dashboard.test.ts`, then run relevant existing evaluation/recommendation suites as required by changed data contracts.
- Baseline verification remains `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Record actual commands, results, warnings, and any blockers in the Dev Agent Record when implementing.

### Previous Story Intelligence

- Story 5.1 established a six-scenario AI-first evaluation registry over five canonical prompts, persisted immutable safe policy snapshots, and added dashboard-read compatibility without implementing Story 5.2 UI.
- Story 5.1 intentionally keeps synthetic evaluation fixtures suppressed and unindexed; only exact internal fixture IDs can be read by evaluation. Dashboard work must not make fixture data traveler-retrievable or broaden that capability.
- Evaluation policy assertions must use answer-time persisted snapshots. Evaluation fixtures, current cards, and search state are mutable and cannot replace that record.
- Existing protections to preserve: missing-model preflight writes nothing; no raw/operator-only material reaches evaluator/dashboard contracts; conditional high-risk behavior requires conditions and Vietnamese verification guidance; conflicted/withdrawn data remains excluded; low-confidence/failed fallback requires verification guidance.

### Git Intelligence

- Recent Story 5.1 commits (`9927716`, `7cd2dc6`, `2082145`, `8efea42`) repeatedly hardened fixture isolation, answer-time snapshot use, scenario contracts, leakage counter behavior, and failed-contract retention. Treat this safety behavior as baseline, not optional dashboard detail.
- The finalized status commit `e48723a` marks Story 5.1 done. Its dashboard changes are additive data-contract preparation for this story; preserve their existing baseline metrics and authorization behavior.

### Latest Technical Information

- No external library, provider, or framework upgrade is required. Use the pinned repository stack: Next.js 15.3.5, React 19.1.0, TypeScript 5.8.3, Drizzle ORM 0.44.5, Vitest 4.1.10, and pnpm 10.26.2.
- Do not add dependencies or introduce a separate reporting/analytics/test stack.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 5]
- [Source: _bmad-output/planning-artifacts/epics.md#Story 5.2]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.3 Community Knowledge Publication And Conflict Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.5 AI Answer Quality Rubric]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-3, AD-4, AD-5, AD-6, AD-7, AD-11, AD-28]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Operator Workflow]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md#Admin Shell]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/5-1-evaluate-ai-first-community-knowledge-safety.md]
- [Source: src/features/feedback/quality-dashboard.ts]
- [Source: src/app/admin/quality/page.tsx]
- [Source: src/features/feedback/evaluation.ts]
- [Source: src/features/knowledge/recommendations.ts]
- [Source: src/db/schema.ts]
- [Source: tests/public-mvp-quality-dashboard.test.ts]
- [Source: tests/public-mvp-evaluation.test.ts]
- [Source: tests/knowledge-recommendation-queue.test.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Story creation loaded the complete target Epic 5 context, PRD, architecture spine, community knowledge solution design, UX contract, project context, completed Story 5.1, current Feedback/Eval dashboard/evaluation code, current Knowledge recommendation/sampling implementation, schema, and relevant test suite.
- Architecture and UX artifacts were discovered in sharded planning directories referenced by `epics.md`; no separate technical research was necessary because this story uses repository-pinned implementation patterns and no dependency/provider changes.
- 2026-07-24: Loaded the `bmad-dev-story` workflow, project context, complete Story 5.2, sprint status, current dashboard/read model, schema, evaluation persistence, and related regression suites. The existing schema supplies the required bounded evaluation snapshots and version-fenced sampling cohort inputs; no schema gap or migration was identified.
- 2026-07-24: Added the initial focused dashboard regression fixture for safe policy/sampling projection, then attempted the required red-phase command: `DATABASE_URL_TEST="$DATABASE_URL_TEST" pnpm test:run tests/public-mvp-quality-dashboard.test.ts`. Vitest stopped before loading tests with `DATABASE_URL_TEST is required for integration tests.`

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Status set to `ready-for-dev` after validation against the create-story checklist: scope is additive and read-only, uses existing safe persistence and ownership boundaries, prevents policy-flag inversion and cohort-version drift, preserves Story 5.3 readiness scope, and requires explicit no-data/missing-signal behavior.
- 2026-07-24: Revalidated the target story against the current dashboard, evaluation, sampling, schema, test, PRD, architecture, and UX contracts. Repaired the target-only guidance for cohort membership versus recommendation selection, `verify_first` policy references, durable severity limits, category provenance, and deterministic safe-action mappings. Final validation passed; Story 5.2 remains `ready-for-dev`.
- 2026-07-24: Blocked before implementation verification because `DATABASE_URL_TEST` is unavailable in this execution environment. Story remains `in-progress`; no task or subtask was marked complete and sprint status was not advanced to `review`.
- 2026-07-24: Completed the bounded recovery using normal repository test commands without environment overrides. Added the safe, read-only policy-signal projection and Vietnamese operator rendering; all focused DB-backed suites, typecheck, and build passed. Lint completed with three existing unused-variable warnings in `tests/knowledge-search.test.ts` and no errors.

### File List

- _bmad-output/implementation-artifacts/5-2-surface-ai-first-policy-quality-signals.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- tests/public-mvp-quality-dashboard.test.ts
- src/features/feedback/quality-dashboard.ts
- src/app/admin/quality/page.tsx

### Change Log

- 2026-07-24: Created the implementation-ready Story 5.2 context and synchronized its sprint status to `ready-for-dev`.
- 2026-07-24: Repaired target-only validation gaps and reconfirmed `ready-for-dev`; sprint status remains synchronized.
- 2026-07-24: Began Story 5.2 and added an initial regression fixture; halted because the required `DATABASE_URL_TEST` configuration is missing.
- 2026-07-24: Completed Story 5.2 implementation and verification; status moved to `review`.

### Verification

- `pnpm test:run tests/public-mvp-quality-dashboard.test.ts` - passed (8 tests).
- `pnpm test:run tests/public-mvp-evaluation.test.ts` - passed (15 tests).
- `pnpm test:run tests/knowledge-recommendation-queue.test.ts` - passed (23 tests).
- `pnpm lint` - passed with 3 pre-existing warnings in `tests/knowledge-search.test.ts`.
- `pnpm typecheck` - passed.
- `pnpm build` - passed.
