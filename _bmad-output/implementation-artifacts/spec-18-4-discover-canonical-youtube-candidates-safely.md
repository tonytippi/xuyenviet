---
title: 'Discover canonical YouTube candidates safely'
type: 'feature'
created: '2026-08-09'
status: 'done'
baseline_revision: '98ecb6756e0599cb5a6d32ba2dafa4b818a2601f'
review_loop_iteration: 0
followup_review_recommended: false
context:
  - '/home/sonnh/projects/xuyenviet/_bmad-output/project-context.md'
warnings: []
---

<intent-contract>

## Intent

**Problem:** Discovery has no safe, canonical candidate graph or real documented YouTube search stage. YouTube URL acceptance and capture identity parsing also diverge across Knowledge intake, Worker, and scripts.

**Approach:** Establish one pure shared YouTube video canonicalizer, persist only deduplicated safe Discovery candidate context behind existing run fences, and use a bounded Worker-only YouTube Data API search adapter plus a Knowledge-owned prior-capture eligibility port.

## Boundaries & Constraints

**Always:** Accept only supported HTTPS individual-video URLs with `^[A-Za-z0-9_-]{6,20}$` IDs and normalize them to `https://www.youtube.com/watch?v=<video-id>`. Discovery writes only its candidate, appearance, and bounded rank-history records through its database owner, remains fenced by current enabled policy/proposal/lease state, and consumes Knowledge only through a closed typed port. Use native `fetch` only for documented `search.list`, safe fixed parameters, a nonblank Worker-only `YOUTUBE_DATA_API_KEY`, and no diagnostic data that discloses a credential, query, URL, provider body, or raw error.

**Block If:** The existing Knowledge capture representation cannot persist a durable exact compatibility key containing its capture method/version and payload-schema version without inventing a Discovery-owned compatibility rule; or an existing migration/schema constraint prevents a forward-only `0049` candidate graph.

**Never:** Create Knowledge sources/captures/jobs/evidence, link or query Knowledge tables from Discovery, invoke capture/Gemini, scrape/download/transcribe media, persist provider payloads/snippets/comments/transcripts/credentials/arbitrary JSON, add an SDK/service/scheduler/UI, or alter existing migrations.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Canonical URL | Allowed HTTPS watch or short URL | Shared `{ videoId, canonicalUrl }` | Reject credentials, port, fragment, duplicate `v`, unsupported host/path, malformed URL, and invalid IDs |
| Search result page | Structurally valid video results | Fixed documented request; unique valid IDs retain first result ordinal | Empty/fully filtered page completes with no writes |
| Provider failure | Timeout, network, non-2xx, malformed result structure | Existing transient retry path | Store no remote error/body or candidate data |
| Candidate persistence | Active enabled run and proposal | One candidate per video, one appearance per run/video, discovered history capped at 20 | Lost lease, disable, pause, or conflict is contended/cancelled with no later writes |
| Prior capture | Exact durable key matches | No reviewable Discovery candidate | Unavailable port fails closed to transient retry |
| Runtime capture compatibility | Process value or `.env.local`/`.env` value | Capture and Worker eligibility derive the same descriptor | Invalid resolution fails during owner-port construction |
| Legacy proposal-less run | Claimed run has no enabled proposal | Worker cancels before provider work | Never completes successful provider work |

</intent-contract>

## Code Map

