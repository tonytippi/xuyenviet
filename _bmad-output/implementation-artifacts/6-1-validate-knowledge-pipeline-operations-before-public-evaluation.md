---
baseline_commit: dce526a
---

# Story 6.1: Validate Knowledge Pipeline Operations Before Public Evaluation

Status: review

## Story

As a product owner,
I want an operational validation of the AI-first knowledge pipeline,
so that public evaluation does not rely on untested workers, retention, removal, or recovery behavior.

## Acceptance Criteria

1. **Given** ingestion and indexing workers are deployed to their separately supervised runtime, **when** operational validation runs, **then** it verifies worker health/restart supervision, stage retry/recovery, index rebuild/disable behavior, role-gated operator access, audit integrity, environment separation, and PostgreSQL backup/restore evidence, **and** it records safe failures without raw source, provider payload, credential, or traveler-private leakage.
2. **Given** Facebook capture, retention, and removal capabilities are enabled, **when** the operational checklist is run, **then** it verifies operator-controlled capture boundaries, 180-day retention eligibility, retryable source withdrawal/removal, and dependent card/projection re-evaluation, **and** it proves raw captured material is never available through traveler retrieval or trust UI.
3. **Given** an operation is incomplete or fails its safety check, **when** the validation report is produced, **then** it identifies the owner, exact blocker, and safe remediation, **and** it does not mark the pipeline operationally ready.

## Tasks / Subtasks

- [ ] Create an owner-reviewed operational validation report and evidence ledger (AC: 1-3)
  - [x] Add the report in `_bmad-output/implementation-artifacts/` using safe identifiers, timestamps, environment name, check result, evidence location, owner, disposition (`complete`, `accepted_risk`, or `blocked`), exact blocker, and safe remediation for every check. An `accepted_risk` remains operationally not ready for Story 6.1 unless its named authority, scope, expiry/review date, and remediation are recorded; it cannot override a safety-blocking condition and must be handed to Story 6.2 for final go/no-go aggregation.
  - [x] Treat missing, unavailable, partial, stale, or unrepeatable proof as `blocked`; do not infer readiness from implementation tests, historical approval counts, dashboard/UI completion, or a healthy web container.
  - [x] Keep report samples and linked logs free of raw source/capture text, evidence quotes, URLs/snippets, provider payloads, credentials, traveler identities, chat/trip content, and browser-profile data.

- [ ] Validate the actual separately supervised canonical pipeline runtime (AC: 1, 3)
  - [ ] Record the deployed service/process identity, environment, revision, restart policy, log location, and health/restart evidence for the canonical source-version ingestion worker and the indexing worker. The app `/api/health` endpoint verifies only launch environment plus PostgreSQL connectivity; it is not worker health evidence.
  - [ ] Reconcile the deployment before declaring this check complete: `compose.yaml` currently starts legacy `scripts/knowledge-extraction-worker.ts`, while canonical AI-first work is in `scripts/knowledge-ingestion-worker.ts`; the latter currently processes one job then exits. Do not treat legacy extraction supervision as canonical ingestion supervision.
  - [ ] In a controlled non-production environment, terminate each canonical worker process and capture supervisor restart evidence without disclosing environment variables or task payloads. If the deployment cannot supervise the canonical ingestion worker continuously, record a blocking runtime gap with an owner and remediation rather than modifying deployment behavior under this validation story.
  - [ ] Exercise one synthetic, non-production, non-traveler fixture through retryable failure, expired-lease recovery, and stale-worker rejection. Use a non-production managed model/provider configuration or deterministic test adapter. Do not manually edit job stage, lease, fencing-token, card, evidence, source, or projection rows outside a supported fixture/entrypoint path; record the check as blocked if those prerequisites are unavailable. Confirm checkpointed completed stages are not replayed, exhausted jobs fail with safe code-level reasons, and stale fencing tokens cannot alter cards, evidence, or terminal publication.

