---
baseline_commit: d28ce2c
---

# Story 6.2: Run Public MVP AI-First Readiness Review

Status: review

## Story

As a product owner,
I want one evidence-based go/no-go review for the public MVP,
so that launch readiness is explicit about completed proof, accepted risk, and blocking gaps.

## Acceptance Criteria

1. **Given** active-corpus, quality, retrieval-safety, operational, provider-readiness, and all launch-prerequisite evidence is available, **when** the readiness review runs, **then** it combines the 100-card active evidence-grounded target, sampling/evaluation outcomes, fail-closed retrieval suite, source/provenance checks, provider privacy settings, and web-search monitoring evidence, **and** every criterion is classified as `complete`, `accepted_risk`, or `blocked` with linked evidence.
2. **Given** a launch readiness prerequisite is incomplete or accepted as a risk, **when** the review reports launch status, **then** it links that prerequisite's owner, evidence, disposition, and impact on the chosen public-evaluation scope, **and** it does not hide an unresolved prerequisite inside the review narrative.
3. **Given** a mandatory proof is missing or a safety criterion fails, **when** the final status is calculated, **then** the report returns `no-go` or `conditional-go` with explicit accepted-risk authority, **and** it never claims public readiness merely because legacy approved-card, historical extraction, or UI-completion counts are high.

## Tasks / Subtasks

- [x] Create the final safe readiness review and evidence ledger at `_bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md` (AC: 1-3)
  - [x] Begin with a criterion registry that enumerates every required ledger ID before assessing evidence: QG-01 active 100-card corridor coverage; QG-02 sealed auto-active sampling; QG-03 `verify_first` sampling; QG-04 canonical six-scenario evaluation evidence; QG-05 high-severity evaluation-policy safety; SC-1 through SC-7 PRD success criteria; RT-01 fail-closed current-owner retrieval/source-bundle eligibility; RT-02 stored safe provenance/source-display behavior; WF-01 external/unverified web fallback and low-confidence/failure verification guidance; OP-01 through OP-09; and launch-prerequisite rows PR-01a, PR-01b, PR-01c, and PR-02 through PR-08. For each ID, state whether it is `mandatory_safety`, `mandatory_non_safety`, or `exceptionable_non_safety`. The evidence ledger must contain exactly one disposition row for every registry ID; an absent registry or ledger row is `blocked`.
  - [x] Use this immutable classification matrix and do not reclassify a row in the final report: `mandatory_safety` = QG-05, SC-7, RT-01, RT-02, WF-01, OP-01 through OP-09, and PR-08; `mandatory_non_safety` = QG-01 through QG-04, SC-1 through SC-6, PR-01a through PR-01c, and PR-07; `exceptionable_non_safety` = PR-02 through PR-06. A `mandatory_safety` or `mandatory_non_safety` row cannot be accepted as risk.
  - [x] Use one row per criterion with: ID, scope/environment, observed UTC timestamp, safe evidence reference, observed result, owner, disposition, exact blocker/risk, remediation, and public-evaluation-scope impact. For external, deployment, provider/privacy, monitoring, and manual-smoke evidence, also record `evidence_issued_at_utc` or explicitly state it is unavailable.
  - [x] Use only `complete`, `accepted_risk`, and `blocked` as criterion dispositions. Missing, unavailable, partial, stale, unrepeatable, or repository-only evidence for a live requirement is `blocked`.
  - [x] Treat external evidence as `blocked` unless it is attributable to the currently configured provider/environment/revision and observed during this review or within an explicitly approved freshness window recorded in the row. Evidence outside that window, with an unknown issuance time, or unable to identify its covered configuration/environment is stale and `blocked`.
  - [x] For every `accepted_risk`, record named decision authority, bounded evaluation scope, expiry/review date, remediation, and why it does not override a safety-blocking condition. Do not produce `conditional-go` without all of these fields.
  - [x] Define decision precedence before the ledger: a safety-blocking condition, failed safety regression, missing mandatory safety proof, or any `blocked` OP-01 through OP-09 row requires `no-go` and cannot be overridden. `conditional-go` is permitted only when no safety-blocking condition exists, every `mandatory_safety` and `mandatory_non_safety` row is `complete`, and every `exceptionable_non_safety` row is `complete` or `accepted_risk` with named authority, bounded scope, expiry/review date, remediation, and a revocation condition. `go` requires every mandatory and non-safety prerequisite row to be `complete`.

