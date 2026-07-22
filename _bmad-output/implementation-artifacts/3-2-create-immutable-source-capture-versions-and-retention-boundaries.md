---
title: "Story 3.2: Create Immutable Source Capture Versions and Retention Boundaries"
type: feature
created: "2026-07-21"
status: ready-for-dev
epic: 3
story: 3.2
baseline_revision: d4fed2d
baseline_commit: d4fed2d469af33b8481f904a4555eaa8ab2bd8e1
context:
  - "{project-root}/_bmad-output/project-context.md"
  - "{project-root}/_bmad-output/implementation-artifacts/epic-3-context.md"
  - "{project-root}/_bmad-output/planning-artifacts/epics.md"
  - "{project-root}/_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md"
warnings:
  - "Do not make a capture version, legacy card, or search document traveler-eligible. Story 3.3 alone introduces bounded evidence and may relax the Story 3.1 fail-closed predicate."
  - "Do not implement the durable source-version pipeline, leasing, fencing, or retries from Stories 3.4 to 3.6. This story creates the immutable input and compatibility boundary only."
  - "The historical completed chat/trips Story 3.2 is unrelated. Use this filename and title, not numeric-only artifact discovery."
---

# Story 3.2: Create Immutable Source Capture Versions and Retention Boundaries

Status: done

## Story

As an operator,
I want each source capture to be immutable and versioned,
so that AI decisions and evidence always point to exactly what was captured.

## Acceptance Criteria

1. **Immutable readable captures**
   - Given an operator submits or recaptures source material,
   - When readable material is stored,
   - Then the system appends an immutable source capture version with a content hash and safe capture metadata,
   - And the legacy ingestion compatibility path references that exact version rather than mutable raw text, while Story 3.3 creates evidence records that reference the capture-version target.

2. **Confirmed Facebook capture**
   - Given a Facebook capture is performed through the existing operator-controlled browser tool,
   - When the operator confirms its preview,
   - Then the tool appends an operator-only immutable capture version and selects it as current,
   - And it never persists browser credentials, cookies, tokens, local storage, full HTML, hidden data, or browser-profile material.

3. **Safe retention**
   - Given Facebook captures or dependent inactive operational artifacts no longer support an active or reviewable card,
   - When their retention period reaches 180 days,
   - Then they become eligible for deletion by a safe retention command,
   - And concise required audit data remains without retaining raw content.

## Scope And Decisions

### Required model

- Keep `sources` as the durable source identity.
- Add a production, Drizzle-owned immutable capture-version record. Do not reuse the separate capture-cache database as product provenance.
- A capture version belongs to one source and contains the readable raw payload or its owned file reference, SHA-256 content hash, typed safe capture metadata, capture timestamp, creation timestamp, and nullable `payloadDeletedAt` tombstone timestamp.
- Add `sources.currentCaptureVersionId` as the single deterministic current-version pointer. The pointer is updated atomically with insertion of a newly confirmed readable version.
- Capture versions are append-only at the application boundary. Existing and new writer paths must not update their raw payload, hash, safe metadata, or capture time. A retention command may delete an eligible artifact's raw content/record, but it must retain a concise audit event.
- Hash normalized stored readable text using lowercase hexadecimal SHA-256. The hash is an integrity/provenance value, not a public identifier. Hash the exact normalized text that is persisted, not unsanitized input or metadata.
- Text normalization before persistence and hashing is: normalize Unicode to NFC, convert CRLF/CR to LF, preserve all remaining whitespace, then trim leading and trailing whitespace. The persisted text is the normalized text.
- Apply payload limits by capture kind: 20,000 characters for submitted text and Facebook operator capture; retain the existing 120,000-character ceiling for YouTube/structured evidence until a later source-version policy changes it. A migrated legacy payload is never silently truncated: preserve it when it fits its applicable ceiling, otherwise retain it through an existing owned file reference or mark/report it as not migrated and block its source from current-version selection.
- Use discriminated metadata schemas with explicit key/value bounds: generic submitted text/file metadata, Facebook operator capture metadata, and YouTube capture metadata. Reject unknown keys for new writes. Legacy metadata is mapped only when recognized and safe; otherwise omit it from the version and record only a concise migration reason.
- A repeated confirmation with the same content still appends a distinct capture version when it represents a confirmed recapture. Do not deduplicate away operator capture history. Use a source-local version sequence/unique constraint to make the append order explicit.
- Retain `raw_source_material` only as a migration/compatibility boundary while consumers move to capture versions. It must not remain a competing current raw-text source of truth. Migrate every readable legacy material row into initial immutable capture versions and set the corresponding current pointer before changing consumers.
- Add nullable capture-version foreign keys to legacy Facebook review and extraction-job records now, backfill them, and update their read/write paths to use the exact version. Story 3.4 owns the replacement one-job-per-version state machine and its uniqueness/claiming behavior; do not build it here.
- Story 3.3 owns `knowledge_card_evidence`. This story must provide the capture-version target it will reference, but must not create evidence or make cards eligible.