- [ ] Validate indexing and traveler fail-closed behavior (AC: 1-3)
  - [ ] Use a controlled fixture to show an eligible current card is queued/projected by `(knowledge_card_id, content_version)` and that a rebuild is idempotent.
  - [ ] Withdraw or suppress the fixture source/card and prove the owning transaction disables its projection, creates the appropriate dirty work, and stale/outdated indexing cannot reactivate it.
  - [ ] Verify retrieval still rechecks current card, evidence, source, publication, knowledge, and verification eligibility. Demonstrate that a disabled, stale, withdrawn, suppressed, archived, superseded, conflicted, failed-verification, or source-missing candidate cannot enter a traveler source bundle or trust UI, and that raw source material, operator-only evidence, and private source fields never enter either surface. An otherwise eligible card backed by operator-only raw capture may appear only through its traveler-safe fact/evidence projection, never by exposing the backing capture.

- [ ] Validate protected operations, audit integrity, and environment separation (AC: 1, 3)
  - [ ] Prove anonymous and traveler sessions are denied at protected source-removal server action and admin-read entrypoints before any operation, and that each authorized entrypoint passes its authenticated actor to the domain operation; do not treat direct domain-service calls as session-authorization proof. For retention, prove the CLI/domain operation rejects a supplied actor unless it matches a persisted `admin` or `operator` user; it is not a session-authenticated server action. In both paths, prove only authorized roles can view resulting operations evidence.
  - [ ] Inspect representative pipeline, removal, retention, and indexing audit records. Verify actor attribution distinguishes `system-knowledge-pipeline` automation from immutable source submitter provenance and records concise meaningful transitions without raw material or provider output.
  - [ ] Obtain deployment evidence that development, staging, and production each use distinct PostgreSQL databases, OAuth clients, AI/search provider keys, and secret stores. Do not record values or secret-bearing URLs; record any environment intentionally excluded by an authoritative approved decision, otherwise block the check.
  - [ ] Obtain provider-specific backup schedule, retention, restore-authority, and controlled restore evidence for both the application PostgreSQL database and the separate `CAPTURE_CACHE_DATABASE_URL` PostgreSQL capture archive used for Facebook capture replay. The archive evidence must cover encrypted backups and a tested restore/replay. Repository code and unit/integration tests do not prove either restore readiness; absent proof blocks this check.
  - [ ] Obtain safe external evidence that each configured AI/search provider uses the approved data-processing/no-training settings and that the applicable public privacy notice is current. Record provider/configuration identifiers or attestation references only, never keys, payloads, or policy text; missing or unverifiable proof blocks this provider/privacy check.

- [ ] Validate Facebook capture, retention, and removal operations (AC: 2, 3)
  - [ ] Prove capture is an operator-controlled operations tool, not a traveler request path or unbounded crawl. An explicitly approved, operator-owned scheduled run may use its documented service audit actor and controlled browser-profile custody only when that actor is enforced as `admin` or `operator`; a matching user row alone is insufficient. Confirm stored capture metadata rejects cookies, tokens, passwords, local storage, full HTML, hidden data, browser profile material, provider payloads/responses/error bodies, credentials, and secrets; allow only schema-permitted bounded operational metadata such as capture method or a YouTube model identifier.
  - [ ] With a safe fixture, prove an interactive decline of visible-browser material creates no capture version or current-capture update. Prove an interactive confirmation, or an explicit `--yes` invocation under a documented scheduled service actor whose `admin`/`operator` authorization is enforced, appends the immutable version and selects it current. Prove a matching non-operator/admin actor is rejected before persistence. Record identifiers and statuses only, never captured text; block this check rather than modifying capture authorization under this validation story if enforcement is absent.
  - [ ] Run retention dry-run first with an authorized operator/admin actor. Verify 179-day material is not eligible, 180-day material is evaluated, and active/reviewable/in-flight dependencies block tombstoning. Use `--execute` only in an approved controlled environment after application-database and capture-archive backup/restore evidence is recorded.
  - [ ] For an eligible non-production fixture, prove tombstoning removes raw payload/file/metadata fields, preserves only concise audit data, clears the current-capture pointer when applicable, and remains idempotent.
  - [ ] Run retryable source withdrawal/removal. Verify dependent evidence becomes removed and traveler-invisible; affected cards are re-evaluated from remaining independent evidence, downgraded or suppressed when support is insufficient, projections are disabled, index work is queued, and repeated removal is safe.
  - [ ] Prove traveler retrieval and persisted trust/provenance rendering cannot expose raw captured text, copied post body, image/OCR note, provider payload, hidden link/quote, or operator-only evidence before and after removal/retention.

