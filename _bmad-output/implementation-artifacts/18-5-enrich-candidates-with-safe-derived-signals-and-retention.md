---
story_id: 18-5
status: ready-for-dev
created: 2026-08-09
epic: 18
---

# Story 18.5: Enrich Candidates With Safe Derived Signals and Retention

## Story

As an operator,
I want candidate context that is useful for later triage without retaining unsafe source content,
so that Discovery can rank URLs while protecting privacy and Knowledge boundaries.

## Acceptance Criteria

1. **Given** a canonical Discovery candidate is eligible for enrichment, **when** Discovery reads documented YouTube API data, **then** it retains only bounded safe video/channel metadata, discovery identity, and allowed aggregate fields needed for triage.
   - Popularity and channel fields are ranking signals only; they never establish correctness or credibility.

2. **Given** Discovery implementation chooses a search or enrichment mechanism, **when** code and dependency boundaries are reviewed, **then** it uses only documented YouTube Data API capabilities.
   - It introduces no Playwright/direct browser scraping, undocumented API, transcript scraping, video download, media persistence, or second Gemini path.

3. **Given** comment information is used for triage, **when** Discovery derives comment signals, **then** it strips or neutralizes links, instruction-like text, excessive content, PII, and unsupported markup before model use.
   - It persists only sanitized derived signals, never raw comments, evidence, capture material, source bundles, or traveler-visible content.

4. **Given** candidate/audit records and derived comment signals age past their policy retention, **when** retention processing runs, **then** candidate, audit, and dedupe metadata use the policy-controlled retention with 180 days as the initial default.
   - Derived comment signals expire on the shorter policy-controlled TTL while concise required audit remains safe.

5. **Given** focused unit and serial integration tests run, **when** they cover canonicalization, many-results-per-query appearances, cross-query dedupe, prior-capture lookup isolation, lease/revocation, safe comment handling, retention, and provider failures, **then** invalid or unsafe paths fail closed without Discovery-created Knowledge state.
   - Tests follow the project unit/integration database boundaries.

6. **Given** successful and failed search, enrichment, retry, retention, and telemetry paths persist Discovery records, **when** persistence-level safety tests inspect the resulting rows, **then** they prove raw comments, prompts/responses, provider payloads, transcripts, media, credentials, cookies, raw source material, evidence spans, and traveler content cannot be stored.
   - Only the bounded safe operational schema is retained.

## Tasks / Subtasks

- [ ] Add the minimal Discovery-owned enrichment and derived-signal persistence model (AC: 1, 3, 6)
  - [ ] Add the next sequential Drizzle migration after `0049_discovery_youtube_candidates.sql`, update `drizzle/migrations/meta/_journal.json`, and update `packages/database/src/schema.ts`; preserve every prior migration unchanged.
  - [ ] Extend `youtube_discovery_candidates` only with explicit bounded, nullable safe fields required for later triage: bounded title and description, channel ID/name, published timestamp, duration seconds, category ID, bounded tags, public counters, and a safe thumbnail reference only if it is a documented HTTPS YouTube thumbnail URL. Use DB checks for finite/non-negative counters, duration, field lengths, array cardinality/item lengths, canonical identifiers, and no control characters where text is retained.
  - [ ] Add a Discovery-owned derived-comment-signal table keyed to candidate and enrichment/ranking context. Persist only a closed signal enum, bounded count/score, `derivedAt`, and `expiresAt`; do not persist any comment text, commenter identity, thread ID, URL, timestamp, markup, arbitrary JSON, or model output.
  - [ ] Add an `enriched` ranking-history write linked to the candidate, run, policy version, and applicable appearance. Keep the existing per-candidate newest-20 history bound and the existing provenance foreign-key contract; do not add recommendation, review state, source ID, capture lifecycle, usage, or UI projection fields owned by later stories.

