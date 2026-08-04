---
baseline_commit: c3949a251bbf8c84a838b644169e73b698a7b18d
---

# Story 15.6: Deliver Target-Shaped Operator Knowledge Views

Status: ready-for-dev

## Story

As an operator, I want clear Knowledge API responses and admin screens, so that I can diagnose ingestion and resolve work without conflating technical processing with fact workflow.

## Acceptance Criteria

1. Authorized `/v1/admin/knowledge/*` reads serialize these independent concepts: technical job status/counters, candidate processing/disposition/reason, card lifecycle/classification/verification requirement, and work type/status/resolution. Endpoint-specific positive allowlists may expose already-authorized bounded operator evidence quote/span only; no response exposes raw capture content, provider output, unapproved quotes, checkpoints, fence or lease values, credentials, or execution secrets.
2. `apps/admin` uses documented direct NestJS APIs with the existing browser credentials, API-owned CSRF, request-ID, authorization, and safe-error behavior. It imports neither database/lifecycle/Worker code nor a BFF, server proxy, or server-action writer.
3. A mixed-result job displays only technical status plus safe aggregate/candidate outcomes, never a rolled-up publication label. Each immutable candidate AI disposition/reason remains intelligible after later card lifecycle or operator-work resolution.

## Tasks / Subtasks

- [ ] Start from the completed target-only 15.1-15.5 baseline. Retain the clean break: no legacy stage/status aliases, compatibility response parsing, dual reads, legacy fixtures, or translation from draft/approved queue states. (AC: 1-3)
- [ ] Inventory every existing `/v1/admin/knowledge/*` read before changing it: drafts/approved/recommendations, intake, coverage/sampling, Facebook capture queue/detail, and YouTube capture queue/detail. For each, define its target safe DTO, explicit field allowlist, capability/role guard, parser, database projection, controller serializer, and consuming admin screen. (AC: 1)
  - [ ] Keep these concepts structurally independent in every relevant DTO and UI: job `status` plus the four counters; candidate `processingStatus`, immutable `aiDisposition`, and `outcomeReasonCode`; card `lifecycleState`, `knowledgeState`, and `verificationRequirement`; recommendation `workType`, `status`, and `resolution`; immutable sampling obligations separately from actionable sampling work.
  - [ ] A job is only `queued | running | completed | failed`; a completed job with mixed outcomes may present safe aggregates such as applied/needs-operator counts, but must never become `published`, `suppressed`, `verify_first`, or another business outcome.
  - [ ] Preserve a completed candidate's immutable AI decision after the operator changes card/work state. Failed, queued, and processing candidates have no business disposition/reason.
- [ ] Update each selected endpoint atomically across `packages/database` safe projection, `packages/domain` port, `packages/contracts` DTO and exact-key parser, Nest controller parser/serializer, and `apps/admin` consumer. Contract parsers must fail closed for unexpected nested keys; do not add fallback shapes. (AC: 1-3)
  - [ ] Complete existing parser validation gaps, including the approved-card index projection and recommendation card subshape. Replace `unknown` read-port results with named target DTOs where the current port prevents end-to-end strict typing.
  - [ ] Retire the current legacy capture/intake/review representations rather than relabeling them: `ingestionJob.stage`, Facebook synthetic `published`/`suppressed` queue statuses, capture `reviewStatus`/`operationState`, and overloaded intake batch states such as `extracted`, `needs_review`, and `approved`.
  - [ ] Keep index/projection state technical if needed; it cannot stand in for card lifecycle or work state. Do not expose action fences in read DTOs.
- [ ] Make every database/admin read projection a positive disclosure allowlist. Preserve existing bounded evidence-detail seams only where the endpoint is explicitly authorized, and cap items/strings using established conventions. (AC: 1)
  - [ ] Always exclude raw capture text/metadata, transcripts, raw provider response/payload, prompts/prompt versions, checkpoints, leases, fencing/CAS values, stack/raw upstream errors, credentials/cookies/tokens, execution secrets, and unredacted sensitive URL components.
  - [ ] Preserve the recommendation-detail bounded evidence contract (at most four bounded records) and the YouTube detail bounded structured-evidence contract only after validating each field. Do not turn either into a raw-source view.
  - [ ] Apply the established YouTube safe-URL redaction policy to Facebook URLs. Do not expose source-derived `authorText`, `groupName`, or similar raw metadata without an explicit documented endpoint allowlist and bounded operational need; exclude `promptVersion` and provider-execution detail from YouTube views.
  - [ ] Keep coverage aggregate-only: do not disclose sampling cohort membership, source-level raw data, candidate IDs, or fences merely to make a dashboard more detailed.