- [x] Record validation disposition and handoff evidence (AC: 1-3)
  - [x] Link only safe report artifacts and command outputs. Separate repository regression proof from deployment, provider, privacy, and restore evidence.
  - [x] Leave the pipeline operationally `not ready` if any mandatory check lacks complete evidence. Do not start Story 6.2 or claim public-MVP go/no-go; Story 6.2 combines this evidence with corpus, quality, retrieval, provider-readiness, and launch-prerequisite dispositions.

### Review Findings

- [x] [Review][Patch] Complete the required owner review before representing the validation ledger task as complete [_bmad-output/implementation-artifacts/6-1-validate-knowledge-pipeline-operations-before-public-evaluation.md:23] — the completed task requires an owner-reviewed operational validation report, but the committed report explicitly states `Owner review: pending`. Record the designated owner review or leave the task incomplete; do not use this ledger as a completed operational-validation artifact until then.
- [x] [Review][Patch] Mark unavailable operational validations incomplete [_bmad-output/implementation-artifacts/6-1-validate-knowledge-pipeline-operations-before-public-evaluation.md:28] — AC 1-2 validation subtasks are unchecked because OP-01 through OP-09 lack the required controlled/deployed proof; repository-regression evidence remains recorded as complete.
- [x] [Review][Patch] Assign accountable owners to blocked evidence rows [_bmad-output/implementation-artifacts/6-1-knowledge-pipeline-operational-validation-report.md:18] — AC 3 handoff assigns each blocked row to a named accountable individual without recording an approval.

## Dev Notes

### Scope And Business Context

- This is an operations validation and evidence story, not a technical hardening bucket or a new product feature. Create only the validation report/evidence artifacts, narrowly scoped test support if genuinely required to exercise an acceptance criterion, and safe operational documentation needed to record the results.
- Do not implement new workers, deployment architecture, health endpoints, capture flows, retrieval behavior, provider integrations, UI features, backup systems, or public launch behavior merely to turn a failed check green. Record owner, blocker, and safe remediation; route implementation through a separately planned story or accepted-risk decision.
- Epic 5.3 already closes the active-evidence corpus and answer-quality readiness gate. It does not prove worker supervision, canonical ingestion deployment, backup/restore, raw-capture retention, or source-removal operations. Reuse its current read-only readiness evidence; do not duplicate or mutate it.
- The stale `_bmad-output/implementation-artifacts/epic-6-context.md` describes a previous family-planning Epic 6 and conflicts with the current Epic 6 definition. It is not authoritative for this work. Use current `epics.md` and `sprint-status.yaml`; do not implement family-context behavior.

### Operational Evidence Contract

Each report row must include: check ID, scope/environment, UTC timestamp, safe evidence reference, observed result, owner, disposition, exact blocker when incomplete, and safe remediation. Use the following matrix:

| Check | Required proof | Owner/disposition rule |
| --- | --- | --- |
| Canonical runtime | Supervisor/process identity, restart exercise, safe logs, deployment revision | Block if only legacy extraction is supervised or canonical ingestion is not continuous/supervised. |
| Ingestion recovery | Retry, expired lease, checkpoint preservation, stale-fence rejection | Block if a stale worker can commit or a completed stage replays. |
| Index safety | Idempotent rebuild, immediate disable, stale-work resistance, retrieval recheck | Block if an ineligible projection can reach a traveler bundle. |
| Access/audit | Server-side role denial and correct service/submitting actor attribution | Block if an unauthorized actor can read/mutate operations data or audit leaks raw content. |
| Environment/restore | Separate dev/staging/production controls plus provider-tested restore evidence for the application PostgreSQL database and capture archive | Block until the named owner recorded for this evidence row supplies current proof; assign that owner before the row can be anything other than `blocked`. |
| Provider/privacy | Approved provider data-processing/no-training configuration and current public privacy-notice evidence | Block until safe, current external proof is linked for every configured provider. |
| Capture boundary | Operator-controlled visible capture, enforced scheduled-actor role, confirmation boundary, and metadata rejection | Block for any persisted credential/profile/hidden/HTML/provider material, traveler-path capture, or `--yes` persistence by a non-operator/admin actor. |
| Retention/removal | 180-day dry run, dependency blockers, tombstone, idempotent withdrawal/re-evaluation | Block if raw material survives required removal or an unsafe card/projection remains eligible. |
| Traveler non-exposure | Retrieval/source-bundle/trust-UI proof for raw/operator-only material exclusion | Block on any raw/private/provider/traveler data exposure. |