### Retention policy for this story

- The ordinary 180-day clock starts at the capture version's `capturedAt`; if unavailable for a migrated legacy row, use its persisted `createdAt`.
- Provide a server-only, explicit operational retention command, not a traveler request-path action. It may be exposed through a script; it must support a dry-run path and an idempotent execution path.
- A candidate is eligible only if it is Facebook/operator-only capture material, is at least 180 days old, and the command can prove it has no active card, no reviewable card (`ai_recommended` or `in_review`), no actionable Facebook review, and no active/running legacy extraction job. Unknown or unbackfilled dependencies are a retention blocker.
- Retention tombstones an eligible version; it clears the raw payload, file storage reference, and raw metadata but preserves the version ID, source ID, version sequence, hash, capture/creation timestamps, and `payloadDeletedAt`. It does not delete the version row, source, card, evidence, job, review, or search projection.
- Every version FK uses restrictive identity preservation. A version's tombstone keeps review/job provenance valid. If the tombstoned version is `sources.currentCaptureVersionId`, clear the pointer atomically while holding the source/version lock; do not repoint it to an older version. A non-current version leaves the pointer unchanged.
- Retention must fail closed: do not tombstone when dependency eligibility cannot be proven. Retention must not delete a source, card, evidence, or search projection.
- Story 3.10 owns source withdrawal/removal state. Until that state exists, the ordinary retention command must treat removal status as unknown and block any candidate with linked card/review/job records it cannot prove inactive; it must not claim to detect withdrawn, inaccessible, or removal-requested sources.
- The retention command requires a pre-existing authenticated operator/service actor supplied by ID and email. The audit may record source ID, capture-version ID, reason, age/retention basis, actor/operations identity, timestamp, and aggregate count. It must not include raw text, a quote/span, metadata values, browser/session data, provider payloads, or secrets.

### Migration and referential-integrity order

1. Generate the next migration from the current Drizzle journal; do not hard-code the numeric filename. Add reviewed manual SQL to the generated migration for this data conversion.
2. Create `source_capture_versions` with nullable legacy-compatible payload fields, `source_id`, `version_sequence`, hash, metadata, timestamps, tombstone fields, `UNIQUE(id, source_id)`, and `UNIQUE(source_id, version_sequence)`.
3. Add nullable `sources.current_capture_version_id`, `facebook_capture_reviews.capture_version_id`, and `knowledge_extraction_jobs.capture_version_id` columns and indexes.
4. Add composite same-source FKs: `(current_capture_version_id, source_id)`, `(capture_version_id, source_id)` on reviews, and `(capture_version_id, source_id)` on jobs each reference `(id, source_id)` on capture versions. This prevents cross-source pointers.
5. Backfill every readable legacy material record under the normalization/size policy; assign sequence 1, calculate hash, set source current pointers, and link review/job records. Report skipped legacy payloads concisely and leave them blocked from current-version reads.
6. Move all in-scope writers/readers to the version helper, then retain legacy raw material only as a read-only compatibility adapter for explicitly deferred consumers. Never write a new readable payload to it.
7. Do not make new capture-version links `NOT NULL` until every referenced legacy row is backfilled or deliberately retained as a documented compatibility exception.

## Tasks / Subtasks

