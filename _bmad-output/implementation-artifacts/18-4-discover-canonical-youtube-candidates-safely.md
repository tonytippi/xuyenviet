---
story_id: 18-4
status: ready-for-dev
created: 2026-08-08
epic: 18
---

# Story 18.4: Discover Canonical YouTube Candidates Safely

## Story

As an operator,
I want each useful YouTube search result represented once in Discovery while preserving where it was found,
so that I can review a deduplicated URL queue with query-specific discovery context.

## Acceptance Criteria

1. **Given** Discovery or Knowledge intake receives a documented HTTPS `youtube.com` or `youtu.be` individual-video URL, **when** canonicalization runs, **then** both use the same exported validator for allowed host/path forms and video-ID grammar.
   - It returns `https://www.youtube.com/watch?v=<video-id>` or rejects the input before provider or capture work.

2. **Given** one enabled query run calls documented YouTube Data API search, **when** it receives multiple eligible individual-video results, **then** it creates or updates one canonical Discovery candidate per distinct video ID.
   - It records a separate query/run appearance for every result, so one query can yield many candidates and one candidate can retain many appearances.

3. **Given** multiple query runs discover the same canonical video ID, **when** candidate persistence occurs concurrently or later, **then** only one canonical candidate remains reviewable while all safe appearances/history remain linked.
   - Duplicate candidates cannot create duplicate operator review work.

4. **Given** a candidate is found, enriched, or later triaged in separate runs, **when** its safe ranking context changes, **then** Discovery retains bounded ranking-history entries linked to the canonical candidate, query/run appearance, policy version, and timestamp.
   - Historical rank context contains no raw model output, comments, provider payloads, or Knowledge source link.

5. **Given** Discovery evaluates a candidate against existing Knowledge capture history, **when** it checks prior-capture eligibility, **then** it calls a Knowledge-owned safe lookup keyed by canonical video identity and applicable capture compatibility.
   - Discovery never queries Knowledge tables directly or stores a Knowledge source ID or link.

## Tasks / Subtasks

- [ ] Establish one shared canonical YouTube video URL contract (AC: 1)
  - [ ] Add an explicit exported canonicalizer in the existing shared domain boundary, returning a typed `{ videoId, canonicalUrl }` result or `null`; it must have no database, Worker, provider, or capture dependency.
  - [ ] Accept only HTTPS individual-video URLs on `youtube.com`, a `*.youtube.com` host explicitly supported by the existing intake contract, or `youtu.be`; reject credentials, ports, fragments, channel/playlist/shorts/embed/live paths, extra path segments, malformed percent-encoding, and unsupported hosts before any external call.
  - [ ] Preserve the established `^[A-Za-z0-9_-]{6,20}$` video-ID grammar and normalize every accepted input to exactly `https://www.youtube.com/watch?v=<video-id>` without tracking parameters.
  - [ ] Replace the local YouTube normalization in `packages/database/src/admin-knowledge-intake.ts`; migrate the capture/seed/capture-identity helpers only where they can delegate to the same contract without pulling database/provider code into the shared boundary. Do not leave a second acceptance grammar.
  - [ ] Preserve non-YouTube intake normalization exactly. `normalizeIntakeUrl(...)` must continue returning the existing safe hostname/kind shape for Facebook and generic URLs.

- [ ] Add the minimal Discovery-owned candidate graph (AC: 2-4)
  - [ ] Add closed schema values and tables only for: canonical candidate, query/run appearance, and bounded ranking-history records. Use `youtube_discovery_*` names and Drizzle as the sole schema/migration authority.
  - [ ] Candidate identity is the canonical video ID, protected by a database unique constraint. Persist the canonical URL and only bounded safe discovery fields required now: identity, creation/update timestamps, and explicitly bounded state needed by later triage/review. Do not add a Knowledge source ID, acceptance state, source lifecycle field, raw provider JSON, comments, transcripts, media, prompt/response, credentials, cookies, or arbitrary JSON.
  - [ ] Each appearance references exactly one candidate, one Discovery run, and the query proposal that owns that run. Preserve a safe result ordinal and discovery timestamp. Use uniqueness suitable for one result occurrence per run; do not collapse appearances merely because a candidate repeats across runs.
  - [ ] Ranking history references candidate, optional appearance where context exists, run, and policy version. Its payload must be a closed, bounded safe context appropriate for later deterministic ranking; no model-derived recommendation, score, raw response, comment, provider payload, or Knowledge link belongs in this story.
  - [ ] Add only indexes that serve canonical lookup, run/query appearance lookup, and chronological candidate history. Do not pre-create triage, review-action, channel, comment, retention, blocking, or UI read-model tables; Stories 18.5, 19, and 20 own those concerns.
  - [ ] Create the next sequential Drizzle migration after `0048_discovery_operator_priority_and_policy_transition`, update `drizzle/migrations/meta/_journal.json`, and verify the schema/migration match. Preserve all existing migrations unchanged.