### Existing Implementation To Exercise

- Canonical source-version pipeline: `src/features/knowledge/ingestion-jobs.ts`, `src/features/knowledge/ingestion-pipeline.ts`, and `src/features/knowledge/ingestion-worker.ts`. Claims use `FOR UPDATE SKIP LOCKED`, leased fencing tokens, expected stage/version compare-and-swap, safe checkpoints, retry backoff, and safe terminal failure codes. Do not weaken these fences for test convenience.
- `scripts/knowledge-ingestion-worker.ts` runs one claimed job and exits. The compose service instead runs `scripts/knowledge-extraction-worker.ts`, a legacy long-running extraction worker. This is a known validation risk, not evidence that the canonical runtime is ready.
- Indexing: `src/features/knowledge/indexing-worker.ts` claims dirty markers with fencing, retries failures, runs idempotent projection work, and disables ineligible documents during backfill. `src/features/knowledge/source-removal.ts` disables stale projections and queues index work in the source-removal transaction.
- Retention/capture: `src/features/knowledge/source-captures.ts` owns allowlisted capture metadata, 180-day candidate selection, dependency blockers, dry-run/execute behavior, tombstoning, and retention audit records. `scripts/knowledge-source-retention.ts` requires exactly one of `--dry-run` or `--execute` plus an authorized actor.
- Removal: `src/features/knowledge/source-removal.ts#removeKnowledgeSource()` acquires source/card locks, removes evidence, re-evaluates support, updates card revisions/states, disables projections, tombstones source material, and writes concise audits. It must remain idempotent.
- Authorization: `src/server/auth.ts#requireAdminSession()` permits only `admin` and `operator`; protected feature entrypoints must preserve server-side authorization before reads or mutations.
- Traveler safety: `src/features/retrieval/source-bundle.ts`, stored provenance, and traveler trust UI must use safe projections only. Never inspect source safety by parsing answer prose, and never use a stale search document as eligibility authority.

### Architecture And Privacy Guardrails

- Preserve the Next.js modular monolith, PostgreSQL/Drizzle ownership, strict TypeScript, `server-only` boundaries, feature ownership, and server-side role enforcement. Do not add a service, external monitoring stack, test framework, or dependency without a separately approved requirement.
- PostgreSQL is the source of truth; search documents are rebuildable projections. Publication/evidence/state mutations, concise audits, dirty markers, and immediate disablement must remain atomic. Retrieval rechecks current owner rows to fail closed on index lag.
- Raw capture data is operator-only. No report, test fixture output, dashboard, source bundle, provenance snapshot, traveler trust detail, audit summary, worker log, or error may include raw capture text, evidence quote/span, copied-post content, image/OCR notes, provider payloads/responses/error bodies, credentials, cookies, tokens, local storage, full HTML, hidden data, browser profiles, traveler context, or answer text. Schema-permitted bounded operational metadata is not a provider payload and must not contain unsafe values.
- The trusted public-launch checks require distinct development/staging/production databases, OAuth clients, provider keys, and secret stores; real non-placeholder launch configuration; confirmed provider data-processing/no-training settings; current public privacy-notice evidence; and tested backup/restore for both the application PostgreSQL database and capture archive. These must be evidenced externally and not fabricated from source code.

### Previous Story Intelligence

- Story 5.1 established six versioned AI-first evaluation scenarios and persisted answer-time policy snapshots. Story 5.2 made safe, bounded operator policy diagnostics. Story 5.3 combined current active-evidence corridor coverage with sampling and evaluation gates. Reuse those persisted, safe contracts; do not recompute historical policy from mutable cards or answer prose.
- Story 5.3 explicitly reserves Epic 6 for operational, provider/privacy, worker, retention/removal, and accepted-risk proof. Its safety standard is fail closed: missing, pending, stale, partial, or unprovable evidence blocks readiness.
- DB-backed tests are serial. Use `DATABASE_URL_TEST`, run one Vitest command at a time, and never use `pnpm db:reset` for validation. Keep repository test evidence separate from actual deployment evidence.