- [x] Define and migrate the immutable source-capture model (AC: 1, 2, 3)
  - [x] Add the capture-version table, `sources.currentCaptureVersionId`, version ordering, SHA-256 validation, per-kind payload constraints, tombstone fields, indexes, and same-source composite foreign keys in `src/db/schema.ts`.
  - [x] Generate the next forward-only Drizzle migration/snapshot/journal entry, then add reviewed manual SQL for the ordered backfill and pointer/reference conversion. Do not edit historical migrations.
  - [x] Backfill readable legacy `raw_source_material` rows as initial versions under the stated normalization/size policy; set each safe source current pointer and compatible Facebook review/extraction job reference without deleting legacy material in the same migration.
  - [x] Preserve source community/default trust constraints and Story 3.1's fail-closed retrieval/search behavior.

- [x] Centralize capture-version creation and safe metadata validation (AC: 1, 2)
  - [x] Add a Knowledge-owned, server-only capture-version helper (for example `src/features/knowledge/source-captures.ts`) that applies the specified normalization, computes SHA-256, validates discriminated typed metadata, appends a version, selects it current, and emits concise audits in the caller transaction.
  - [x] Reject empty material; enforce the per-kind limits and never truncate a migrated legacy payload silently. Do not use `any` or accept arbitrary metadata JSON as safe.
  - [x] Reuse the existing capture-cache hashing/sanitization concepts where appropriate, but keep canonical source provenance in the application PostgreSQL database through Drizzle.
  - [x] Ensure traveler/public and general safe-source read models omit raw payload and operator-only metadata. Explicitly authorized, server-only operator review/extraction helpers may retrieve one capture version by ID and return only their typed allowed fields.

- [x] Convert source intake and Facebook capture to append-only behavior (AC: 1, 2)
  - [x] Update `submitTravelSourceForAiReading` and batch intake so readable operator submissions atomically create a source and its initial capture version rather than a mutable material row.
  - [x] Refactor `updateQueuedFacebookSourceRawText` into a version-append operation while preserving advisory locks, canonical-URL duplicate handling, correlation-token replay protection, queue limits, and discovered-post behavior.
  - [x] Queue unreadable Facebook sources without a readable capture version; only a confirmed visible-browser preview creates one and selects it current.
  - [x] Update Facebook review/admin/extraction target joins to read the exact current or review-linked capture version. Recapture/reopen must set the capture workflow back to queued without clearing or changing a prior version's content/metadata.
  - [x] Keep browser profile data local to the operator machine. Persist only `innerText` from the confirmed visible post container; do not use `innerHTML`, `textContent`, DOM-recursive fallback text, hidden/network data, or diagnostics as persisted capture text. Never persist cookies, tokens, passwords, local storage, HTML, profile data, provider payloads, or unsafe metadata values.

- [x] Freeze legacy extraction compatibility on exact versions (AC: 1)
  - [x] Update legacy extraction-job enqueue/read paths so a job resolves and stores a capture-version ID before raw text is read; downstream extraction must read that exact version rather than whichever version later becomes current.
  - [x] Preserve existing source locking, authorization-before-raw-read, safe errors, and legacy job behavior until Story 3.4 replaces the job protocol.
  - [x] Do not add the Stories 3.4-3.6 job stage model, leases, fencing, or retry redesign.

- [x] Implement bounded retention eligibility and execution (AC: 3)
  - [x] Add a server-only retention service and `knowledge:source-retention` script with `--dry-run|--execute`, `--actor-user-id`, and `--actor-email`; verify the supplied actor exists and matches before mutation.
  - [x] Select candidates with database-side, bounded queries; lock/recheck each candidate in the tombstone transaction before clearing its payload and, when applicable, current pointer.
  - [x] Preserve the version identity/hash/timestamps plus the required concise audit data, while removing payload/file/metadata. Make repeated executions no-ops for already tombstoned or now-ineligible artifacts.
  - [x] Do not surface raw capture or retention controls to traveler UI. Any admin control must use explicit Vietnamese copy, keyboard accessibility, visible focus, and a text destructive confirmation.