- [ ] Implement a bounded Worker-owned YouTube Data API enrichment adapter (AC: 1, 2)
  - [ ] Add a small provider adapter beside `packages/worker-domain/src/features/youtube-discovery/youtube-search.ts`, using native `fetch`, `URL`, `URLSearchParams`, the existing Worker-only `YOUTUBE_DATA_API_KEY`, caller `AbortSignal`, and no SDK/dependency.
  - [ ] Call only documented read endpoints required by this story: `videos.list` by candidate video ID with an explicit bounded `part` set for safe video metadata/statistics/content details, `channels.list` by the returned channel ID for bounded public statistics, and at most one `commentThreads.list` page with `videoId`, `part=snippet`, `textFormat=plainText`, fixed bounded `maxResults`, and no pagination or replies traversal.
  - [ ] Treat all provider data as untrusted. Validate exact required primitive shapes before use; ignore unavailable optional fields; reject malformed required responses, network/abort/non-2xx failures, and invalid candidate/video identity into the existing safe transient retry path without retaining remote body/error text.
  - [ ] Do not use `oembed`, HTML/browser access, captions, transcript endpoints, media download, OAuth-only owner data, Gemini, AI Gateway, or any capture code. `youtube:capture` remains manual and unscheduled.
  - [ ] Ensure no request URL, API key, provider body, raw comment, or provider error is logged, audited, returned in telemetry, or persisted.

- [ ] Derive comment signals before persistence or later AI use (AC: 3, 6)
  - [ ] Keep raw comment text in memory only for the duration of one adapter call. Normalize Unicode/control whitespace, decode no markup, strip links/URLs, discard unsupported markup and instruction-like/prompt-injection patterns, redact direct contact/identifier patterns, enforce a small per-comment character cap and a fixed total sample cap, then discard the input text.
  - [ ] Produce only a closed, deterministic set of aggregate signals suitable for later triage, such as `recent_discussion`, `stale_or_changed_warning`, `practical_question_demand`, `creator_responsiveness`, `commercial_risk`, and `contradictory_discussion`. Do not persist a sanitized text sample or infer factual truth from any signal.
  - [ ] If comments are disabled, empty, malformed, or unavailable, continue enrichment with no derived comment signals when safe; use the transient retry path only for provider-stage failures that prevent the bounded enrichment contract. No comment condition may create Knowledge state or block canonical candidate identity.

- [ ] Persist enrichment and run it under existing Discovery fences (AC: 1, 3, 5, 6)
  - [ ] Extend `packages/database/src/youtube-discovery/index.ts`; do not create a generic repository. Reuse the active run claim, current-policy/proposal checks, terminal Audit boundary, and rollback-on-guard-loss pattern from `persistYoutubeDiscoveryCandidates(...)`.
  - [ ] Select a bounded number of canonical candidates needing enrichment for the currently claimed enabled query run. Recheck the active lease, current enabled policy, and linked enabled proposal immediately before every external provider call and every enrichment/derived-signal/history write. A lost claim is `contended`; policy or proposal revocation cancels through the existing one-terminal-audit path and writes no later Discovery data.
  - [ ] Keep provider calls outside short database transactions. If a fence is lost after provider work, discard the in-memory result. Persist a candidate's safe metadata, replacement derived signals, expiration, and `enriched` history atomically under the guarded transaction.
  - [ ] Preserve Story 18.4 search behavior: a valid empty result page completes; canonical candidate dedupe and appearances remain intact; Discovery has no direct import/query of Knowledge tables and no stored Knowledge link.

- [ ] Add policy-controlled retention processing to the finite Worker capability (AC: 4, 5, 6)
  - [ ] Add a bounded retention operation in `packages/database/src/youtube-discovery/` and invoke it from the existing finite `youtube-discovery` Worker poll only. It must not create a continuous loop, a scheduler, a separate Worker capability, or request-serving execution.
  - [ ] Read retention values from the persisted current policy, not constants. The established initial defaults are `retentionDays: 180` and `commentSignalTtlDays: 30`; preserve domain/schema validation that the comment TTL is shorter than candidate retention.
  - [ ] Delete expired derived signals independently by `expiresAt`. For expired candidate retention, remove only Discovery-owned candidate graph records in referentially safe order and preserve the concise required Audit history. Do not delete or modify Knowledge records, run terminal audits, policy versions, query proposals, or any non-Discovery data.
  - [ ] Retention writes must be bounded, idempotent, policy/fence-safe, emit only safe operational audit/telemetry summaries, and tolerate no-work. A failed retention pass must not partially delete a candidate graph or cause a raw-value audit entry.

