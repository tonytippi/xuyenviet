---
title: 'Enrich Discovery candidates with safe derived signals and retention'
type: 'feature'
created: '2026-08-09'
status: 'done'
baseline_revision: '38ad3552ed0dfd172656170c125b4e9435e0e489'
review_loop_iteration: 0
followup_review_recommended: true
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
warnings: [oversized]
---

<intent-contract>

## Intent

**Problem:** Canonical Discovery candidates have no bounded video/channel context, safe comment-derived ranking signals, or policy-controlled data lifecycle. This prevents later triage while retaining no raw provider or source material.

**Approach:** Extend the existing fenced Discovery candidate graph with strictly validated YouTube Data API enrichment, deterministic aggregate-only comment signals, and finite Worker-owned retention using persisted policy values.

## Boundaries & Constraints

**Always:** Discovery remains URL-only and accesses Knowledge only through the existing `YoutubeCaptureEligibilityPort`. Provider work is native `fetch`, bounded, Worker-only, and uses only documented `videos.list`, `channels.list`, and one plain-text `commentThreads.list` page. Durable writes remain guarded by the claimed lease, enabled current policy, and enabled proposal; provider results are discarded on guard loss. Persist only bounded safe metadata and closed derived signals; provider bodies/errors, comments, prompts, media, transcript, credentials, traveler content, evidence, and Knowledge links are excluded before any log, audit, telemetry, return value, or database write. Retention is finite, bounded, idempotent, fence-safe, and reads values from the persisted policy.

**Block If:** A necessary safe metadata field, audit-target predicate, or database constraint cannot be represented through a forward-only Discovery-owned migration without touching prior migrations, generic Audit ownership, or Knowledge tables.

**Never:** Scrape/browser access, undocumented endpoints, captions/transcripts, download media, invoke Gemini/capture, add SDKs/configuration/schedulers/workers, create recommendations/review/UI state, query/import Knowledge tables, modify existing migrations, or retain arbitrary JSON/text samples.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|---------------|----------------------------|----------------|
| Enrichment | Claimed enabled run and canonical candidate | Validated bounded metadata, aggregate-only signals, and `enriched` provenance history persist atomically | Guard loss rolls back durable graph writes and follows existing cancellation path |
| Provider response | Missing optional metadata or empty/comments-disabled page | Valid candidate metadata persists; no signal rows when no usable comments | Other malformed, non-2xx, abort, transport, or identity mismatch enters generic transient retry without remote details |
| Comment input | Raw plain-text comments | In-memory normalization, URL/markup/instruction/contact removal, bounded deterministic closed signals only | Raw input discarded before return/persistence |
| Retention | Enabled policy and expired signals/candidates | Signals expire by TTL; candidate graph and Discovery-targeted audit delete only after policy cutoff | Disabled policy, lost fence/lock, or no work causes no later delete; unrelated Audit/Knowledge remain intact |

</intent-contract>

## Code Map