- [x] Add migration and behavior coverage (AC: 1, 2, 3)
  - [x] Extend source-intake, Facebook capture/review/admin/script, extraction-worker, and search tests for the versioned contract.
  - [x] Add focused retention tests for time boundary, dependency blockers, raw-content deletion, audit safety, dry run, and idempotency.
  - [x] Keep the existing tests that prove Story 3.1 search/indexing remains fail-closed.
  - [x] Add CRLF/NFC normalization, per-kind payload-limit, oversized legacy migration, same-source-FK, and terminal-review/job tombstone coverage.

### Review Findings

- [x] [Review][Patch] Sanitize legacy capture metadata during migration [drizzle/migrations/0039_premium_the_hood.sql:52]
- [x] [Review][Patch] Enforce the discriminated safe-metadata schema at runtime [src/features/knowledge/source-captures.ts:40]
- [x] [Review][Patch] Require an authorized operator or service actor for retention [src/features/knowledge/source-captures.ts:106]
- [x] [Review][Patch] Block retention for unbackfilled active extraction jobs [src/features/knowledge/source-captures.ts:151]
- [x] [Review][Patch] Fence Facebook extraction work to its exact capture version [src/features/knowledge/extraction-jobs.ts:200]
- [x] [Review][Patch] Validate older drafts against the capture version that produced them [src/features/knowledge/review.ts:600]
- [x] [Review][Patch] Make legacy text normalization match the capture contract [drizzle/migrations/0039_premium_the_hood.sql:50]
- [x] [Review][Patch] Report and block oversized legacy payloads rather than silently skipping them [drizzle/migrations/0039_premium_the_hood.sql:57]

### Raw-material consumer inventory

All new readable writes use capture versions. Before implementation completion, classify each remaining `raw_source_material` consumer as migration-only compatibility, an authorized operator-only current-version read, or migrated in Story 3.2. No remaining consumer may select mutable current raw text.

| Consumer | Story 3.2 treatment |
| --- | --- |
| Generic source intake and batch intake | Migrate writer to create initial capture version. |
| Facebook capture, review, review-admin, and script | Migrate writer/reads to exact capture version; preserve historical versions on recapture. |
| Legacy extraction jobs and extraction | Store/read exact capture version before provider work. |
| Review approval leak checks and draft review | Migrate raw-content reads to an exact capture-version helper. |
| Source list title derivation and batch YouTube status | Migrate to operator-only current-version projections that exclude tombstoned payloads. |
| YouTube capture and review/admin paths | Migrate writes/reads to capture versions in this story, preserving its 120,000-character structured-evidence limit and existing operator-only policy. Do not adopt AD-10's historical mandatory-approval wording. |

## Developer Guardrails

### Existing behavior to replace, not preserve

- `raw_source_material.source_id` is unique, so the current design stores one mutable material row per source. That cannot satisfy append-only captures. [Source: `src/db/schema.ts:276-304`]
- `updateQueuedFacebookSourceRawText` overwrites raw text and metadata in place. Convert this write to an append while retaining its locking and duplicate protections. [Source: `src/features/knowledge/facebook-capture.ts:195-357`]
- Facebook recapture/reopen currently clears `raw_text` and `raw_metadata`. Remove that destructive behavior; prior confirmed captures remain immutable until eligible retention deletes them. [Source: `src/features/knowledge/facebook-capture-review.ts:308-454`]
- Legacy extraction jobs currently identify material by `sourceId`. Freeze an exact capture version in the compatibility path now; the new durable job lifecycle is deferred to Story 3.4. [Source: `src/features/knowledge/extraction-jobs.ts:28-86`]

### Must preserve

- `isKnowledgeCardTravelerEligible` intentionally returns false until Story 3.3 supplies valid bounded evidence/retrieval metadata. Do not relax it or revive search documents. [Source: `_bmad-output/implementation-artifacts/spec-3-1-ai-first-knowledge-card-state-model.md:31-41`]
- Source kind/default checks: Facebook and YouTube remain community, unverified, non-official, and non-partner unless a separate source-policy action changes them. [Source: `src/db/schema.ts:238-273`; `_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md:164-187`]
- Knowledge owns source/capture/version writes through server-side feature entrypoints; use audited mutations and do not export generic cross-feature persistence helpers. [Source: `_bmad-output/project-context.md:42-48`; `ARCHITECTURE-SPINE.md:89-130`]
- Capture remains an operator-controlled Playwright operations tool, never a public route, traveler action, or unattended mass crawler. [Source: `ARCHITECTURE-SPINE.md:152-166`; `docs/facebook-capture-operations.md`]
- Raw capture content, operator-only metadata, provider payloads, and audit details must never enter traveler bundles or UI. [Source: `ARCHITECTURE-SPINE.md:552-565`; `EXPERIENCE.md:206-220`]
- Preserve Facebook advisory locks, canonical URL normalization, duplicate detection, bounded discovered-post queueing, safe audit summaries, and current confirmation flow. [Source: `src/features/knowledge/facebook-capture.ts:157-459`]
- Preserve strict TypeScript, `server-only` boundaries, Drizzle ownership, Next.js modular-monolith structure, and Vietnamese-first UI. [Source: `_bmad-output/project-context.md:25-80`]