- [ ] Verify privacy, provider, fence, and retention boundaries (AC: 1-6)
  - [ ] Add DB-free unit tests for provider request construction, allowed endpoint/parameter sets, API-key non-disclosure, strict response validation, metadata bounds, comment plain-text sanitization, link/instruction/PII/markup removal, signal-only output, comments-disabled/empty handling, and no raw/provider field in returned persistence shapes.
  - [ ] Add serial PostgreSQL integration tests with local `resetTestDatabase()` setup for guarded enrichment persistence, `enriched` history provenance/bounding, cross-run candidate preservation, revocation/lease loss after provider return, and one terminal audit only.
  - [ ] Add retention integration tests proving derived signals expire at the shorter policy TTL; candidate graph cleanup occurs only after policy retention; required audit remains concise/safe; retention is idempotent; and foreign Knowledge/source/capture tables are neither read nor mutated.
  - [ ] Add source-level/schema regressions that fail if Discovery stores prohibited raw comments, prompts/responses, provider JSON/errors, transcripts, media, credentials, cookies, raw source material, evidence spans, traveler data, or a Knowledge source link.
  - [ ] Run focused `pnpm exec vitest run --project unit <files>` and `pnpm exec vitest run --project integration <files>` selections, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`. Do not use the `pnpm test:unit -- --run <files>` wrapper for focused selection; it runs the configured project. Record any unavailable `DATABASE_URL_TEST` or unrelated baseline failure exactly.

## Dev Notes

### Scope and sequence

- Stories 18.1-18.4 are complete. Extend, rather than replace, the existing Discovery policy/query/run aggregate, finite Worker poll, native-fetch provider seam, PostgreSQL lease/fence semantics, `system-youtube-discovery` attribution, and Audit boundary.
- Story 18.4 already owns canonical video identity, `youtube_discovery_candidates`, appearances, `discovered` history, fenced candidate persistence, documented `search.list`, and the Knowledge-owned capture eligibility port. Preserve those contracts exactly.
- This story owns safe video/channel enrichment, deterministic derived comment signals, bounded retention, and their safety evidence. Story 19 owns AI Gateway triage, recommendations, candidate decisions, and Knowledge intake handoff. Story 20 owns API/UI control tower projections and controls.

### Architecture and ownership guardrails

- Discovery is URL-only. Never write, link, query, or import `sources`, `source_capture_versions`, ingestion jobs, evidence, cards, source bundles, lifecycle/publication state, traveler identity/content, or a Knowledge source ID. The existing typed `YoutubeCaptureEligibilityPort` is the only Knowledge interaction and is unchanged by this story.
- Candidate metadata and comment signals are untrusted operational ranking input only. They are not evidence, facts, verification, credibility, publication eligibility, traveler content, or authority to invoke Gemini.
- Use `youtube_discovery_*` names for Discovery persistence. Drizzle owns the schema and one new sequential migration. Do not add tables for triage recommendation, mutable candidate decisions, channel blocking, query blocking, UI read models, hard budget/quota reservations, or generic jobs/providers.
- Use the existing `recordAuditEvent` boundary. Audit truncation is not sanitization: raw unsafe material must be excluded before an audit input is constructed.
- Preserve PostgreSQL ordering and isolation conventions in `packages/database/src/youtube-discovery/index.ts`: active lease/current policy/proposal guards decide each durable write; provider work remains outside the transaction; a guard failure rolls back the candidate graph write before the separate cancellation audit is committed.

### Existing files to update

- `packages/database/src/schema.ts`: currently defines the policy retention values and the minimal candidate/appearance/ranking graph. Add only Story 18.5 safe metadata, signal, and retention constraints.
- `drizzle/migrations/0049_discovery_youtube_candidates.sql`: is the current migration baseline. Add a new migration; never edit this applied migration.
- `packages/database/src/youtube-discovery/index.ts`: owns current policy, run claims, candidate persistence, fences, retry, and terminal audit. Add narrow enrichment/retention operations here.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts`: owns the finite poll and its 240-second abortable external-work boundary. Extend its real execution path without changing planning or turning a poll into a loop.
- `packages/worker-domain/src/features/youtube-discovery/youtube-search.ts`: establishes native-fetch, URL construction, bounded result parsing, and no-provider-payload retention. Reuse its conventions; a dedicated enrichment adapter is preferable to overloading search parsing.
- `apps/worker/src/adapters.ts`: remains the only Worker configuration/composition boundary. Reuse `YOUTUBE_DATA_API_KEY`; do not add a credential name or expose it beyond Worker configuration.
- `tests/youtube-discovery-candidates.integration.test.ts` and `tests/youtube-discovery-execution.integration.test.ts`: establish serial reset, claims, policy/proposal revocation, safe terminal audits, concurrent candidate dedupe, and compatibility isolation. Extend these patterns or add focused sibling tests.