- [ ] Implement fenced, idempotent candidate persistence (AC: 2-4)
  - [ ] Extend `packages/database/src/youtube-discovery/` with a narrow operation that accepts validated canonical search results for one active run and atomically upserts candidates, inserts appearances, and appends safe ranking-history records.
  - [ ] Lock/guard every write on run ID, `running` state, matching fencing token, and unexpired lease. Re-check current policy enablement and the linked proposal enabled state immediately before each candidate/appearance/history write; a disabled policy or paused proposal transitions through the existing cancellation path and writes no subsequent Discovery record.
  - [ ] Use conflict-safe candidate upsert plus independent appearance insertion so concurrent runs retain exactly one candidate and all valid appearances. A zero-row guarded write is `contended`, never a successful provider stage or candidate persistence result.
  - [ ] Keep the provider call outside the short persistence transaction. The Worker must perform the existing active-lease/current-enable fence immediately before the provider call and again before persistence; a lease lost while the provider is in flight must discard its returned results rather than write them.
  - [ ] Continue using `recordAuditEvent` for safe Worker terminal outcomes. Do not directly insert protected Audit/history/usage tables, and do not put query text, canonical URLs, provider response data, or result titles into an audit summary.

- [ ] Add a documented, bounded YouTube Data API search stage (AC: 2-3)
  - [ ] Add a small Worker-owned provider adapter behind a narrow internal port. It may call only the documented YouTube Data API v3 `GET https://www.googleapis.com/youtube/v3/search` endpoint for this story; do not add a client dependency, browser automation, scraping, transcript access, downloads, media persistence, channel/comment enrichment, AI Gateway, or Gemini path.
  - [ ] Build each request from the already persisted safe query text with `part=snippet`, `type=video`, bounded `maxResults` in `1..50`, and explicit Vietnam-oriented `regionCode=VN`, `relevanceLanguage=vi`, and `safeSearch=strict`. Do not paginate or accept caller-controlled endpoint/parameter values in this slice.
  - [ ] Read the API credential only in the Worker adapter/configuration boundary. It must be required and nonblank, never logged, persisted, returned through telemetry, or included in tests. Reuse the existing project `fetch` stack; do not add an SDK.
  - [ ] Treat provider responses as untrusted: validate exact expected structural fields, retain only valid `youtube#video` IDs that independently pass the shared canonicalizer, and ignore malformed/non-video/duplicate result entries. Do not retain snippets or the provider response in Story 18.4.
  - [ ] Classify network, non-2xx, malformed-response, and invalid-result outcomes into the existing safe transient retry path without storing remote error text. Preserve Story 18.2 retry/backoff/exhaustion and later-run independence behavior.
  - [ ] Replace the private no-provider execution seam in `packages/worker-domain/src/features/youtube-discovery/execution.ts` only with this bounded search stage. Keep one finite poll, at most one claimed run, and the existing safe `youtube.discovery` observation contract.

- [ ] Publish and use a Knowledge-owned prior-capture eligibility port (AC: 5)
  - [ ] Define a narrow domain contract that accepts canonical video identity plus the applicable capture compatibility version and returns only a closed safe eligibility result, for example `eligible | already_compatible | unavailable`. It must not expose source IDs, source URLs, capture IDs, timestamps, raw metadata, evidence, source state, or failure text.
  - [ ] Implement the port in the Knowledge/database owner using its own tables and existing capture compatibility helpers. Discovery calls the port through composition only; it must not import `sources`, `sourceCaptureVersions`, or any Knowledge repository/table.
  - [ ] Consult the safe result before persisting a search candidate. `already_compatible` must not create a reviewable Discovery candidate; `unavailable` must fail closed into the existing safe retry/error path rather than infer eligibility or read Knowledge directly.
  - [ ] Bind the production port in `apps/worker/src/adapters.ts` beside the existing owner-published planning ports. Keep the port bounded, abortable if it can wait, and test-injectable without exporting a generic cross-module database reader.