### Testing Requirements

- Run the following focused database-backed regression suites sequentially against `DATABASE_URL_TEST` as mandatory repository-behavior evidence, even when this story changes no code or test support. Do not run them in parallel:
  - `pnpm test:run tests/knowledge-ingestion-jobs.test.ts`
  - `pnpm test:run tests/knowledge-ingestion-pipeline.test.ts`
  - `pnpm test:run tests/knowledge-indexing-worker.test.ts`
  - `pnpm test:run tests/knowledge-source-removal.test.ts`
  - `pnpm test:run tests/knowledge-source-capture-retention.test.ts`
  - `pnpm test:run tests/knowledge-search.test.ts`
  - `pnpm test:run tests/answer-context.test.ts`
  - [x] Add or run a focused server-entrypoint regression for `removeKnowledgeSourceForm()` proving anonymous and traveler sessions fail before mutation, and proving the authorized session actor is forwarded to removal.
  - [x] Run the traveler trust/provenance rendering regression in `tests/ai-ask-shell.test.ts` to prove removed, raw, and operator-only Facebook capture material is not exposed by the persisted trust surface.
  - [x] Add or run a focused `scripts/facebook-capture.ts` regression proving `--yes` rejects a matching non-operator/admin actor and permits only the enforced authorized scheduled service actor; if current behavior lacks this enforcement, record the capture-boundary check as blocked rather than changing it in this story.
- If any implementation support is changed, finish with `pnpm lint`, `pnpm typecheck`, and `pnpm build`. Record exact command, result, existing warnings, and blockers in the validation report and Dev Agent Record.
- Tests can demonstrate repository behavior but cannot certify real supervisor restart behavior, environment separation, live provider settings, or PostgreSQL backup/restore. These require named operational evidence from the owner recorded for the applicable evidence row.

### Latest Technical Information