### Documented YouTube Data API contract

- `videos.list`, `channels.list`, and `commentThreads.list` are documented read endpoints. They require `part`; each supports an `id` or video/channel filter as applicable. `commentThreads.list` accepts `videoId`, `textFormat=plainText`, and `maxResults` up to 100. Use one fixed bounded page with no pagination or reply traversal. [Source: https://developers.google.com/youtube/v3/docs/videos/list] [Source: https://developers.google.com/youtube/v3/docs/channels/list] [Source: https://developers.google.com/youtube/v3/docs/commentThreads/list]
- Provider fields are availability-dependent. Missing optional public metadata is not proof of a candidate defect. A non-2xx, malformed required structure, timeout, or transport failure must use the existing safe transient retry behavior without persisting provider detail.
- The established Worker rollout requirement remains: `YOUTUBE_DATA_API_KEY` must be nonblank and restricted for documented API use; quota/billing and safe provider-failure monitoring must be validated before Discovery is enabled in production.

### Testing requirements

- Unit tests are infrastructure-free and must not read `DATABASE_URL`, `DATABASE_URL_TEST`, migrate Drizzle, or connect to PostgreSQL.
- Integration tests use `DATABASE_URL_TEST`, remain serial, and every suite requiring clean tables calls `resetTestDatabase()` in local setup. Do not restore a global reset hook.
- Keep provider fixtures synthetic and bounded. Never put live keys, copied provider payloads, real comment content, or user material into source fixtures or snapshots.
- Test outcomes, not implementation-only calls: no provider call after fence/revocation; no post-provider persistence after lease loss; no raw comment storage after sanitization; no partial cleanup on retention failure; no Discovery-created Knowledge state.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 18.5]
- [Source: _bmad-output/implementation-artifacts/epic-18-context.md#Requirements & Constraints and Cross-Story Dependencies]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-3, AD-5, AD-6, AD-7, and AD-8]
- [Source: _bmad-output/implementation-artifacts/18-4-discover-canonical-youtube-candidates-safely.md#Dev Notes]
- [Source: packages/database/src/schema.ts#youtubeDiscoveryPolicyVersions, youtubeDiscoveryCandidates, youtubeDiscoveryAppearances, and youtubeDiscoveryRankingHistory]
- [Source: packages/database/src/youtube-discovery/index.ts#persistYoutubeDiscoveryCandidates and guardYoutubeDiscoveryCandidateWrite]
- [Source: packages/worker-domain/src/features/youtube-discovery/execution.ts#runYoutubeDiscoveryPoll]
- [Source: packages/worker-domain/src/features/youtube-discovery/youtube-search.ts#searchYoutubeVideos]
- [Source: docs/proposals/ai-first-youtube-discovery.md#Candidate Enrichment and Acceptance Invariants]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis and validation completed 2026-08-09.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story readiness reconciles the Epic 18 acceptance criteria, Discovery architecture spine, Story 18.4 candidate/fence implementation, current schema/migration sequence, Worker composition, provider documentation, policy TTL defaults, and project test boundaries.
- No implementation, migration, provider credential, external provider call, database reset, test execution, or commit was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/18-5-enrich-candidates-with-safe-derived-signals-and-retention.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