- [x] Aggregate the current corpus, quality, retrieval, and provenance gate without recomputing it (AC: 1, 3)
  - [x] Assess the current read-only `/admin/quality` result from `getPublicMvpQualityDashboard()` as the authoritative combined corpus/quality input; preserve its unfiltered, `REPEATABLE READ` semantics, and fail closed when no current aggregate is supplied.
  - [x] Require at least 100 Hanoi-to-HCMC cards that are active, have code-valid current traveler-safe evidence, complete retrieval metadata, and `contextual_use`. Do not count legacy `approved` state, caveat-only high-risk cards, failed verification, uncertain/conflicted/superseded cards, invalid/removed/withdrawn evidence, tombstoned captures, stale projections, or incomplete metadata.
  - [x] Require current sealed sampling proof for the 15% auto-active policy window and complete 100% version-fenced `verify_first` sampling proof. A missing, stale, duplicate, pending, unselected-required, truncated, or mismatched proof blocks readiness.
  - [x] Require the newest coherent completed evaluation run for the current prompt-set version with all six stored scenario/version pairs covering the PRD's five canonical prompt types, stored policy snapshots, and exactly six rubric scores per result. Treat stale/withdrawn exposure, raw/evidence leakage, and unsafe conflicted-knowledge use as high-severity blockers; keep non-high quality gaps visible under their existing baseline thresholds.
  - [x] Register and assess PRD success criteria separately as SC-1 through SC-7: SC-1 magic-moment usefulness, at least 7 of 10 sampled public-MVP users or test users rate it at least 7/10; SC-2 at least 7 of 10 test answers include user-context references, practical local tips, and source/confidence notes; SC-3 child-aware recommendation, route/logistics tip, uncertainty/freshness warning, and next step; SC-4 the 100-card active evidence-grounded Hanoi-to-HCMC target; SC-5 active knowledge influences answers and is visible in provenance with appropriate source and uncertainty wording; SC-6 no more than 2 of 10 test users judge answers no better than generic ChatGPT; and SC-7 every active AI-extracted claim in representative samples has validated evidence and no high-severity publication-policy failure. Do not invent thresholds beyond the PRD.

- [x] Aggregate retrieval and traveler-safety proof from stored evidence, not prose or current mutable state (AC: 1, 3)
  - [x] Cite the fail-closed retrieval/source-bundle regressions and persisted-provenance evidence as repository behavior only. Confirm that current owner-row eligibility, evidence, source safety, and use policy govern retrieval; a lexical projection cannot certify eligibility.
  - [x] Confirm provenance/source UI is based on stored safe snapshots and does not parse answer prose. The final report must state the applicable safe-display check without reproducing source material.
  - [x] Record web fallback separately: it remains external/unverified, official/provider-preferred, and must return verification guidance on failure or low confidence. The existing fixture-only Tavily quality report is not live public-scale monitoring proof.

- [x] Aggregate operations, provider/privacy, and launch-prerequisite evidence fail-closed (AC: 1-3)
  - [x] Carry forward every OP-01 through OP-09 row from Story 6.1's operational ledger exactly as evidenced. Do not convert a repository test, documented configuration, legacy extractor supervision, healthy web container, or implementation review into deployment, restart, restore, provider/privacy, or controlled-runtime proof.
  - [x] Evaluate each tracked launch prerequisite independently, even when it overlaps an operational row:
    - [x] PR-01a: Manual Google OAuth smoke-test disposition.
    - [x] PR-01b: Operator/admin access smoke-test disposition.
    - [x] PR-01c: Referral-attribution smoke-test disposition.
    - [x] Verified AI Gateway provider pricing before relying on usage-cost reporting.
    - [x] Live Tavily quality, cost, rate-limit, and failure monitoring for public-scale fallback.
    - [x] Decision on coupling assistant-message/provenance persistence to AI-usage insertion.
    - [x] Decision and, if required, implementation status for assistant-turn idempotency after ambiguous commit failures.
    - [x] Resolution or explicit deferral of same-conversation concurrency hardening.
    - [x] Documented DB-backed migration/integration test sequencing.
    - [x] Current provider data-processing/no-training settings and public privacy-notice evidence for every configured AI/search provider.
  - [x] For any PR-01a through PR-01c item marked obsolete, record the named decision authority, decision timestamp, rationale, affected scope, and replacement control or explicit statement that none is required. A grouped narrative or sprint action-item status is not a disposition.
  - [x] Name the accountable owner, evidence reference, disposition, remediation, and scope impact for each prerequisite. Existing `sprint-status.yaml` action items are not proof by themselves.
  - [x] Preserve the current Story 6.1 operational conclusion unless new safe evidence exists: OP-01 through OP-09 are `blocked`, no accepted risks are recorded, and OP-07 scheduled Facebook `--yes` role enforcement is a safety blocker.