- No web research, dependency update, library upgrade, or provider change is required to create this operational validation evidence. Use the repository-pinned stack and existing service contracts.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 6 and Story 6.1]
- [Source: _bmad-output/planning-artifacts/epics.md#Launch Readiness Prerequisites]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#8.4 Knowledge Collection]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#10.3 Community Knowledge Publication And Conflict Contract]
- [Source: _bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md#14 Risks]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-4, AD-6, AD-7A, AD-14, AD-15, AD-17, AD-25, AD-26, AD-28]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Transaction And Indexing Rules]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md#Retention And Removal]
- [Source: _bmad-output/project-context.md]
- [Source: _bmad-output/implementation-artifacts/5-1-evaluate-ai-first-community-knowledge-safety.md]
- [Source: _bmad-output/implementation-artifacts/5-2-surface-ai-first-policy-quality-signals.md]
- [Source: _bmad-output/implementation-artifacts/5-3-close-the-active-evidence-grounded-card-readiness-gate.md]
- [Source: README.md#Testing, Server deployment, Public launch safety]
- [Source: compose.yaml]
- [Source: src/app/api/health/route.ts]
- [Source: src/features/knowledge/ingestion-jobs.ts]
- [Source: src/features/knowledge/ingestion-pipeline.ts]
- [Source: src/features/knowledge/indexing-worker.ts]
- [Source: src/features/knowledge/source-captures.ts]
- [Source: src/features/knowledge/source-removal.ts]
- [Source: src/features/retrieval/source-bundle.ts]
- [Source: src/server/auth.ts]
- [Source: tests/knowledge-ingestion-jobs.test.ts]
- [Source: tests/knowledge-ingestion-pipeline.test.ts]
- [Source: tests/knowledge-indexing-worker.test.ts]
- [Source: tests/knowledge-source-removal.test.ts]
- [Source: tests/knowledge-source-capture-retention.test.ts]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra-review

### Debug Log References

- Story creation loaded the current Epic 6 contract, launch prerequisites, PRD, architecture spine, community knowledge solution design, UX trust/privacy contract, project context, Stories 5.1-5.3, sprint status, deployment runbook/compose configuration, operational code paths, focused regression locations, and recent relevant commits.
- The current `epic-6-context.md` is stale and describes a former family-planning epic; it conflicts with the authoritative current `epics.md` and sprint inventory, so it is explicitly excluded from implementation scope.
- Current deployment configuration supervises legacy extraction and indexing workers, while canonical source-version ingestion is a one-job script not represented in compose. The developer must record this as a blocker unless actual deployment evidence resolves it; no readiness claim may conflate the two worker paths.
- 2026-07-24: Reconciled `compose.yaml`, `README.md`, and the capture operations runbook. Confirmed canonical ingestion is not continuously supervised in the documented Compose deployment; recorded as OP-01 `blocked` rather than changing deployment behavior.
- 2026-07-24: Inspected `scripts/facebook-capture.ts`; `--yes` resolves a matching user ID/email but does not enforce persisted `admin` or `operator` authorization. Recorded OP-07 `blocked` rather than hardening capture authorization in this validation story.
- 2026-07-24: Added and passed `tests/knowledge-source-removal-action.test.ts`, which proves anonymous/traveler denial before removal and authenticated operator actor forwarding.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Validated non-interactively against the create-story checklist. The story has explicit acceptance criteria, safe evidence/disposition requirements, ownership boundaries, current runtime/code targets, fail-closed operations rules, privacy constraints, predecessor intelligence, focused serial verification, and a strict no-false-ready conclusion.
- 2026-07-24: Revalidated and repaired this target-only guide through the full create-story validation workflow. Definitive planning and code/runbook audits passed after clarifying traveler-safe raw-backed cards, capture confirmation and scheduled-role enforcement, authorization boundaries, mandatory regression evidence, provider/privacy proof, environment separation, and application/capture-archive recovery evidence.
- 2026-07-24: Created the safe Story 6.1 operational evidence ledger with nine checks. All unavailable deployment, recovery, provider/privacy, and controlled-fixture proof is `blocked`; overall pipeline status is operationally not ready and is handed to Story 6.2 without a go/no-go claim.
- 2026-07-24: Repository regressions passed sequentially: ingestion jobs (14), ingestion pipeline (37), indexing worker (5), source removal (5), capture retention (7), knowledge search (42), answer context (92), removal entrypoint (2), AI Ask shell (79), and Facebook capture script (3). Full suite passed: 50 files, 746 tests.
- 2026-07-24: `pnpm lint` passed with three existing unused-variable warnings in `tests/knowledge-search.test.ts`; sequential `pnpm typecheck` and `pnpm build` passed. An initial typecheck run overlapped with build regeneration of `.next/types` and failed only on transient missing generated files; the post-build sequential rerun passed.
- 2026-07-24: Corrected the owner-review task state after review: the report remains `Owner review: pending`, so the owner-reviewed validation task remains incomplete. No owner approval was recorded or inferred.
- 2026-07-24: Corrected the two actionable review findings: unchecked OP-01 through OP-09 operational exercises pending their required controlled/deployed proof and assigned each blocked ledger row to a named accountable individual. Repository regressions remain recorded as completed; no controlled/deployed evidence or owner approval was recorded or inferred.

### File List

- _bmad-output/implementation-artifacts/6-1-validate-knowledge-pipeline-operations-before-public-evaluation.md
- _bmad-output/implementation-artifacts/6-1-knowledge-pipeline-operational-validation-report.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- tests/knowledge-source-removal-action.test.ts

### Change Log

- 2026-07-24: Created and self-validated the Story 6.1 operational-validation guide; status is `ready-for-dev`.
- 2026-07-24: Final validation passed; status remains `ready-for-dev`.
- 2026-07-24: Completed fail-closed operational validation evidence, added protected removal entrypoint regression, and moved Story 6.1 to `review`; pipeline remains operationally `not ready` pending named external evidence and capture-role hardening.
- 2026-07-24: Corrected the owner-reviewed validation task to incomplete because owner review remains pending; Story 6.1 remains in `review` for the outstanding review-state work.
- 2026-07-24: Corrected blocked operational task states and named the accountable owner for each OP-01 through OP-09 ledger blocker; Story 6.1 remains in `review`.