- `packages/domain/src/index.ts` and new pure YouTube identity module -- shared canonical URL contract.
- `packages/database/src/admin-knowledge-intake.ts`, `packages/worker-domain/src/features/knowledge/capture-identity.ts`, `scripts/youtube-seed-urls.ts`, `scripts/youtube-capture.ts` -- existing parsing callers to converge.
- `packages/database/src/schema.ts`, `drizzle/migrations/0049_*.sql`, `drizzle/migrations/meta/_journal.json` -- Discovery candidate graph migration.
- `packages/database/src/youtube-discovery/index.ts` -- existing run claim/fence owner and new guarded candidate persistence.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` and `apps/worker/src/adapters.ts` -- finite Worker poll, search adapter, and owner-port composition.
- `packages/database/src/runtime-config.ts` and `scripts/db-env.ts` -- shared process and env-file configuration resolution for scripts and Worker-owned database adapters.
- `packages/worker-domain/src/features/knowledge/*` and Knowledge database owner -- durable compatibility key and safe eligibility port.
- `tests/youtube-discovery-*.test.ts`, `tests/admin-knowledge-intake.test.ts`, `tests/youtube-seed-urls.test.ts`, `tests/youtube-capture.test.ts` -- ownership, unit, and serial database verification.

## Tasks & Acceptance

**Execution:**
- [x] Shared/domain and existing URL callers -- export a pure canonicalizer; migrate every local YouTube parser while preserving non-YouTube intake behavior; add equivalence and rejection tests.
- [x] Knowledge-owned compatibility modules -- persist the exact durable capture compatibility components and publish an abortable closed eligibility port that exposes no Knowledge identifiers or metadata.
- [x] Discovery schema/migration -- add only candidates, appearances, and closed ranking history with canonical uniqueness, run-derived provenance, minimal indexes, and transactional twenty-row history cap.
- [x] Discovery persistence owner -- atomically upsert valid candidates and insert per-run appearances/history behind active-claim, policy, and proposal guards; never accept caller proposal provenance.
- [x] Worker Discovery feature and composition -- replace the no-provider stage with one pre-call fence, bounded documented `search.list` request/parser, eligibility lookup, post-call guarded persistence, and existing finish/retry behavior.
- [x] Tests -- serial candidate graph/fence and Knowledge eligibility coverage is complete with local `resetTestDatabase()` setup.

**Acceptance Criteria:**
- Given an allowed YouTube video URL reaches Knowledge or Discovery, when canonicalized, then all callers use the same pure exported validator and either return the exact canonical URL or reject before external work.
- Given active query runs return eligible distinct videos, when persisted concurrently or later, then each video has one canonical review candidate while each valid run retains its own appearance and bounded discovered history.
- Given a run is disabled, paused, stale, or its prior-capture lookup is unavailable, when a provider response arrives, then Discovery writes no unsafe or reviewable candidate data and follows the fenced cancellation/retry behavior.
- Given an exact Knowledge-owned durable compatibility key already exists, when Discovery checks a video, then the closed port returns `already_compatible` and no candidate is created without Discovery reading or storing Knowledge identity.
- Given capture compatibility is configured through process environment, `.env.local`, or `.env`, when capture and Worker eligibility initialize, then both derive the same exact descriptor; a claimed run with no enabled proposal is cancelled before provider work and cannot complete successfully.

## Spec Change Log

## Review Triage Log

### 2026-08-09 -- Review pass
- intent_gap: 0
- bad_spec: 0
- patch: 12 (high 5, medium 7, low 0)
- defer: 0
- reject: 0
- addressed_findings:
  - `[high] [patch]` Bounded provider and eligibility execution, durable compatibility, graph provenance, transactional stale-write rollback, and conservative legacy migration handling.
  - `[medium] [patch]` Rejected malformed percent encodings, enforced run/policy history provenance, unified capture/eligibility runtime configuration, and cancelled proposal-less runs before provider work.

## Auto Run Result

- Status: done
- Summary: Implemented Story 18.4's shared canonical YouTube video identity, safe candidate graph, fenced candidate persistence, documented Worker search stage, and Knowledge-owned prior-capture eligibility boundary.
- Review: Six synchronous independent adversarial and edge-case review passes identified and repaired transactional fence, compatibility, schema provenance, cancellation, and configuration issues. The final closure reviews found no actionable findings.
- Verification: Focused Story tests passed, including 18 unit tests and 69 serial PostgreSQL integration tests. `pnpm typecheck`, `pnpm lint` (0 errors; 43 pre-existing warnings), `pnpm build`, and `git diff --check` passed.
- Residual risks: Apply migration `0049_discovery_youtube_candidates` before deploying the Worker; configure a nonblank, restricted `YOUTUBE_DATA_API_KEY`; validate quota/billing and provider-failure monitoring; keep Discovery disabled until rollout validation is complete. Full unit execution retains one unrelated stale assertion in `tests/traveler-ui-foundation.test.ts`.
- Commit: not created; no commit was requested.

## Design Notes

The provider is intentionally a parser/request boundary, not a persistence owner. Persisted query text must be read from the locked run/proposal; the Worker cannot receive arbitrary query/endpoint values. Keep proposal provenance derived through `runId`, preserving the existing aggregate as the sole authority.

## Verification

**Commands:**
- `pnpm exec vitest run --project unit tests/youtube-video.test.ts tests/youtube-discovery-search.test.ts tests/youtube-discovery-ownership.test.ts tests/youtube-discovery-owner-port-composition.test.ts tests/youtube-discovery-execution.test.ts` -- passed: 5 files, 17 tests. Do not insert a second `--` before file paths; that runs the full configured unit project.
- `pnpm exec vitest run --project integration tests/youtube-discovery-candidates.integration.test.ts` -- passed: 1 serial file, 5 tests using `DATABASE_URL_TEST`.
- `pnpm lint` -- passed with 0 errors and 43 existing warnings.
- `pnpm typecheck` -- passed.
- `pnpm build` -- passed.
- `git diff --check` -- passed.
- `pnpm exec vitest run --project unit tests/youtube-capture.test.ts tests/youtube-discovery-search.test.ts tests/youtube-discovery-execution.test.ts tests/youtube-discovery-owner-port-composition.test.ts` -- passed: 3 configured unit files, 7 tests.
- `pnpm exec vitest run --project integration tests/youtube-discovery-candidates.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-capture.test.ts` -- passed: 3 serial integration files, 60 tests; includes durable normal-write compatibility, changed compatibility eligibility, migration-applied composite provenance rejection, deadline abort, and cancellation after provider completion before persistence.
- `pnpm exec vitest run --project unit tests/youtube-capture.test.ts tests/youtube-discovery-owner-port-composition.test.ts tests/youtube-discovery-search.test.ts tests/youtube-discovery-execution.test.ts` -- passed: 3 configured unit files, 7 tests.
- `pnpm exec vitest run --project integration tests/youtube-discovery-candidates.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-capture.test.ts --maxWorkers=1 --no-file-parallelism` -- passed: 3 serial integration files, 68 tests using `DATABASE_URL_TEST`; proves production-bound low/medium/high compatibility matching and conservative identifiable-v4-only migration backfill.
- `pnpm exec vitest run --project unit tests/youtube-discovery-runtime-config.test.ts tests/youtube-capture.test.ts tests/youtube-discovery-owner-port-composition.test.ts tests/youtube-discovery-search.test.ts tests/youtube-discovery-execution.test.ts` -- passed: 4 configured unit files, 8 tests; covers process and `.env.local`/`.env` precedence equivalence.
- `pnpm exec vitest run --project integration tests/youtube-discovery-candidates.integration.test.ts tests/youtube-discovery-execution.integration.test.ts tests/youtube-capture.test.ts --maxWorkers=1 --no-file-parallelism` -- passed: 3 serial integration files, 69 tests using `DATABASE_URL_TEST`; includes cancellation of a proposal-less Worker provider run before any search call.