- `packages/database/src/schema.ts` -- Discovery policy/candidate/ranking graph; add only bounded enrichment and signal schema.
- `drizzle/migrations/0050_discovery_youtube_enrichment_retention.sql` and `drizzle/migrations/meta/_journal.json` -- forward-only database contract.
- `packages/database/src/youtube-discovery/index.ts` -- claim guards, candidate persistence, terminal audit, enrichment persistence, and retention owner.
- `packages/worker-domain/src/features/youtube-discovery/youtube-enrichment.ts` -- native-fetch documented provider adapter and in-memory comment signal derivation.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` -- finite bounded enrichment and retention execution under existing abort/retry flow.
- `apps/worker/src/adapters.ts` -- existing Worker-only API-key composition seam, without new configuration.
- `tests/youtube-discovery-*.test.ts` -- synthetic provider, ownership, unit, and serial integration coverage.

## Tasks & Acceptance

**Execution:**
- [x] `packages/database/src/schema.ts`, `drizzle/migrations/0050_discovery_youtube_enrichment_retention.sql`, and migration journal -- add nullable, bounded candidate video/channel fields; closed derived-signal table with expiry/provenance; safe checks/indexes; preserve current graph and all previous migrations.
- [x] `packages/database/src/youtube-discovery/index.ts` -- select bounded claimed-run candidates, atomically persist metadata/replaced signals/`enriched` history under existing guards, retain newest 20 history rows, and implement singleton-fenced bounded retention in safe graph deletion order.
- [x] `packages/worker-domain/src/features/youtube-discovery/youtube-enrichment.ts` -- call only allowed documented endpoints with exact bounded params; validate untrusted primitive response shapes; derive signal enum/count/score only after in-memory sanitization; expose no raw values.
- [x] `packages/worker-domain/src/features/youtube-discovery/execution.ts` and `apps/worker/src/adapters.ts` -- execute enrichment after candidate discovery and bounded retention within the existing finite 240-second poll, preserving existing search, eligibility, retry, cancellation, and configuration contracts.
- [x] `tests/youtube-discovery-enrichment.test.ts` and relevant existing Discovery unit tests -- verify endpoint construction, strict validation, safe metadata caps, comments-disabled/empty continuation, sanitization, aggregate-only output, and prohibited persistence shapes.
- [x] `tests/youtube-discovery-enrichment.integration.test.ts` and relevant existing Discovery integration tests -- use local `resetTestDatabase()` to verify guarded atomic writes, history/provenance bounds, cross-run preservation, revocation/lease loss, a single terminal audit, retention order/cutoffs/idempotency/fencing, and Audit/Knowledge isolation.

**Acceptance Criteria:**
- Given a canonical candidate is eligible, when Worker enrichment succeeds, then only bounded safe video/channel metadata, identity, closed comment signals, and ranking provenance persist.
- Given provider data is malformed, unavailable, aborted, non-2xx, or mismatches candidate identity, when enrichment runs, then no remote detail persists and existing transient retry behavior is used; only `commentsDisabled` continues as an empty page.
- Given comments contain links, markup, contact details, instruction-like content, or excessive text, when signals derive, then only bounded deterministic aggregate signals survive and no text sample or model output persists.
- Given records pass their policy retention cutoffs, when finite Worker retention runs under its enabled fence, then expired signals and Discovery-owned candidate graph/audit data clean up safely without touching unrelated Audit or Knowledge records.

## Spec Change Log

## Review Triage Log

### 2026-08-09 — Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 7 (high 2, medium 4, low 1)
- defer: 1 (medium 1)
- reject: 0
- addressed_findings:
  - `[high] [patch]` Preserve cancellation rather than retrying an already terminalized run, and fence every external search, eligibility, and enrichment request.
  - `[high] [patch]` Bound provider response bodies, signal-retention deletion, and thumbnail values at adapter and database boundaries.
  - `[medium] [patch]` Retain candidates by latest Discovery activity, recognize only the exact documented comments-disabled reason, and keep the new unit suite in the unit project.
  - `[medium] [defer]` `pnpm test:unit` retains one unrelated stale UI-class assertion in `tests/traveler-ui-foundation.test.ts:109`.

## Design Notes

The database owner, not the provider adapter, owns all candidate graph decisions. Keep provider calls outside short database transactions. The Worker reuses the claimed run's authoritative proposal/policy chain and delegates every durable mutation to the guarded database operation. Candidate graph cleanup order is signals, ranking history, appearances, then candidates because existing foreign keys restrict deletion.

## Verification

**Commands:**
- `pnpm exec vitest run --project unit tests/youtube-discovery-enrichment.test.ts tests/youtube-discovery-execution.test.ts tests/youtube-discovery-ownership.test.ts` -- expected: provider and ownership behavior passes without database configuration.
- `pnpm exec vitest run --project integration tests/youtube-discovery-enrichment.integration.test.ts tests/youtube-discovery-execution.integration.test.ts --maxWorkers=1 --no-file-parallelism` -- expected: serial PostgreSQL fence, persistence, and retention coverage passes.
- `pnpm lint` -- expected: no errors.
- `pnpm typecheck` -- expected: passes.
- `pnpm build` -- expected: passes.
- `git diff --check` -- expected: passes.

## Auto Run Result

- Status: done
- Summary: Added fenced documented-API candidate enrichment, aggregate-only derived comment signals, and finite policy-driven Discovery retention.
- Review: Independent review repaired cancellation/fence behavior, bounded provider and retention operations, response and thumbnail validation, and unit-test classification. A follow-up review is recommended because these repairs span Worker execution, database retention, migrations, and provider safety boundaries.
- Verification: Focused unit tests passed (10 tests); serial Discovery integration tests passed (44 tests); `pnpm typecheck`, `pnpm lint` with 0 errors and 45 pre-existing warnings, `pnpm build`, and `git diff --check` passed. `pnpm test:unit` passed 318 of 319 tests; the sole failure is the unrelated stale class assertion at `tests/traveler-ui-foundation.test.ts:109`.
- Residual risks: Apply migrations `0050` through `0052` before enabling the Worker and configure a restricted nonblank `YOUTUBE_DATA_API_KEY`. Keep Discovery disabled until provider quota and operational monitoring validation completes.