- [ ] Verify shared identity, ownership, fences, and safe persistence (AC: 1-5)
  - [ ] Add DB-free unit tests for every allowed URL form and rejection path; ensure canonicalizer equivalence across Knowledge intake, seed URL parsing, capture identity/canonicalization, and Discovery. Cover host case/trailing dot, tracking parameters, credentials, ports, duplicate `v`, extra path, playlists/channels/shorts/embed/live, malformed URLs, and video-ID boundaries.
  - [ ] Add DB-free provider-adapter tests asserting fixed documented request parameters, non-disclosure of API keys/provider body, malformed/non-video result filtering, repeated IDs within a response, safe transient classification, and no request when a run is already fenced/revoked.
  - [ ] Add serial PostgreSQL integration coverage with local `resetTestDatabase()` setup. Prove many results from one query create many appearances; concurrent/later runs for one video create one candidate and retain all appearances/history; a stale or revoked claimant cannot append any candidate/appearance/history after provider return; and a terminal run retains its one terminal audit.
  - [ ] Add ownership tests proving Discovery has no direct import/query of Knowledge tables and candidate/ranking rows contain no source link or prohibited raw/provider fields. Prove the Knowledge port returns only its closed safe shape and `already_compatible`/`unavailable` create no reviewable candidate.
  - [ ] Preserve Story 18.1 foundation, Story 18.2 lease/retry/terminal-audit, and Story 18.3 planning/scheduling/owner-port tests. Run focused `pnpm test:unit` and `pnpm test:integration` selections, then `pnpm lint`, `pnpm typecheck`, `pnpm build`, and `git diff --check`; record exact blockers rather than claiming unrun verification.

## Dev Notes

### Scope and sequence

- Stories 18.1-18.3 are complete. Reuse their Discovery policy/query/run aggregate, current-policy admission, Worker finite poll, PostgreSQL lease/fence semantics, system executor, and Audit boundary. Do not replace them or add a scheduler.
- This story owns shared video canonicalization, documented search, candidate identity, appearances, bounded rank context, and a Knowledge-owned compatibility lookup. Story 18.5 owns safe video/channel enrichment, derived comment signals, retention, and provider safety hardening. Epic 19 owns AI triage, deterministic recommendations, candidate decisions, and Knowledge intake handoff. Epic 20 owns control-tower UI and global-switch commands.
- The candidate is URL consideration only. It is not a source, capture, ingestion job, evidence, card, fact, publication state, or authorization to invoke Gemini.

### Existing code and required changes

- `packages/database/src/admin-knowledge-intake.ts#normalizeIntakeUrl` currently owns an inline YouTube parser. It must delegate to the shared canonicalizer while retaining generic/Facebook behavior and its current concurrent source duplicate protection.
- `packages/worker-domain/src/features/knowledge/capture-identity.ts#youtubeVideoId`, `scripts/youtube-seed-urls.ts`, and `scripts/youtube-capture.ts#canonicalizeYoutubeCaptureUrl` each contain overlapping local parsing. Reuse the one shared canonicalizer; do not let capture accept a form Discovery/intake rejects.
- `packages/database/src/schema.ts` currently ends Discovery persistence at policy/query/planning/run tables. The Story 18.4 candidate graph is a new schema/migration slice; the active journal ends at migration `0048`.
- `packages/database/src/youtube-discovery/index.ts` owns run claim/fence transitions. Candidate persistence must extend this owner and must use its active-claim guard, current policy/proposal checks, and Audit writer rather than a new repository or generic workflow abstraction.
- `packages/worker-domain/src/features/youtube-discovery/execution.ts` has a deliberately private no-provider stage. Replace it with the bounded real search stage while preserving finite poll behavior, safe observations, and test seams. `apps/worker/src/adapters.ts` is the production composition point for owner-published ports.

### Hard boundaries