- [ ] Correct capture/read projections and UI information architecture to express the AI-first lifecycle, not an approval queue. (AC: 1, 3)
  - [ ] Facebook filtering, counts, and pagination must be computed against the selected target-safe query/projection, not after page retrieval. A completed technical job must not derive a publication label.
  - [ ] Capture detail may show the technical job, safe candidate processing/disposition/reason, associated card lifecycle/classification/verification, and related work state separately. It must not expose checkpoint internals or raw capture material.
  - [ ] Replace legacy primary UI framing such as AI drafts versus approved library with explicit card lifecycle and current work. Clearly distinguish technical processing, AI candidate decision, card workflow, actionable operator work, and quality sampling. A low-risk active card is not awaiting approval; sampling neither approves nor re-approves it.
  - [ ] Use Vietnamese-first accessible copy, visible text labels, readable status descriptions, and non-color-only distinctions. Do not alter the established desktop-optimized admin visual language without a UX need.
- [ ] Preserve direct API ownership in all admin clients. Retain `NEXT_PUBLIC_API_ORIGIN`, `credentials: "include"`, generated `x-request-id`, API CSRF acquisition before mutations, `401` sign-in handling, parser-before-state assignment, and safe Vietnamese errors. Do not introduce a shared client refactor unless necessary to keep this behavior correct. (AC: 2)
- [ ] Add focused tests at every boundary. Unit parser/static-boundary tests must not need a database; PostgreSQL projection/controller tests remain serial and locally call `resetTestDatabase()` when clean tables are needed. (AC: 1-3)
  - [ ] Prove every target response accepts only its exact allowlist and rejects legacy fields, raw source/provider fields, checkpoints, fence/lease values, credentials/secrets, unknown nested keys, and unredacted sensitive URLs.
  - [ ] Prove anonymous/traveler access is denied; authorized browser-session access preserves existing capability, CSRF, safe-error, and parser-gate behavior; an unsafe adapter projection fails closed rather than serializing.
  - [ ] Prove a mixed-result completed job reports technical counters/outcomes without a publication result, and a later operator resolution never changes candidate disposition/reason.
  - [ ] Prove card lifecycle/classification/verification, work type/status/resolution, sampling obligation, and sampling recommendation/outcome remain distinct. Unresolved sampling cannot make an eligible active card appear blocked.
  - [ ] Add/extend a static admin boundary test proving `apps/admin/app/knowledge/**` has no database, lifecycle command, Worker, BFF/proxy, or server-action imports and retains direct API/contract-parser use.

## Dev Notes

### AI-First Contract

- The target invariant is: a job reports technical execution only; a candidate preserves its immutable AI decision; a card has one workflow lifecycle; a recommendation is actionable operator work; a sampling obligation is an immutable quality ledger. Do not merge these into a universal status or approval queue.
- `needs_operator` means the AI opened primary work. It does not mean a candidate waits for a generic approval, and later publication/suppression must not rewrite it. `apply`, `needs_operator`, and `discard` are not retrieval or job labels.
- Sampling is quality control, not a publication gate. Its immutable obligation, selected sampling recommendation, terminal quality outcome, and high-severity containment must remain separately observable. An active card may have sampling work but no open primary work.
- `transitionKnowledgeCard` remains the sole production lifecycle/recommendation/audit/index writer. This read-model story must not bypass it or add a new writer. The Worker alone claims/runs continuous ingestion, indexing, and sampling selection; API commands may only synchronously resolve authorized operator decisions.

### Required Existing Seams

- Contracts and exact-key response parsers: `packages/contracts/src/index.ts`.
- Review/work projections: `packages/database/src/admin-knowledge-review.ts`, `packages/database/src/knowledge-recommendations.ts`, and `packages/domain/src/knowledge-review.ts`.
- Intake/coverage projections: `packages/database/src/admin-knowledge-intake.ts`, `admin-knowledge-coverage.ts`, and corresponding `packages/domain/src/admin-knowledge-*.ts` ports.
- Capture projections: `packages/database/src/admin-facebook-capture.ts`, `admin-youtube-capture.ts`, and corresponding domain ports. The YouTube projection is the existing safe URL/redaction and bounded-evidence reference; do not duplicate a weaker policy for Facebook.
- Direct Nest controllers: `apps/api/src/admin/admin-knowledge-review.controller.ts`, `admin-knowledge-intake.controller.ts`, `admin-knowledge-coverage.controller.ts`, `admin-facebook-captures.controller.ts`, and `admin-youtube-captures.controller.ts`. Keep their existing browser-session/capability guards and response parser gates.
- Admin clients: `apps/admin/app/knowledge/review-client.tsx`, `progress-client.tsx`, `intake/knowledge-intake.tsx`, `facebook-captures/{queue.tsx,[reviewId]/detail.tsx}`, and `youtube-captures/{queue.tsx,[sourceId]/detail.tsx}`. Current `.stage` reads are target-invalid; use the target job `status` and typed parsed DTOs instead of `any`.