### Likely files

| File | Required change / preservation |
| --- | --- |
| `src/db/schema.ts` | Add immutable capture versions, current pointer, compatibility foreign keys, constraints/indexes, and retention-safe schema. Preserve source/card/job constraints and Story 3.1 state model. |
| `drizzle/migrations/0039_*.sql` and `drizzle/migrations/meta/*` | Generate a forward-only migration, snapshot, and journal update. Backfill safely and non-escalatingly. |
| `src/features/knowledge/source-captures.ts` (new) | Central typed append/current-selection/retention service; server-only Knowledge ownership. |
| `src/features/knowledge/actions.ts` | Initial operator source submission creates first capture version atomically and returns only safe source data. |
| `src/features/knowledge/sources.ts` | Normalize input into a capture-version payload; preserve existing limits, canonicalization, and trust defaults. |
| `src/features/knowledge/batch-intake.ts` | Use the capture append path; do not alter seed eligibility semantics. |
| `src/features/knowledge/facebook-capture.ts` | Append confirmed versions instead of updating mutable raw material; preserve locks/cache correlation/duplicate behavior. |
| `src/features/knowledge/facebook-capture-review.ts` | Link reviews to exact capture versions; recapture must not erase historical content. |
| `src/features/knowledge/facebook-capture-review-admin.ts` and admin capture pages | Read versioned operator-only data only; label current capture and use state-aware recapture wording. |
| `src/features/knowledge/extraction-jobs.ts` and `src/features/knowledge/extraction.ts` | Freeze/read exact capture version for the legacy compatibility pipeline; do not implement new job orchestration. |
| `src/features/knowledge/youtube-capture.ts` and `src/features/knowledge/youtube-capture-review-admin.ts` | Append/read capture versions with the YouTube-specific 120,000-character limit; preserve operator-only policy. |
| `src/features/knowledge/review-approval-core.ts` and `src/features/knowledge/review.ts` | Move raw-content privacy/safety checks to an exact capture-version reader. |
| `scripts/facebook-capture.ts` | Call append-version behavior while retaining local-profile and operator-confirmation boundaries. |
| `scripts/knowledge-source-retention.ts` (new, if a script is used) | Explicit dry-run/execute retention command; no request-path execution. |
| `tests/knowledge-source-intake.test.ts`, `tests/facebook-capture*.test.ts`, `tests/knowledge-extraction-worker.test.ts` | Convert mutable expectations to immutable version assertions. |
| `tests/knowledge-source-capture-retention.test.ts` (new) | Cover retention eligibility, blockers, deletion/audit safety, and idempotency. |

### Out Of Scope

- Bounded evidence records, evidence backfill, and retrieval eligibility changes (Story 3.3).
- One durable source-version job per version, queue stages, leasing, fencing, and recovery (Stories 3.4-3.6).
- Independent judging, publication policy, relation/conflict handling, recommendation queue, and source-removal propagation (Stories 3.7-3.10).
- Traveler-visible Facebook quote/link behavior. The unresolved Facebook content-reuse policy means all capture versions remain operator-only.
- Any new approval-gated lifecycle. Epic 3 is AI-first, not an approval queue.

## Testing Requirements