- Discovery never writes or links `sources`, capture versions, ingestion jobs, evidence, cards, source bundles, lifecycle/publication state, or traveler data. It never invokes, schedules, enqueues, or retries `youtube:capture` or Gemini video analysis.
- Use only the documented YouTube Data API v3 `search.list` endpoint in this story. No Playwright, browser scraping, undocumented API, transcript scraper, video download, media persistence, comments, channel/video enrichment, second Gemini credential, or AI call is allowed.
- Persist only explicit bounded Discovery data. Never retain raw result/snippet content, provider payloads/errors, prompts/responses, transcripts, media, comments, credentials, cookies, raw source material, evidence spans, traveler identity/content, or a Knowledge source link. Audit truncation is not sanitization.
- Do not introduce hard budget/quota reservations, blocking/exclusion policy, a new service/package, generic provider/job framework, compatibility layer, API controller/UI, or a second scheduler.

### Provider implementation reference

- YouTube `search.list` requires `part=snippet`; setting `type=video` excludes channel and playlist resources. `maxResults` is limited to 0..50 by the documented API, so this story must use a positive bounded value no greater than 50. [Source: https://developers.google.com/youtube/v3/docs/search/list]
- `regionCode` and `relevanceLanguage` are ranking hints, not verification or geographic proof. `safeSearch=strict` is a result filter, not a content/evidence safety guarantee. Do not interpret any search field as truth or publication eligibility.
- Use URL construction with `URL`/`URLSearchParams`, a bounded timeout/abort path, and a minimal response parser. Never interpolate query text into a URL string or log the full request URL because it contains the API key.

### Testing requirements

- Use `pnpm test:unit` only for infrastructure-free canonicalizer, parser, and provider-adapter tests. Unit tests must not read database URLs, migrate Drizzle, or connect to PostgreSQL.
- Use `pnpm test:integration` for candidate/appearance/history persistence, concurrent dedupe, lease/fence/revocation, and Knowledge-port behavior. Integration tests remain serial and any suite requiring clean tables must call `resetTestDatabase()` locally.
- Verify tests assert behavior rather than provider payload snapshots. Search fixtures must contain only synthetic safe IDs and must not include live credentials or copied provider output.

## Project Structure Notes

- Put reusable pure identity validation in the existing shared domain ownership boundary and export it through the existing barrel. Keep Discovery policy/domain contracts in `packages/domain/src/youtube-discovery/`, Discovery persistence in `packages/database/src/youtube-discovery/`, and Worker execution in `packages/worker-domain/src/features/youtube-discovery/`.
- Schema changes live in `packages/database/src/schema.ts`, one new sequential `drizzle/migrations/0049_*.sql` migration, and the Drizzle journal. Do not edit prior migrations.
- The Knowledge compatibility implementation stays in a Knowledge-owned database/domain module. Discovery consumes only its explicit typed port through Worker composition.

## References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 18 and Story 18.4]
- [Source: _bmad-output/implementation-artifacts/epic-18-context.md#Requirements & Constraints, Technical Decisions, and Cross-Story Dependencies]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-xuyenviet-youtube-discovery-2026-08-06/ARCHITECTURE-SPINE.md#AD-1 through AD-8]
- [Source: _bmad-output/implementation-artifacts/18-1-establish-discovery-ownership-policy-and-audit-foundation.md#Scope and sequencing]
- [Source: _bmad-output/implementation-artifacts/18-2-execute-fenced-scheduled-discovery-runs.md#Required implementation patterns]
- [Source: _bmad-output/implementation-artifacts/18-3-manage-system-and-operator-query-proposals.md#Architecture and safety guardrails]
- [Source: packages/database/src/admin-knowledge-intake.ts#normalizeIntakeUrl]
- [Source: packages/database/src/youtube-discovery/index.ts#claimNextYoutubeDiscoveryRun and cancelYoutubeDiscoveryRunIfDisabled]
- [Source: packages/worker-domain/src/features/youtube-discovery/execution.ts#runYoutubeDiscoveryPoll]
- [Source: docs/proposals/ai-first-youtube-discovery.md#Ownership And Execution Boundary and Acceptance Invariants]
- [Source: https://developers.google.com/youtube/v3/docs/search/list]

## Dev Agent Record

### Agent Model Used

gpu4ai/gpt-5.6-terra

### Debug Log References

- BMad create-story context analysis and validation completed 2026-08-08.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- Story validation passed: Epic requirements, Discovery architecture, prior Stories 18.1-18.3, canonicalization drift, existing Worker fence model, migration sequence, and documented YouTube Data API search contract are reconciled.
- No implementation, migration, provider credential, external provider call, database reset, test execution, or commit was performed while creating this story.

### File List

- _bmad-output/implementation-artifacts/18-4-discover-canonical-youtube-candidates-safely.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