- [x] Validate and finalize the readiness artifact (AC: 1-3)
  - [x] Validate that every criterion-registry ID, every mandatory criterion, OP-01 through OP-09, and PR-01a, PR-01b, PR-01c, and PR-02 through PR-08 has one disposition and a safe evidence reference; no issue may appear only in narrative prose.
  - [x] Check that the final decision follows the decision rules and that all scope limitations, owners, risk authorities, expiry dates, and remediation are explicit where applicable.
  - [x] Keep the review and all linked excerpts free of raw source/capture text, evidence quote/span, URLs/snippets, provider payloads/errors, credentials, browser-profile data, traveler identity/context, chat/trip content, answer text, full provenance snapshots, and secret-bearing configuration.
  - [x] Record the review baseline commit and validate every cited repository-behavior evidence reference against it. Run focused suites sequentially with `DATABASE_URL_TEST` when the cited result is not from the review baseline: `tests/public-mvp-quality-dashboard.test.ts`, `tests/knowledge-search.test.ts`, `tests/answer-context.test.ts`, `tests/ai-ask-shell.test.ts`, `tests/web-search-quality.test.ts`, and `tests/web-search-adapter.test.ts`. If a command cannot run, is inapplicable, or is from a different baseline without a documented unchanged-proof rationale, classify the affected row `blocked`.
  - [x] If code or tests are changed solely to correct the report's evidence collection, run the relevant serial `DATABASE_URL_TEST` suite(s), then `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Do not introduce code changes to make a missing operational proof pass under this story.

### Review Findings