- Initial readable operator submission creates one immutable version with deterministic SHA-256, safe metadata, and a selected current pointer.
- Confirmed recapture appends a second version and preserves the first version's text/hash/metadata unchanged; the current pointer changes atomically.
- Empty/abandoned/failed Facebook capture creates no readable version; queued source behavior remains recoverable.
- Metadata containing cookies, tokens, passwords, local storage, HTML, hidden data, profile data, or provider payloads is rejected/removed and never appears in audits, safe read models, or traveler data.
- A legacy extraction job freezes and reads its linked capture version even after a later recapture selects a different current version.
- Legacy raw-material migration produces versioned records without promoting cards or enabling search/retrieval.
- Retention retains an artifact at 179 days; at 180 days it tombstones only an eligible inactive artifact, removes raw payload/file/metadata, preserves identity/hash/timestamps and concise audit data, and clears the current pointer only when it targets that artifact.
- Retention skips active-card, reviewable-card, actionable-review, active-job, unknown-dependency, and all cases whose removal state cannot be proven safe.
- Dry run has no write effects; repeated execute is idempotent.
- Normal travelers cannot query or mutate raw capture/version data.

Run focused tests first, then the complete checks:

```bash
pnpm test:run tests/knowledge-source-intake.test.ts tests/facebook-capture.test.ts tests/facebook-capture-review.test.ts tests/facebook-capture-reject-action.test.ts tests/facebook-capture-review-admin.test.ts tests/facebook-capture-script.test.ts tests/knowledge-extraction-worker.test.ts tests/knowledge-source-capture-retention.test.ts tests/knowledge-search.test.ts
pnpm lint
pnpm typecheck
pnpm build
```

Before running integration tests, configure safe separate `DATABASE_URL` and `DATABASE_URL_TEST` values as required by the test environment. Vitest global setup migrates and resets `DATABASE_URL_TEST`; do not apply ordinary migrations to an unspecified environment as test verification.

Generate the next migration and snapshot locally, then add its reviewed manual data-conversion SQL:

```bash
pnpm db:generate
```

Production/staging migration execution is a separate deployment operation and must use an explicitly selected environment. Do not run `db:reset` as ordinary verification. `pnpm capture-cache:migrate` applies only to the separate capture-cache store and does not migrate canonical product source versions.

## Previous Story Intelligence

- Story 3.1 completed with a conservative migration and fail-closed retrieval. Its follow-up review fix bounded indexing worker candidates with SQL `LIMIT` before in-memory eligibility filtering. Keep retention scans and any worker-facing selection bounded at the database boundary. [Source: `_bmad-output/implementation-artifacts/spec-3-1-ai-first-knowledge-card-state-model.md:35-52`]
- Story 3.1's migration pattern is forward-only, conservative, and records concise mapping outcomes. Follow the same pattern: migrate compatibility data safely, do not delete raw legacy data before references have moved, and never escalate legacy knowledge state. [Source: `drizzle/migrations/0038_ai_first_knowledge_card_state_model.sql`; `_bmad-output/implementation-artifacts/spec-3-1-ai-first-knowledge-card-state-model.md:37-41`]

## Git Intelligence

- `d4fed2d Fix: bound knowledge indexing batches` is the current baseline; preserve its bounded selection behavior.
- `658af34 Feat: add AI-first knowledge card states` establishes the direct predecessor contract.
- `14e3ca0 feat: add cache-first capture archive` provides stable hashing, payload sanitization, artifact identity, and replay concepts, but it uses a separate operational database and is not canonical application provenance.
- `9708f99 Fix: retain YouTube evidence across video windows` demonstrates recent sensitivity around capture/evidence retention. Review YouTube capture consumers for compatibility with the general source-version contract; do not introduce a Facebook-only abstraction that blocks later sources.

## References