### Boundaries And Safety

- Preserve direct Nest browser transport. There is no BFF adapter, browser credential, Next route handler, server action, or database owner to add in this story.
- Do not expose raw capture/provider material merely because this is an operator surface. Bounded evidence quote/span remains operator-only and endpoint-specific; normal read/list responses are safe projections, not diagnostic dumps.
- Preserve source/evidence trust policy, current evidence eligibility, actor attribution, source-removal behavior, and lifecycle transition matrix. This story changes target-shaped operator reads and presentation, not extraction, retrieval policy, jobs, schema, migrations, or Worker loops.
- Keep `apps/admin` presentation-only. It has no imports from `@xuyenviet/database`, `transitionKnowledgeCard`, worker-domain, BFF routes, or server action modules.

### Testing Requirements

- Use `pnpm test:unit` only for infrastructure-free parser/import-boundary tests. Use `pnpm test:integration` for PostgreSQL projections/controllers; integration is serial and clean-table suites call `resetTestDatabase()` locally.
- Extend existing coverage first: `tests/admin-facebook-capture-contract.test.ts`, `tests/admin-youtube-capture-contract.test.ts`, `tests/youtube-capture-review-admin.test.ts`, `tests/admin-knowledge-coverage.test.ts`, `tests/knowledge-recommendation-queue.test.ts`, and capture/ingestion tests whose old fixtures encode legacy queue vocabulary.
- Add narrowly scoped tests if the existing suites cannot cover all read surfaces: review contract/controller serialization, target intake contract, Facebook target read projection/filtering, and the static admin UI boundary. Do not add browser E2E infrastructure for this story.

### Verification

```bash
pnpm test:unit -- tests/contracts-browser-compatibility.test.ts
pnpm test:unit -- tests/admin-knowledge-views-ui-boundary.test.ts # create if needed
pnpm test:integration -- tests/admin-knowledge-coverage.test.ts
pnpm test:integration -- tests/admin-facebook-capture-contract.test.ts
pnpm test:integration -- tests/youtube-capture-review-admin.test.ts
pnpm test:integration -- tests/knowledge-recommendation-queue.test.ts
pnpm typecheck
pnpm --filter @xuyenviet/admin typecheck
pnpm lint
pnpm build
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 15.6]
- [Source: _bmad-output/implementation-artifacts/epic-15-context.md#Requirements & Constraints]
- [Source: _bmad-output/implementation-artifacts/15-2-complete-candidate-processing-and-technical-job-accounting.md#Mandatory Invariants]
- [Source: _bmad-output/implementation-artifacts/15-4-enforce-evidence-safe-retrieval-and-source-removal.md#Completed-Story Intelligence]
- [Source: _bmad-output/implementation-artifacts/15-5-separate-actionable-work-from-quality-sampling.md#Dev Notes]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Architecture Alignment]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Ingestion Jobs Technical Execution Only]
- [Source: docs/proposals/knowledge-lifecycle-normalization.md#Phase 3 Read Models and Direct API UI]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-25 One Source-Version Ingestion Job Orchestrates AI Stages]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md#AD-26 Publication Mutations Use Transactional Dirty Markers]
- [Source: _bmad-output/project-context.md#Testing Rules]

## Dev Agent Record

### Agent Model Used

gpt-5.6-terra

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- 2026-08-04: Created after Stories 15.1-15.5 completed the target-only schema, immutable AI-first candidate processing, sole lifecycle writer, evidence-safe retrieval/source removal, and separated sampling ledger. The implementation must present these as separate operator concepts and must not restore the historical approval-queue model.
- 2026-08-04: The guide requires strict, positive read-model allowlists across database projection, contracts, Nest serialization, and direct admin UI. It identifies current `stage`/rolled-up capture labels and unsafe raw/execution disclosure as target-invalid behavior to remove rather than support.

### File List

- _bmad-output/implementation-artifacts/15-6-deliver-target-shaped-operator-knowledge-views.md