- [x] [Review][Patch][High] Do not claim a final aggregation timestamp unsupported by an immutable audit record [_bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md#evidence-handling-and-decision-precedence] — Resolved by removing the asserted final aggregation time. E7's document-declared validation timestamp is explicitly not treated as immutable issuance, review observation, or fresh external proof; the `no-go` remains supported by blocked mandatory rows.
- [x] [Review][Patch][High] Restore/enforce mutable external-evidence freshness [_bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md#mutable-external-evidence-freshness-register] — Resolved by recording review observation and approved freshness-window status for every mutable external-evidence group. No per-row window is approved; stale, unavailable, and tracker-only proof remains `blocked`.
- [x] [Review][Patch] Completed task contradicts unavailable quality-dashboard evidence [_bmad-output/implementation-artifacts/6-2-run-public-mvp-ai-first-readiness-review.md#tasks--subtasks] — Resolved by recording the task as a fail-closed assessment: no current `/admin/quality` aggregate was supplied, so QG-01 through QG-05 remain `blocked`.
- [x] [Review][Patch] Re-evaluate PR-07 against documented DB-backed migration/integration sequencing [_bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md#safe-evidence-references] — Resolved as `complete`: `README.md#Integration test database` documents the separate test database, Vitest-owned Drizzle migrations, serial focused-suite sequencing, baseline-check order, and `pnpm db:reset` prohibition.
- [x] [Review][Patch][High] Carry OP-01 through OP-09 exactly from the authoritative Story 6.1 ledger [_bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md#story-61-operational-ledger-qualifier] — Resolved by reproducing every Story 6.1 row verbatim and adding a separate non-reinterpretive qualifier. All nine rows remain `blocked`; OP-07 remains a safety blocker.
- [x] [Review][Patch] Replace stale repaired-finding line citations with stable headings [_bmad-output/implementation-artifacts/6-2-run-public-mvp-ai-first-readiness-review.md#review-findings] — Resolved by citing current stable headings rather than mutable line numbers.

## Dev Notes

### Scope And Business Context

- This is the final evidence aggregation and release-decision story for the current Epic 6. It is not an implementation, worker-hardening, deployment, provider-configuration, backup/restore, capture-authorization, or dashboard-feature story.
- Create the safe final report only after inspecting authoritative inputs. Reuse existing read models and evidence ledgers; do not create a second coverage, sampling, evaluation, retrieval, or operations aggregate.
- The report must be honest about the chosen public-evaluation scope. `conditional-go` describes a bounded evaluation authorization, not a general public-launch claim.
- Do not use `_bmad-output/implementation-artifacts/epic-6-context.md`. It documents a superseded Epic 6 and conflicts with the current `epics.md` and sprint inventory.

### Evidence And Decision Contract

| Evidence group | Authoritative input | Required treatment |
| --- | --- | --- |
| Corpus/quality | `src/features/feedback/quality-dashboard.ts`; `/admin/quality`; Story 5.3 | Reuse the current unfiltered combined gate. Its `ready` result is necessary but not sufficient for Story 6.2. |
| Retrieval/provenance | Story 4.7 regressions; stored retrieval decisions and provenance | Treat repository proof as behavior evidence only. Current owner rows and persisted provenance, not search projections or answer prose, are authoritative. |
| Operations | `6-1-knowledge-pipeline-operational-validation-report.md` | Preserve each OP row's owner/disposition. Missing controlled/deployed proof stays `blocked`. |
| Provider/privacy | Provider attestations and public privacy-notice evidence | Require current safe external identifiers/attestations. Source code, README text, or secrets are not evidence. |
| Web fallback | `web-search-fallback-quality-report.md` plus live monitoring evidence | Fixture validation is bounded seam proof only; live quality/cost/rate-limit/failure monitoring remains separately required. |
| Launch prerequisites | Epic 6 prerequisite list and sprint action items | Dispose all ten ledger rows independently: PR-01a, PR-01b, PR-01c, and PR-02 through PR-08. Action-item presence does not equal completion. |

- Reports may contain safe identifiers, revisions, timestamps, command names/results, aggregate counts, approved attestation references, owners, dispositions, and remediation only.
- `PR-01a` through `PR-01c` are the three independent obligations within Epic 6 prerequisite 1. `PR-02` through `PR-08` correspond in order to Epic 6 prerequisites 2 through 8; keep the registry and ledger IDs stable.
- QG-01 through QG-05 are the stable Story 5.3 combined-readiness IDs. They cover the 100-card active-evidence target, auto-active sampling, `verify_first` sampling, canonical six-scenario evaluation, and high-severity policy failures; list them separately rather than treating the dashboard `ready` boolean as exhaustive proof.
- RT-01, RT-02, and WF-01 are the stable retrieval/provenance and web-fallback behavior IDs. They, and every OP row, are mandatory safety proof for this final review. No accepted risk can override them.
- Do not mutate cards, evidence, sources, jobs, projections, sampling cohorts, recommendations, evaluation data, usage records, provider settings, deployment configuration, or sprint action items merely to improve the final disposition.
- A missing proof must remain visible as a `blocked` row with a concrete owner/remediation. Never infer pass from implementation completeness, historical counts, UI availability, or an informal assertion.

### Architecture And Privacy Guardrails

- Preserve the Next.js modular monolith, server-only boundaries, PostgreSQL/Drizzle ownership, feature-owned server entrypoints, and admin/operator server-side authorization. No new service, external monitoring stack, dependency, test framework, or public UI is in scope.
- Retrieval remains fail-closed: `contextual_use`, `caveat_only`, or `exclude` is decided from current card/evidence/source state; index score and stale projections cannot override eligibility.
- Maintain answer context priority: selected trip, current chat, active knowledge, web fallback, then general reasoning. Search remains provider-adapted and external/unverified.
- Stored answer provenance is the source of truth for UI, evaluation, and audit. Do not reconstruct it from mutable card state or parse Vietnamese answer text.
- Admin/readiness material remains role-protected and separate from traveler surfaces. Status communication must be explicit and text-based, not color-only.

### Previous Story Intelligence

- Story 5.3 already provides the authoritative read-only active-evidence corpus, sampling, evaluation, usefulness, and generic-comparison gate. It explicitly excludes historical approval counts and fails closed on incomplete evidence.
- Story 6.1 produced an operational ledger, not a go/no-go. Its current overall disposition is `blocked`: all OP-01 through OP-09 rows lack required controlled/deployed proof, no accepted risk exists, and owner review remains pending.
- Story 6.1's central lesson is non-substitutability: passing repository tests cannot certify deployment supervision, environment separation, live provider settings, privacy, backup/restore, or controlled retention/removal behavior.
- DB-backed tests are serial and require `DATABASE_URL_TEST`; run one Vitest command at a time and never use `pnpm db:reset`.

### Project Structure Notes

- Create only `_bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md` during implementation, plus narrowly scoped safe evidence references if required. Keep Story 6.2 documentation in `_bmad-output/implementation-artifacts/`.
- Read, do not duplicate: `src/features/feedback/quality-dashboard.ts`, `src/app/admin/quality/page.tsx`, `6-1-knowledge-pipeline-operational-validation-report.md`, and `web-search-fallback-quality-report.md`.
- No application code file is expected to change. If a missing proof reveals work, record the blocker and route it to a separately planned story or accepted-risk decision.

### Latest Technical Information

- No web research, dependency upgrade, provider change, or library update is required. The story aggregates project evidence against the repository-pinned stack and externally supplied operational attestations.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6 and Story 6.2]
- [Source: _bmad-output/planning-artifacts/epics.md#Launch Readiness Prerequisites]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#Product Principles]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.3 Knowledge Cards]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.5 Retrieval Web Search And Answer Grounding]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.1 Chat Trip And Data Control Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.5 AI Answer Quality Rubric]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#12 Success Criteria]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-8 AD-9 AD-10 AD-11 AD-14 AD-15 AD-17]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Transaction And Indexing Rules]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Retrieval And AI Ask]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/5-3-close-the-active-evidence-grounded-card-readiness-gate.md]
- [Source: _bmad-output/implementation-artifacts/6-1-validate-knowledge-pipeline-operations-before-public-evaluation.md]
- [Source: _bmad-output/implementation-artifacts/6-1-knowledge-pipeline-operational-validation-report.md]
- [Source: _bmad-output/implementation-artifacts/web-search-fallback-quality-report.md]
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml]
- [Source: src/features/feedback/quality-dashboard.ts]
- [Source: src/app/admin/quality/page.tsx]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Story creation loaded the current Epic 6 contract and launch prerequisites, PRD, architecture spine, community knowledge solution design, UX trust/privacy constraints, project context, Story 5.3, Story 6.1 and its evidence ledger, the existing quality dashboard/read model, web-search validation report, sprint status, and recent commits.
- The current operational ledger is deliberately fail-closed: all OP-01 through OP-09 are `blocked`, no accepted risks are recorded, and the final review must not reclassify repository-only checks as live operational proof.
- The final report output path is reserved for development. This create-story run creates only the Story 6.2 guide and synchronizes its sprint status.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Validated non-interactively against the create-story checklist. The guide has exact acceptance criteria, a complete evidence/disposition matrix, all eight prerequisite rows, explicit go/no-go rules, ownership boundaries, fail-closed safety and privacy rules, predecessor intelligence, and no-scope-creep guardrails.
- 2026-07-24: Completed the evidence-based readiness review. The final report contains a complete 34-row criterion registry and ledger, preserves the Story 6.1 blocked operational conclusion, and returns `no-go` because mandatory proof is missing and OP-07 is a safety blocker. No application code, tests, provider settings, or operational state changed.
- Verification: focused serial suites passed (21 + 42 + 92 + 79 + 10 + 10); full suite passed (50 files, 746 tests); lint had 0 errors and 3 pre-existing warnings; build and post-build typecheck passed. Initial typecheck overlapped the build and failed only on regenerated `.next/types`; the post-build rerun passed.
- 2026-07-24: Resolved the two actionable review-record findings only: removed the unsupported final aggregation timestamp and added per-row mutable external-evidence freshness handling. E7 issuance/review observation is unverifiable, no freshness window is approved, and the `no-go` decision is unchanged.
- 2026-07-24: Resolved only final Story 6.2 review findings: PR-07 is `complete` based on documented README DB-backed migration/integration sequencing; OP-01 through OP-09 are reproduced verbatim from the Story 6.1 ledger and remain `blocked`; repaired-finding citations now use stable headings. No operational evidence, code, tests, or provider state changed.

### File List

- _bmad-output/implementation-artifacts/6-2-run-public-mvp-ai-first-readiness-review.md
- _bmad-output/implementation-artifacts/6-2-public-mvp-ai-first-readiness-review-report.md
- _bmad-output/implementation-artifacts/sprint-status.yaml

### Change Log

- 2026-07-24: Created and self-validated the Story 6.2 public-MVP AI-first readiness-review guide; status is `ready-for-dev`.
- 2026-07-24: Created the final fail-closed readiness report, completed all Story 6.2 tasks, and marked the story ready for review. The report decision is `no-go`; no commit created.
- 2026-07-24: Corrected the two High review findings, persisted the review findings, and synchronized the story as `review`; the `no-go` decision remains unchanged.
- 2026-07-24: Resolved the final Story 6.2 review findings, retained the `no-go` decision, and synchronized the story as `review`; no commit created.