- Epic and ACs: [_bmad-output/planning-artifacts/epics.md:291-365](../planning-artifacts/epics.md)
- Epic contract and dependencies: [_bmad-output/implementation-artifacts/epic-3-context.md:23-71](epic-3-context.md)
- Immutable Facebook capture and job contract: [_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md:152-166](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md), [423-471](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/ARCHITECTURE-SPINE.md)
- Pipeline data and retention design: [_bmad-output/planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md:36-58](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md), [193-205](../planning-artifacts/architecture/architecture-xuyenviet-2026-07-04/community-knowledge-solution-design.md)
- PRD collection/privacy/retention requirements: [_bmad-output/planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md:148-175](../planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md), [244-254](../planning-artifacts/prds/prd-xuyenviet-2026-07-04/prd.md)
- UX privacy/admin requirements: [_bmad-output/planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md:45-52](../planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md), [135-138](../planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md), [190-220](../planning-artifacts/ux-designs/ux-xuyenviet-2026-07-05/EXPERIENCE.md)
- Project constraints: [_bmad-output/project-context.md:25-104](../project-context.md)

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- Story context created from the revised AI-first Epic 3 artifacts and current implementation baseline `d4fed2d`.
- `pnpm db:generate` completed before manual ordered backfill SQL review.
- Focused source-version suite: 14 files, 148 tests passed.
- `pnpm lint`, `pnpm typecheck`, and `pnpm build` passed.
- Full `pnpm test:run` has four unrelated pre-existing AI Ask expectation failures in `tests/ai-usage-events.test.ts` and `tests/answer-context.test.ts`; Story 3.2 changed no AI Ask code.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story 3.2 resolves the capture-version storage, migration, compatibility, and retention boundaries needed before Story 3.3 evidence work.
- Added immutable, normalized, SHA-256-addressed source capture versions with source-local ordering, current pointers, restricted same-source foreign keys, and conservative legacy material backfill.
- Moved intake, Facebook, YouTube, review, draft review, suggestions, and legacy extraction reads/writes to versioned operator-only capture paths. A legacy extraction job freezes its version before provider work.
- Added server-only, actor-verified 180-day Facebook retention with bounded candidate selection, source locking, fail-closed dependency checks, tombstones, concise audits, dry-run, and idempotency.
- Preserved Story 3.1 fail-closed traveler eligibility and did not add the Story 3.4-3.6 job lifecycle.

### File List

- `_bmad-output/implementation-artifacts/3-2-create-immutable-source-capture-versions-and-retention-boundaries.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `drizzle/migrations/0039_premium_the_hood.sql`
- `drizzle/migrations/meta/0039_snapshot.json`
- `drizzle/migrations/meta/_journal.json`
- `package.json`
- `scripts/knowledge-source-retention.ts`
- `src/db/schema.ts`
- `src/features/knowledge/actions.ts`
- `src/features/knowledge/batch-intake.ts`
- `src/features/knowledge/extraction-jobs.ts`
- `src/features/knowledge/extraction.ts`
- `src/features/knowledge/facebook-capture-review-admin.ts`
- `src/features/knowledge/facebook-capture-review.ts`
- `src/features/knowledge/facebook-capture.ts`
- `src/features/knowledge/review-approval-core.ts`
- `src/features/knowledge/review.ts`
- `src/features/knowledge/source-captures.ts`
- `src/features/knowledge/sources.ts`
- `src/features/knowledge/suggestions.ts`
- `src/features/knowledge/youtube-capture-review-admin.ts`
- `src/features/knowledge/youtube-capture.ts`
- `tests/helpers/source-captures.ts`
- `tests/facebook-capture-approve-all-action.test.ts`
- `tests/facebook-capture-extraction-action.test.ts`
- `tests/facebook-capture-reject-action.test.ts`
- `tests/facebook-capture-review-admin.test.ts`
- `tests/facebook-capture-review.test.ts`
- `tests/facebook-capture.test.ts`
- `tests/knowledge-batch-source-intake.test.ts`
- `tests/knowledge-draft-extraction.test.ts`
- `tests/knowledge-draft-review.test.ts`
- `tests/knowledge-extraction-worker.test.ts`
- `tests/knowledge-source-capture-retention.test.ts`
- `tests/knowledge-source-intake.test.ts`
- `tests/knowledge-source-suggestions.test.ts`
- `tests/youtube-capture-review-admin.test.ts`
- `tests/youtube-capture.test.ts`

### Change Log

- 2026-07-21: Implemented immutable source capture versions, safe migration/backfill, exact-version compatibility reads, and server-only retention. Story remains in progress pending unrelated full-suite AI Ask failures.
- 2026-07-22: Code review patches hardened metadata migration and validation, retention authorization/dependency checks, exact-version extraction fencing, legacy normalization/reporting, and recapture-safe raw leak detection.
